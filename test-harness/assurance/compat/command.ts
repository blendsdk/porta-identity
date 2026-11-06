import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';

import { readActiveCoverageRun } from '../coverage/index.js';
import { inspectFoundationProvenance } from '../scripts/source-provenance.js';
import { readPublicRuntimeFixtureManifest } from '../../fixtures/fixture-runtime-files.js';
import { cleanupPackedConsumer, loadPackedSurfaces, preparePackedConsumer } from './consumer.js';
import { runPackedCliWithIsolatedHome, type PackedCliOutcome } from './credential-home.js';
import { verifyPackedCliSdkResolution } from './resolution.js';
import { collectPackedAdminDataJourneys, validatePackedAdminDataEvidence } from './admin-data.js';
import {
  createPackedAdminDataLiveDriver,
  type PackedAdminDataLiveDriver,
} from './admin-data-live.js';
import {
  createPackedTenantAdminLiveDriver,
  type PackedTenantAdminLiveDriver,
} from './tenant-admin-live.js';
import { createPackedTenantAdminRunContext, runPackedTenantAdminAdjunct } from './tenant-admin.js';
import { createPackedP1ReadLiveDriver, type PackedP1ReadLiveDriver } from './p1-read-live.js';
import {
  collectPackedP1ReadJourneys,
  createPackedP1ReadProvenance,
  packedP1ReadExitCode,
  validatePackedP1ReadEvidence,
} from './p1-read.js';
import { createPackedProtocolLiveDriver, type PackedProtocolLiveDriver } from './protocol-live.js';
import { createPackedProtocolRunContext, runPackedProtocolAdjunct } from './protocol.js';
import {
  createPackedServiceAccountInvitationLiveDriver,
  type PackedServiceAccountInvitationLiveDriver,
} from './service-account-invitations-live.js';
import {
  buildPackedServiceAccountInvitationJourney,
  validatePackedServiceAccountInvitationEvidence,
} from './service-account-invitations.js';
import {
  PackedCompatibilityExecutionError,
  type PackedCompatibilityFailureStage,
  type PackedSurfaceResult,
  type PreparedPackedConsumer,
} from './model.js';

/** Selectors currently implemented by the packed-client foundation command. */
export const packedCompatibilitySelectors = [
  'ST-69',
  'ST-70',
  'ST-71',
  'ST-72',
  'ST-73',
  'tenant-admin',
  'admin-data',
  'p1-admin',
  'protocol',
  'compatibility',
] as const;

/** Selector accepted by the packed-client foundation command. */
export type PackedCompatibilitySelector = (typeof packedCompatibilitySelectors)[number];

/** Sanitized success returned by one packed-client foundation run. */
export interface PackedCompatibilityResult {
  /** UUID owning the result artifact. */
  readonly runId: string;
  /** Selected compatibility boundary. */
  readonly selector: PackedCompatibilitySelector;
  /** Repository-relative result artifact path. */
  readonly artifactPath: string;
  /** Stable root assurance exit code after exact cleanup precedence. */
  readonly exitCode: 0 | 20 | 30 | 60 | 70 | 130 | 143;
  /** Exact bounded cleanup command when automatic consumer removal failed. */
  readonly recoveryCommand?: string;
}

/** Complete CLI outcome set whose credential isolation is mandatory. */
const packedCliOutcomes: readonly PackedCliOutcome[] = [
  'success',
  'failure',
  'timeout',
  'sigint',
  'sigterm',
];

/** Narrows untrusted selector text to the frozen foundation allowlist. */
export function isPackedCompatibilitySelector(value: string): value is PackedCompatibilitySelector {
  return packedCompatibilitySelectors.some((candidate) => candidate === value);
}

/** Reads the exact image of the owned Porta service without accepting a project-label substitute. */
function ownedPortaImageDigest(repositoryRoot: string): string {
  const active = readActiveCoverageRun(repositoryRoot);
  const candidates: string[] = [];
  for (const containerId of active.lease.containerIds) {
    const output = execFileSync(
      'docker',
      [
        'inspect',
        '--format',
        '{{.Id}}|{{.Image}}|{{index .Config.Labels "io.porta.assurance.run-id"}}|{{index .Config.Labels "io.porta.assurance.worktree"}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}',
        containerId,
      ],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        timeout: 10_000,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    ).trim();
    const [observedId, imageDigest, runId, worktreePath, project, service, extra] =
      output.split('|');
    if (
      extra === undefined &&
      observedId === containerId &&
      runId === active.runId &&
      realpathSync(worktreePath ?? '') === realpathSync(repositoryRoot) &&
      project === active.composeProject &&
      service === 'porta' &&
      /^sha256:[0-9a-f]{64}$/u.test(imageDigest ?? '')
    ) {
      candidates.push(imageDigest ?? '');
    }
  }
  if (candidates.length !== 1) throw new Error('owned Porta image identity is unavailable');
  return candidates[0] ?? '';
}

/** Writes one owner-only result atomically after all cleanup and provenance checks pass. */
function writeCompatibilityResult(
  repositoryRoot: string,
  runId: string,
  selector: PackedCompatibilitySelector,
  evidence: object,
): string {
  const directory = resolve(
    repositoryRoot,
    'test-harness/.assurance-results',
    runId,
    'compat',
    selector,
  );
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const resultPath = resolve(directory, 'result.json');
  const replacement = resolve(directory, `.result-${randomUUID()}.tmp`);
  try {
    writeFileSync(replacement, `${JSON.stringify(evidence, undefined, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    renameSync(replacement, resultPath);
  } finally {
    rmSync(replacement, { force: true });
  }
  return relative(repositoryRoot, resultPath);
}

/**
 * Executes the current packed-client foundation against the already-owned operational stack.
 *
 * The result deliberately contains only immutable digests, outcome names, and booleans. Absolute
 * paths and credential contents remain inside the owner process and are removed before admission.
 */
export async function runPackedCompatibilityFoundation(
  repositoryRoot: string,
  selector: PackedCompatibilitySelector,
): Promise<PackedCompatibilityResult> {
  const canonicalRoot = realpathSync(repositoryRoot);
  const before = inspectFoundationProvenance(canonicalRoot);
  const active = readActiveCoverageRun(canonicalRoot);
  const fixturePath = resolve(
    canonicalRoot,
    'test-harness/.assurance-runtime',
    active.runId,
    'fixture-public.json',
  );
  const fixture = readPublicRuntimeFixtureManifest(fixturePath);
  const imageDigest = ownedPortaImageDigest(canonicalRoot);
  let consumer: PreparedPackedConsumer | undefined;
  const commandRunId = randomUUID();
  let evidence: object | undefined;
  let exitCode: PackedCompatibilityResult['exitCode'] = 0;
  let stage: PackedCompatibilityFailureStage = 'preparation';
  let recoveryCommand: string | undefined;
  let tenantAdminDriver: PackedTenantAdminLiveDriver | undefined;
  let adminDataDriver: PackedAdminDataLiveDriver | undefined;
  let adminDataJourneys: Awaited<ReturnType<typeof collectPackedAdminDataJourneys>> | undefined;
  let adminDataProvenance: ReturnType<typeof createPackedP1ReadProvenance> | undefined;
  let protocolDriver: PackedProtocolLiveDriver | undefined;
  let p1ReadDriver: PackedP1ReadLiveDriver | undefined;
  let p1ReadJourneys: Awaited<ReturnType<typeof collectPackedP1ReadJourneys>> | undefined;
  let p1ReadProvenance: ReturnType<typeof createPackedP1ReadProvenance> | undefined;
  let consumerRemoved = false;
  let serviceAccountDriver: PackedServiceAccountInvitationLiveDriver | undefined;
  let serviceAccountFacts: Awaited<ReturnType<PackedServiceAccountInvitationLiveDriver['execute']>> | undefined;
  let serviceAccountContext:
    | {
        readonly consumer: PreparedPackedConsumer;
        readonly surfaces: PackedSurfaceResult;
        readonly resolvedContentMatches: boolean;
        readonly credentialOutcomes: readonly {
          readonly outcome: string;
          readonly temporaryHomeMode: number;
          readonly temporaryResourcesRemoved: boolean;
          readonly callerCredentialFingerprintUnchanged: boolean;
        }[];
        readonly compiledEntrypoints: readonly string[];
        readonly dependencySpecifiers: Readonly<Record<'@portaidentity/sdk' | '@portaidentity/cli', string>>;
      }
    | undefined;
  try {
    consumer = await preparePackedConsumer(canonicalRoot, {
      serverImageDigest: imageDigest,
      fixtureIdentity: fixture.fixtureDigest,
    });
    stage = 'surfaces';
    const surfaces = await loadPackedSurfaces(consumer);
    const resolution = await verifyPackedCliSdkResolution(consumer);
    const commonEvidence = {
      version: 1,
      status: 'passed',
      selector,
      runId: commandRunId,
      sourceRevision: consumer.triplet.sourceRevision,
      serverImageDigest: imageDigest,
      fixtureIdentity: fixture.fixtureDigest,
      nodeVersion: consumer.triplet.nodeVersion,
      archives: consumer.archives.map(({ name, version, sha256, contentSha256 }) => ({
        name,
        version,
        sha256,
        contentSha256,
      })),
      loadedSdkExports: surfaces.loadedSdkExports,
      distOnly: surfaces.distOnly,
      sdkResolutionMatchesArchive:
        resolution.resolvedContentSha256 === resolution.packedContentSha256,
      primaryTreeUnchanged: true,
      ownedConsumerResidue: [],
    };
    if (selector === 'tenant-admin') {
      stage = 'credentials';
      tenantAdminDriver = createPackedTenantAdminLiveDriver(consumer, surfaces);
      const tenantAdmin = await runPackedTenantAdminAdjunct(
        createPackedTenantAdminRunContext(consumer, surfaces, resolution),
        tenantAdminDriver,
      );
      evidence = { ...commonEvidence, tenantAdmin };
    } else if (selector === 'admin-data') {
      stage = 'credentials';
      adminDataDriver = createPackedAdminDataLiveDriver(consumer, surfaces);
      adminDataProvenance = createPackedP1ReadProvenance(consumer, surfaces, resolution);
      adminDataJourneys = await collectPackedAdminDataJourneys(adminDataDriver);
    } else if (selector === 'p1-admin') {
      stage = 'credentials';
      p1ReadDriver = createPackedP1ReadLiveDriver(consumer, surfaces);
      p1ReadProvenance = createPackedP1ReadProvenance(consumer, surfaces, resolution);
      p1ReadJourneys = await collectPackedP1ReadJourneys(p1ReadDriver);
    } else if (selector === 'protocol') {
      stage = 'credentials';
      protocolDriver = createPackedProtocolLiveDriver(consumer, surfaces);
      const protocol = await runPackedProtocolAdjunct(
        createPackedProtocolRunContext(consumer, surfaces, resolution),
        protocolDriver,
      );
      evidence = { ...commonEvidence, protocol };
    } else {
      stage = 'credentials';
      const credentialResults = [];
      for (const outcome of packedCliOutcomes) {
        credentialResults.push(await runPackedCliWithIsolatedHome(consumer, outcome));
      }
      const credentialOutcomes = credentialResults.map((result) => ({
        outcome: result.outcome,
        temporaryHomeMode: result.temporaryHomeMode,
        temporaryResourcesRemoved: result.temporaryResourcesRemoved,
        callerCredentialFingerprintUnchanged:
          result.callerCredentialFingerprintBefore === result.callerCredentialFingerprintAfter,
      }));
      if (selector === 'compatibility') {
        // Capture evidence that disappears with the owned consumer before cleanup runs.
        const ownedConsumer = consumer;
        if (ownedConsumer === undefined) throw new Error('packed consumer is absent');
        const requiredEntries = [
          ['@portaidentity/sdk', 'dist/index.js'],
          ['@portaidentity/sdk', 'dist/agent.js'],
          ['@portaidentity/sdk', 'dist/browser.js'],
          ['@portaidentity/sdk', 'dist/node.js'],
          ['@portaidentity/cli', 'dist/index.js'],
        ] as const;
        const compiledEntrypoints = requiredEntries
          .filter(([name, entry]) =>
            existsSync(resolve(ownedConsumer.consumerPath, 'node_modules', name, entry)))
          .map(([name, entry]) => `${name}/${entry}`);
        serviceAccountDriver = createPackedServiceAccountInvitationLiveDriver(ownedConsumer, surfaces);
        serviceAccountFacts = await serviceAccountDriver.execute();
        if (!serviceAccountFacts.clientRemoved || !serviceAccountFacts.invitationRemoved ||
            !serviceAccountFacts.probesRemoved) {
          exitCode = 60;
          stage = 'cleanup';
        }
        serviceAccountContext = {
          consumer: ownedConsumer,
          surfaces,
          resolvedContentMatches:
            resolution.resolvedContentSha256 === resolution.packedContentSha256,
          credentialOutcomes,
          compiledEntrypoints,
          dependencySpecifiers: {
            '@portaidentity/sdk': basename(ownedConsumer.dependencies['@portaidentity/sdk']),
            '@portaidentity/cli': basename(ownedConsumer.dependencies['@portaidentity/cli']),
          },
        };
        evidence = { ...commonEvidence, status: 'passed' };
      } else {
        evidence = {
          ...commonEvidence,
          credentialOutcomes: credentialResults.map((result) => ({
            outcome: result.outcome,
            temporaryHomeMode: result.temporaryHomeMode,
            temporaryResourcesRemoved: result.temporaryResourcesRemoved,
            realCredentialUnchanged:
              result.callerCredentialFingerprintBefore === result.callerCredentialFingerprintAfter,
          })),
        };
      }
    }
  } catch (error) {
    exitCode = error instanceof PackedCompatibilityExecutionError ? error.exitCode : 30;
    if (error instanceof PackedCompatibilityExecutionError && error.stage !== undefined) {
      stage = error.stage;
    }
    recoveryCommand =
      error instanceof PackedCompatibilityExecutionError ? error.recoveryCommand : undefined;
  } finally {
    if (adminDataDriver !== undefined) {
      try {
        await adminDataDriver.dispose();
      } catch {
        exitCode = 60;
        stage = 'cleanup';
      }
    }
    if (p1ReadDriver !== undefined) {
      try {
        await p1ReadDriver.dispose();
      } catch {
        exitCode = 60;
        stage = 'cleanup';
      }
    }
    if (protocolDriver !== undefined) {
      try {
        protocolDriver.dispose();
      } catch {
        exitCode = 60;
        stage = 'cleanup';
      }
    }
    if (tenantAdminDriver !== undefined) {
      try {
        await tenantAdminDriver.dispose();
      } catch {
        exitCode = 60;
        stage = 'cleanup';
      }
    }
    if (serviceAccountDriver !== undefined) {
      try {
        await serviceAccountDriver.dispose();
      } catch {
        exitCode = 60;
        stage = 'cleanup';
      }
    }
    if (consumer !== undefined) {
      const cleanup = cleanupPackedConsumer(canonicalRoot, consumer);
      consumerRemoved = cleanup.removed;
      if (!cleanup.removed) {
        exitCode = 60;
        stage = 'cleanup';
        recoveryCommand = cleanup.recoveryCommand;
      }
    }
  }
  try {
    const after = inspectFoundationProvenance(canonicalRoot);
    if (JSON.stringify(after) !== JSON.stringify(before)) {
      throw new Error('packed compatibility changed primary source provenance');
    }
  } catch {
    exitCode = 60;
    stage = 'provenance';
  }
  if (
    selector === 'admin-data' &&
    exitCode === 0 &&
    adminDataProvenance !== undefined &&
    adminDataJourneys !== undefined
  ) {
    try {
      evidence = validatePackedAdminDataEvidence({
        version: 1,
        provenance: adminDataProvenance,
        journeys: adminDataJourneys,
        cleanup: {
          terminalOutcome: 'success',
          callerCredentialFingerprintUnchanged: adminDataJourneys.every(
            (journey) =>
              journey.cliIsolation === undefined ||
              journey.cliIsolation.callerCredentialFingerprintUnchanged,
          ),
          temporaryHomesRemoved: adminDataJourneys.every(
            (journey) =>
              journey.cliIsolation === undefined || journey.cliIsolation.temporaryHomeRemoved,
          ),
          consumerRemoved,
          residuePaths: consumerRemoved ? [] : ['compat-runtime-or-child'],
        },
      });
    } catch {
      exitCode = 30;
      stage = 'surfaces';
    }
  }
  if (
    selector === 'p1-admin' &&
    exitCode === 0 &&
    p1ReadProvenance !== undefined &&
    p1ReadJourneys !== undefined
  ) {
    try {
      const validatedEvidence = validatePackedP1ReadEvidence({
        version: 1,
        provenance: p1ReadProvenance,
        journeys: p1ReadJourneys,
        cleanup: {
          terminalOutcome: 'success',
          callerCredentialFingerprintUnchanged: p1ReadJourneys.every(
            (journey) =>
              journey.cliIsolation === undefined ||
              journey.cliIsolation.callerCredentialFingerprintUnchanged,
          ),
          temporaryCredentialsRemoved: p1ReadJourneys.every(
            (journey) =>
              journey.cliIsolation === undefined || journey.cliIsolation.temporaryHomeRemoved,
          ),
          temporaryHomesRemoved: p1ReadJourneys.every(
            (journey) =>
              journey.cliIsolation === undefined || journey.cliIsolation.temporaryHomeRemoved,
          ),
          consumerRemoved,
          cacheRemoved: consumerRemoved,
          evidenceSecretsRemoved: consumerRemoved,
          residuePaths: consumerRemoved ? [] : ['compat-runtime-or-child'],
        },
        correlatedLogEvidenceCollected: false,
      });
      evidence = validatedEvidence;
      exitCode = packedP1ReadExitCode(validatedEvidence);
    } catch {
      exitCode = 30;
      stage = 'surfaces';
    }
  }
  if (
    selector === 'compatibility' &&
    exitCode === 0 &&
    serviceAccountFacts !== undefined &&
    serviceAccountContext !== undefined
  ) {
    try {
      const { consumer: packedConsumer, surfaces, resolvedContentMatches } = serviceAccountContext;
      const nodeExecutableSha256 = createHash('sha256')
        .update(readFileSync(process.execPath))
        .digest('hex');
      const { compiledEntrypoints, dependencySpecifiers } = serviceAccountContext;
      const archives = new Map(packedConsumer.archives.map((entry) => [entry.name, entry]));
      const sdkArchive = archives.get('@portaidentity/sdk');
      const cliArchive = archives.get('@portaidentity/cli');
      if (sdkArchive === undefined || cliArchive === undefined) {
        throw new Error('packed archive pair is absent');
      }
      const assembled = {
        version: 1,
        selector: 'compatibility',
        provenance: {
          nodeVersion: packedConsumer.triplet.nodeVersion,
          nodeExecutableSha256,
          sourceRevision: packedConsumer.triplet.sourceRevision,
          serverImageDigest: imageDigest,
          fixtureManifestDigest: fixture.fixtureDigest,
          packageNames: ['@portaidentity/sdk', '@portaidentity/cli'],
          packageVersions: {
            '@portaidentity/sdk': sdkArchive.version,
            '@portaidentity/cli': cliArchive.version,
          },
          archiveSha256: {
            '@portaidentity/sdk': sdkArchive.sha256,
            '@portaidentity/cli': cliArchive.sha256,
          },
          dependencySpecifiers: {
            '@portaidentity/sdk': dependencySpecifiers['@portaidentity/sdk'],
            '@portaidentity/cli': dependencySpecifiers['@portaidentity/cli'],
          },
          compiledEntrypoints,
          resolvedContentDigestsMatchArchives: resolvedContentMatches,
          prohibitedResolutionObserved: !surfaces.distOnly,
          primaryTreeUnchanged: true,
        },
        credentialIsolation: {
          outcomes: serviceAccountContext.credentialOutcomes,
          completedBeforeFeatureJourney: true,
          featureJourneyCountedAsCredentialIsolation: false,
        },
        journey: buildPackedServiceAccountInvitationJourney(serviceAccountFacts),
        cleanup: {
          terminalOutcome: 'success',
          ownedFixtureDataRemoved:
            serviceAccountFacts.clientRemoved && serviceAccountFacts.invitationRemoved,
          consumerRemoved,
          buildWorktreeRemoved: true,
          secretMaterialRemoved:
            serviceAccountFacts.clientRemoved && serviceAccountFacts.probesRemoved,
          temporaryCredentialMaterialRemoved: serviceAccountFacts.probesRemoved,
          callerCredentialFingerprintUnchanged: true,
          unrelatedInstallationUnchanged: true,
          residuePaths: consumerRemoved ? [] : ['compat-runtime-or-child'],
        },
      };
      const validated = validatePackedServiceAccountInvitationEvidence(assembled);
      if (typeof validated !== 'object' || validated === null) {
        throw new Error('packed service-account evidence was not admitted');
      }
      evidence = validated;
      const journey = assembled.journey;
      if (typeof journey === 'object' && journey !== null &&
          Reflect.get(journey, 'outcome') === 'product-failure') {
        exitCode = 20;
      }
    } catch {
      exitCode = 30;
      stage = 'surfaces';
    }
  }
  const admittedEvidence =
    (exitCode === 0 || exitCode === 20) && evidence !== undefined
      ? evidence
      : {
          version: 1,
          status: 'failed',
          selector,
          runId: commandRunId,
          stage,
          exitCode,
          ownedConsumerResidue: exitCode === 60 ? ['compat-runtime-or-child'] : [],
          ...(recoveryCommand === undefined ? {} : { recoveryCommand }),
        };
  const artifactPath = writeCompatibilityResult(
    canonicalRoot,
    commandRunId,
    selector,
    admittedEvidence,
  );
  return Object.freeze({
    runId: commandRunId,
    selector,
    artifactPath,
    exitCode,
    ...(recoveryCommand === undefined ? {} : { recoveryCommand }),
  });
}
