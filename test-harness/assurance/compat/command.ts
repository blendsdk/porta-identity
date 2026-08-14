import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import { readActiveCoverageRun } from '../coverage/index.js';
import { inspectFoundationProvenance } from '../scripts/source-provenance.js';
import { readPublicRuntimeFixtureManifest } from '../../fixtures/fixture-runtime-files.js';
import { cleanupPackedConsumer, loadPackedSurfaces, preparePackedConsumer } from './consumer.js';
import { runPackedCliWithIsolatedHome, type PackedCliOutcome } from './credential-home.js';
import { verifyPackedCliSdkResolution } from './resolution.js';
import {
  createPackedTenantAdminLiveDriver,
  type PackedTenantAdminLiveDriver,
} from './tenant-admin-live.js';
import { createPackedTenantAdminRunContext, runPackedTenantAdminAdjunct } from './tenant-admin.js';
import { PackedCompatibilityExecutionError, type PreparedPackedConsumer } from './model.js';

/** Selectors currently implemented by the packed-client foundation command. */
export const packedCompatibilitySelectors = [
  'ST-69',
  'ST-70',
  'ST-71',
  'ST-72',
  'ST-73',
  'tenant-admin',
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
  readonly exitCode: 0 | 30 | 60 | 70 | 130 | 143;
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
  let stage: 'preparation' | 'surfaces' | 'credentials' | 'cleanup' | 'provenance' = 'preparation';
  let recoveryCommand: string | undefined;
  let tenantAdminDriver: PackedTenantAdminLiveDriver | undefined;
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
    } else {
      stage = 'credentials';
      const credentialResults = [];
      for (const outcome of packedCliOutcomes) {
        credentialResults.push(await runPackedCliWithIsolatedHome(consumer, outcome));
      }
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
  } catch (error) {
    exitCode = error instanceof PackedCompatibilityExecutionError ? error.exitCode : 30;
    recoveryCommand =
      error instanceof PackedCompatibilityExecutionError ? error.recoveryCommand : undefined;
  } finally {
    if (tenantAdminDriver !== undefined) {
      try {
        await tenantAdminDriver.dispose();
      } catch {
        exitCode = 60;
        stage = 'cleanup';
      }
    }
    if (consumer !== undefined) {
      const cleanup = cleanupPackedConsumer(canonicalRoot, consumer);
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
  const admittedEvidence =
    exitCode === 0 && evidence !== undefined
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
