import { z } from 'zod';

import type { PreparedPackedConsumer, PackedSurfaceResult } from './model.js';
import type { PackedCliSdkResolution } from './resolution.js';

/** Public clients supported by the packed tenant/admin adjunct. */
export type PackedTenantAdminClient = 'sdk' | 'cli';

/** Exact operations supported by each packed client in this adjunct. */
export type PackedTenantAdminOperation = 'list' | 'read' | 'update' | 'denied-update';

/** Sanitized CLI execution facts required for one packed journey. */
export interface PackedTenantAdminCliObservation {
  /** Process exit code after command completion. */
  readonly exitCode: number;
  /** Exact owner-only mode of the temporary home. */
  readonly temporaryHomeMode: number;
  /** Whether the temporary home was absent after cleanup. */
  readonly temporaryHomeRemoved: boolean;
  /** Whether the caller's real credential fingerprint remained unchanged. */
  readonly callerCredentialUnchanged: boolean;
}

/** Independently observed outcome of one packed-client operation. */
export interface PackedTenantAdminJourneyEvidence {
  /** Stable identifier binding the observation to one immutable requirement. */
  readonly id: string;
  /** Locally packed public client that executed the operation. */
  readonly client: PackedTenantAdminClient;
  /** Administrative operation exercised through that client. */
  readonly operation: PackedTenantAdminOperation;
  /** Authority profile used by the packed client. */
  readonly actor: 'full' | 'unprivileged';
  /** Authorization result observed at the public client boundary. */
  readonly observedResult: 'allowed' | 'forbidden';
  /** Stable alias of the target reported by the packed client. */
  readonly clientTargetId: string;
  /** Stable alias of the target seen by the independent observer. */
  readonly independentTargetId: string;
  /** Whether the independent before/after fingerprints differ. */
  readonly targetChanged: boolean;
  /** Foreign-tenant aliases detected in bounded client output. */
  readonly foreignTenantIdsObserved: readonly string[];
  /** Whether protected runtime credentials are absent from bounded output. */
  readonly outputRedacted: boolean;
  /** CLI-only process and credential isolation facts. */
  readonly cli?: PackedTenantAdminCliObservation;
}

/** Complete admitted evidence for packed SDK/CLI tenant/admin adjunct journeys. */
export interface PackedTenantAdminEvidence {
  /** Evidence schema version. */
  readonly version: 1;
  /** Clean source revision used for server and packed-client builds. */
  readonly sourceRevision: string;
  /** Content digest of the exact owned Porta image. */
  readonly serverImageDigest: string;
  /** Digest of the deterministic fixture manifest. */
  readonly fixtureIdentity: string;
  /** Content digests of the installed local SDK and CLI archives. */
  readonly archives: Readonly<Record<PackedTenantAdminClient, string>>;
  /** Observed package-resolution facts required before client execution. */
  readonly resolution: {
    /** Whether every SDK public entry resolved beneath its compiled distribution. */
    readonly sdkDistOnly: boolean;
    /** Whether the CLI executable resolved beneath its compiled distribution. */
    readonly cliDistOnly: boolean;
    /** Whether the CLI resolved the exact packed SDK content. */
    readonly cliUsesPackedSdk: boolean;
  };
  /** Admitted client and independent-observer results for the complete matrix. */
  readonly journeys: readonly PackedTenantAdminJourneyEvidence[];
  /** Whether source provenance remained unchanged throughout execution. */
  readonly primaryTreeUnchanged: boolean;
  /** Sanitized owned-resource residue remaining after cleanup. */
  readonly ownedResidue: readonly string[];
}

/** Provenance and package-resolution facts supplied by the packed-consumer owner. */
export interface PackedTenantAdminRunContext {
  /** Clean source revision used for server and packed-client builds. */
  readonly sourceRevision: string;
  /** Content digest of the exact owned Porta image. */
  readonly serverImageDigest: string;
  /** Digest of the deterministic fixture manifest. */
  readonly fixtureIdentity: string;
  /** Content digests derived from the prepared local archives. */
  readonly archives: Readonly<Record<PackedTenantAdminClient, string>>;
  /** Package-resolution facts derived from the installed consumer. */
  readonly resolution: PackedTenantAdminEvidence['resolution'];
  /** Whether source provenance remained unchanged before journey execution. */
  readonly primaryTreeUnchanged: boolean;
  /** Sanitized owned-resource residue present before journey execution. */
  readonly ownedResidue: readonly string[];
}

/** Sanitized result returned only by the packed public client executor. */
export interface PackedTenantAdminClientObservation {
  /** Stable identifier binding the observation to one immutable requirement. */
  readonly id: string;
  /** Locally packed public client that executed the operation. */
  readonly client: PackedTenantAdminClient;
  /** Administrative operation exercised through that client. */
  readonly operation: PackedTenantAdminOperation;
  /** Authority profile used by the packed client. */
  readonly actor: 'full' | 'unprivileged';
  /** Authorization result observed at the public client boundary. */
  readonly observedResult: 'allowed' | 'forbidden';
  /** Stable target alias selected by the packed client request. */
  readonly clientTargetId: string;
  /** Foreign-tenant aliases detected in bounded client output. */
  readonly foreignTenantIdsObserved: readonly string[];
  /** Whether protected runtime credentials are absent from bounded output. */
  readonly outputRedacted: boolean;
  /** CLI-only process and credential isolation facts. */
  readonly cli?: PackedTenantAdminCliObservation;
}

/** Independent raw or fixture-state observation of the selected target. */
export interface PackedTenantAdminTargetObservation {
  /** Stable target alias resolved by the independent observer. */
  readonly targetId: string;
  /** One-way digest of the independently observed target state. */
  readonly digest: string;
}

/** Driver whose client execution and independent observer are intentionally separate methods. */
export interface PackedTenantAdminJourneyDriver {
  /** Executes one exact requirement through the locally packed public client. */
  execute(
    requirement: PackedTenantAdminJourneyRequirement,
  ): Promise<PackedTenantAdminClientObservation>;
  /** Observes the target without trusting output from the packed public client. */
  observeTarget(
    requirement: PackedTenantAdminJourneyRequirement,
  ): Promise<PackedTenantAdminTargetObservation>;
  /** Restores the deterministic fixture after every attempted update operation. */
  reset(): Promise<void>;
}

/** Exact requirement passed to a packed-client journey driver. */
export interface PackedTenantAdminJourneyRequirement {
  /** Stable requirement identifier. */
  readonly id: string;
  /** Public client that must execute the operation. */
  readonly client: PackedTenantAdminClient;
  /** Administrative operation required by the case. */
  readonly operation: PackedTenantAdminOperation;
  /** Authority profile required by the case. */
  readonly actor: 'full' | 'unprivileged';
  /** Required authorization outcome. */
  readonly expectedResult: 'allowed' | 'forbidden';
  /** Whether independent observation must prove target mutation. */
  readonly expectedTargetMutation: boolean;
}

const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const archiveDigestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const revisionSchema = z.string().regex(/^[a-f0-9]{40}$/u);
const cliObservationSchema = z
  .object({
    exitCode: z.number().int(),
    temporaryHomeMode: z.number().int(),
    temporaryHomeRemoved: z.boolean(),
    callerCredentialUnchanged: z.boolean(),
  })
  .strict();
const journeySchema = z
  .object({
    id: z.string().min(1),
    client: z.enum(['sdk', 'cli']),
    operation: z.enum(['list', 'read', 'update', 'denied-update']),
    actor: z.enum(['full', 'unprivileged']),
    observedResult: z.enum(['allowed', 'forbidden']),
    clientTargetId: z.string().min(1),
    independentTargetId: z.string().min(1),
    targetChanged: z.boolean(),
    foreignTenantIdsObserved: z.array(z.string().min(1)),
    outputRedacted: z.boolean(),
    cli: cliObservationSchema.optional(),
  })
  .strict();
const evidenceSchema = z
  .object({
    version: z.literal(1),
    sourceRevision: revisionSchema,
    serverImageDigest: digestSchema,
    fixtureIdentity: digestSchema,
    archives: z.object({ sdk: archiveDigestSchema, cli: archiveDigestSchema }).strict(),
    resolution: z
      .object({
        sdkDistOnly: z.boolean(),
        cliDistOnly: z.boolean(),
        cliUsesPackedSdk: z.boolean(),
      })
      .strict(),
    journeys: z.array(journeySchema),
    primaryTreeUnchanged: z.boolean(),
    ownedResidue: z.array(z.string().min(1)),
  })
  .strict();

const clients: readonly PackedTenantAdminClient[] = ['sdk', 'cli'];
const operations: readonly PackedTenantAdminOperation[] = [
  'list',
  'read',
  'update',
  'denied-update',
];

/** Frozen SDK/CLI matrix used by the generic capability and checked by immutable specs. */
export const packedTenantAdminJourneyRequirements: readonly PackedTenantAdminJourneyRequirement[] =
  Object.freeze(
    clients.flatMap((client) =>
      operations.map((operation) =>
        Object.freeze({
          id: `packed-${client}-tenant-${operation}`,
          client,
          operation,
          actor: operation === 'denied-update' ? 'unprivileged' : 'full',
          expectedResult: operation === 'denied-update' ? 'forbidden' : 'allowed',
          expectedTargetMutation: operation === 'update',
        }),
      ),
    ),
  );

/**
 * Derives adjunct provenance only from the prepared local archives and observed package paths.
 *
 * Callers cannot provide archive identities independently of the prepared consumer. The CLI SDK
 * digest must match the SDK archive before any live journey is allowed to start.
 */
export function createPackedTenantAdminRunContext(
  consumer: PreparedPackedConsumer,
  surfaces: PackedSurfaceResult,
  resolution: PackedCliSdkResolution,
): PackedTenantAdminRunContext {
  const sdk = consumer.archives.find((archive) => archive.name === '@portaidentity/sdk');
  const cli = consumer.archives.find((archive) => archive.name === '@portaidentity/cli');
  if (sdk === undefined || cli === undefined || consumer.archives.length !== 2) {
    throw new Error('packed tenant/admin archives are incomplete');
  }
  if (resolution.resolvedContentSha256 !== sdk.contentSha256) {
    throw new Error('packed CLI does not resolve the prepared SDK archive');
  }
  return Object.freeze({
    sourceRevision: consumer.triplet.sourceRevision,
    serverImageDigest: consumer.triplet.serverImageDigest,
    fixtureIdentity: consumer.triplet.fixtureIdentity,
    archives: Object.freeze({ sdk: sdk.sha256, cli: cli.sha256 }),
    resolution: Object.freeze({
      sdkDistOnly: surfaces.distOnly,
      cliDistOnly: surfaces.cliBinPath.endsWith('/dist/index.js'),
      cliUsesPackedSdk: resolution.resolvedContentSha256 === resolution.packedContentSha256,
    }),
    primaryTreeUnchanged: true,
    ownedResidue: Object.freeze([]),
  });
}

/** Validates exact provenance, journey semantics, independent observation, and cleanup evidence. */
export function validatePackedTenantAdminEvidence(value: unknown): PackedTenantAdminEvidence {
  const parsed = evidenceSchema.safeParse(value);
  if (!parsed.success) {
    if (parsed.error.issues.some((issue) => issue.path.at(-1) === 'independentTargetId')) {
      throw new Error('independent target identity is required');
    }
    throw parsed.error;
  }
  const evidence = parsed.data;
  if (
    !evidence.resolution.sdkDistOnly ||
    !evidence.resolution.cliDistOnly ||
    !evidence.resolution.cliUsesPackedSdk
  ) {
    throw new Error('packed client resolution is not admitted');
  }
  if (!evidence.primaryTreeUnchanged) throw new Error('primary tree provenance changed');
  if (evidence.ownedResidue.length !== 0) throw new Error('owned residue remains');
  if (evidence.journeys.length !== packedTenantAdminJourneyRequirements.length) {
    throw new Error('packed tenant/admin journey matrix is incomplete');
  }

  for (const requirement of packedTenantAdminJourneyRequirements) {
    const matches = evidence.journeys.filter((journey) => journey.id === requirement.id);
    if (matches.length !== 1) throw new Error('packed tenant/admin journey identity is not unique');
    const journey = matches[0];
    if (
      journey === undefined ||
      journey.client !== requirement.client ||
      journey.operation !== requirement.operation ||
      journey.actor !== requirement.actor ||
      journey.observedResult !== requirement.expectedResult
    ) {
      throw new Error('packed tenant/admin journey result differs from its requirement');
    }
    if (journey.clientTargetId !== journey.independentTargetId) {
      throw new Error('independent target identity does not match the client observation');
    }
    if (journey.targetChanged !== requirement.expectedTargetMutation) {
      throw new Error('target mutation differs from the independently observed requirement');
    }
    if (journey.foreignTenantIdsObserved.length !== 0) {
      throw new Error('foreign tenant identity was observed');
    }
    if (!journey.outputRedacted) throw new Error('output redaction is incomplete');
    if (journey.client === 'sdk' && journey.cli !== undefined) {
      throw new Error('SDK journey cannot carry CLI process evidence');
    }
    if (journey.client === 'cli') validateCliObservation(journey, requirement);
  }
  return evidence;
}

/** Validates CLI-only process, credential, and cleanup semantics. */
function validateCliObservation(
  journey: PackedTenantAdminJourneyEvidence,
  requirement: PackedTenantAdminJourneyRequirement,
): void {
  if (journey.cli === undefined) throw new Error('CLI process evidence is absent');
  const expectedSuccess = requirement.expectedResult === 'allowed';
  if (
    (expectedSuccess && journey.cli.exitCode !== 0) ||
    (!expectedSuccess && journey.cli.exitCode === 0)
  ) {
    throw new Error('CLI exit does not match the required result');
  }
  if (
    journey.cli.temporaryHomeMode !== 0o700 ||
    !journey.cli.temporaryHomeRemoved ||
    !journey.cli.callerCredentialUnchanged
  ) {
    throw new Error('temporary home or caller credential isolation is incomplete');
  }
}

/** Runs the exact adjunct matrix through an injected packed-client driver and admits its evidence. */
export async function runPackedTenantAdminAdjunct(
  context: PackedTenantAdminRunContext,
  driver: PackedTenantAdminJourneyDriver,
): Promise<PackedTenantAdminEvidence> {
  const journeys: PackedTenantAdminJourneyEvidence[] = [];
  for (const requirement of packedTenantAdminJourneyRequirements) {
    const before = await driver.observeTarget(requirement);
    try {
      const client = await driver.execute(requirement);
      const after = await driver.observeTarget(requirement);
      journeys.push({
        ...client,
        independentTargetId: after.targetId,
        targetChanged: before.digest !== after.digest,
      });
    } finally {
      if (requirement.operation === 'update' || requirement.operation === 'denied-update') {
        await driver.reset();
      }
    }
  }
  return validatePackedTenantAdminEvidence({ version: 1, ...context, journeys });
}
