import { createHash, randomUUID } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import process from 'node:process';

import { z } from 'zod';

import { inspectFoundationProvenance } from '../scripts/source-provenance.js';
import { loadFaultCatalog } from './catalog.js';
import type { CuratedFaultCatalog, FaultClassification } from './model.js';
import { runCuratedFault, type FaultCommandResult } from './runner.js';

/** Exact reserved selector for the aggregate catalog campaign. */
export const fullCatalogSelection = Object.freeze({
  faultId: 'full-catalog',
  claimId: 'catalog',
  sentinelId: 'all',
});

/** Closed aggregate exit-code vocabulary. */
export type FaultCatalogCampaignExitCode = 0 | 21 | 30 | 50 | 60 | 70 | 130 | 143;

/** Result returned to the root dispatcher for one complete catalog campaign. */
export interface FaultCatalogCampaignCommandResult {
  /** UUID owning the aggregate evidence directory. */
  readonly runId: string;
  /** Stable aggregate exit code after explicit precedence. */
  readonly exitCode: FaultCatalogCampaignExitCode;
  /** Repository-relative path to the sanitized aggregate artifact. */
  readonly artifactPath: string;
  /** Bounded recovery command when a child left recoverable residue. */
  readonly recoveryCommand?: string;
  /** Aggregate counts used by the bounded console summary. */
  readonly counts: Readonly<
    Record<'killed' | 'survived' | 'invalid' | 'infrastructure' | 'timeout' | 'notRun', number>
  >;
}

/** Deterministic identity for one catalog tuple. */
export interface FaultCatalogTupleIdentity {
  /** Fault definition owning the tuple. */
  readonly faultId: string;
  /** Claim independently exercised by the tuple. */
  readonly claimId: string;
  /** Sentinel independently exercised by the tuple. */
  readonly sentinelId: string;
  /** Stable lexical aggregate identity. */
  readonly identity: string;
}

/** Sanitized accounting for one completed or intentionally unattempted tuple. */
export interface FaultCatalogCampaignTupleEntry extends FaultCatalogTupleIdentity {
  /** Stable position in the snapshotted catalog expansion. */
  readonly ordinal: number;
  /** Whether the exact tuple ran. */
  readonly executionStatus: 'completed' | 'not-run';
  /** Exact classification, absent only when execution was unsafe to continue. */
  readonly classification: FaultClassification | null;
  /** Closed reason for an intentionally unattempted tuple. */
  readonly notRunReason: 'SIGNAL_RECEIVED' | 'CLEANUP_UNSAFE' | null;
  /** Whether the exact registered signature killed this tuple. */
  readonly exactSignatureObserved: boolean;
  /** Claims independently killed by this tuple. */
  readonly killedClaimIds: readonly string[];
  /** Claims left blocked by this tuple. */
  readonly blockedClaimIds: readonly string[];
  /** Whether the tuple received its own fresh detached worktree. */
  readonly freshDetachedWorktree: boolean;
  /** Whether the primary source identity remained unchanged. */
  readonly primaryTreeUnchanged: boolean;
  /** Whether every disposable tuple resource was removed or exactly recoverable. */
  readonly ownedResourcesRemovedOrRecovered: boolean;
}

const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const tupleEntrySchema = z
  .object({
    faultId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/u),
    claimId: z.string().regex(/^CLAIM-R[1-7]-[0-9]{2}$/u),
    sentinelId: z.string().regex(/^ST-[0-9]{2}[A-Z]?$/u),
    identity: z.string().regex(/^[a-z0-9-]+::CLAIM-R[1-7]-[0-9]{2}::ST-[0-9]{2}[A-Z]?$/u),
    ordinal: z.number().int().nonnegative(),
    executionStatus: z.enum(['completed', 'not-run']),
    classification: z
      .enum(['killed', 'survived', 'invalid', 'infrastructure-failed', 'timeout'])
      .nullable(),
    notRunReason: z.enum(['SIGNAL_RECEIVED', 'CLEANUP_UNSAFE']).nullable(),
    exactSignatureObserved: z.boolean(),
    killedClaimIds: z.array(z.string().regex(/^CLAIM-R[1-7]-[0-9]{2}$/u)),
    blockedClaimIds: z.array(z.string().regex(/^CLAIM-R[1-7]-[0-9]{2}$/u)),
    freshDetachedWorktree: z.boolean(),
    primaryTreeUnchanged: z.boolean(),
    ownedResourcesRemovedOrRecovered: z.boolean(),
  })
  .strict();

const campaignArtifactSchema = z
  .object({
    schemaVersion: z.literal(1),
    selector: z
      .object({
        fault: z.literal('full-catalog'),
        claim: z.literal('catalog'),
        sentinel: z.literal('all'),
      })
      .strict(),
    catalogDigest: digestSchema,
    baseline: z
      .object({
        commit: z.string().regex(/^[a-f0-9]{40}$/u),
        treeDigest: digestSchema,
        toolchainDigest: digestSchema,
        catalogDigest: digestSchema,
        clean: z.literal(true),
      })
      .strict(),
    tuples: z.array(tupleEntrySchema).min(1),
    exitCode: z.union([
      z.literal(0),
      z.literal(21),
      z.literal(30),
      z.literal(50),
      z.literal(60),
      z.literal(70),
      z.literal(130),
      z.literal(143),
    ]),
    terminalReason: z.string().regex(/^[A-Z][A-Z0-9_]{2,127}$/u),
    artifactMode: z.literal(0o600),
    atomicWrite: z.literal(true),
    primaryTreeUnchanged: z.boolean(),
    ownedResourcesRemovedOrRecovered: z.boolean(),
    ownedResourceCleanup: z
      .object({
        worktree: z.enum(['removed', 'exactly-recovered', 'recovery-required']),
        build: z.enum(['removed', 'exactly-recovered', 'recovery-required']),
        image: z.enum(['removed', 'exactly-recovered', 'recovery-required']),
        stack: z.enum(['removed', 'exactly-recovered', 'recovery-required']),
        evidence: z.enum(['removed', 'exactly-recovered', 'recovery-required']),
      })
      .strict(),
    recoveryCommand: z
      .string()
      .regex(
        /^git worktree remove --force test-harness\/\.assurance-runtime\/fault\/[a-f0-9-]+\/worktree$/u,
      )
      .optional(),
    retainedFieldNames: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/u)),
  })
  .strict();

/** Validated aggregate artifact written by the campaign. */
export type FaultCatalogCampaignArtifact = z.infer<typeof campaignArtifactSchema>;

/** Exact top-level fields retained in the aggregate artifact. */
export const faultCatalogCampaignRetainedFields = Object.freeze([
  'schemaVersion',
  'selector',
  'catalogDigest',
  'baseline',
  'tuples',
  'exitCode',
  'terminalReason',
  'artifactMode',
  'atomicWrite',
  'primaryTreeUnchanged',
  'ownedResourcesRemovedOrRecovered',
  'ownedResourceCleanup',
  'recoveryCommand',
  'retainedFieldNames',
]);

/** Returns true only for the reserved aggregate selection. */
export function isFullCatalogSelection(selection: {
  readonly faultId: string;
  readonly claimId: string;
  readonly sentinelId: string;
}): boolean {
  return (
    selection.faultId === fullCatalogSelection.faultId &&
    selection.claimId === fullCatalogSelection.claimId &&
    selection.sentinelId === fullCatalogSelection.sentinelId
  );
}

/** Expands every catalog tuple once in deterministic lexical order. */
export function expandCuratedFaultCatalog(
  catalog: CuratedFaultCatalog,
): readonly FaultCatalogTupleIdentity[] {
  const tuples = catalog.faults
    .flatMap((fault) =>
      fault.tuples.map((tuple) => ({
        faultId: fault.id,
        claimId: tuple.claimId,
        sentinelId: tuple.sentinelId,
        identity: `${fault.id}::${tuple.claimId}::${tuple.sentinelId}`,
      })),
    )
    .sort((left, right) => left.identity.localeCompare(right.identity));
  const identities = tuples.map((tuple) => tuple.identity);
  if (new Set(identities).size !== identities.length) {
    throw new Error('fault catalog contains a duplicate global tuple identity');
  }
  return tuples;
}

/** Applies explicit aggregate precedence instead of comparing exit codes numerically. */
export function classifyFaultCatalogCampaignExit(
  entries: readonly FaultCatalogCampaignTupleEntry[],
  signal: 130 | 143 | undefined,
): FaultCatalogCampaignExitCode {
  if (
    entries.some((entry) => !entry.primaryTreeUnchanged || !entry.ownedResourcesRemovedOrRecovered)
  ) {
    return 60;
  }
  if (signal !== undefined) return signal;
  if (entries.some((entry) => entry.classification === 'timeout')) return 70;
  if (entries.some((entry) => entry.classification === 'invalid')) return 50;
  if (entries.some((entry) => entry.classification === 'infrastructure-failed')) return 30;
  if (entries.some((entry) => entry.classification === 'survived')) return 21;
  return 0;
}

/** Builds one completed tuple entry from the existing exact-tuple runner result. */
function completedEntry(
  tuple: FaultCatalogTupleIdentity,
  ordinal: number,
  result: FaultCommandResult,
): FaultCatalogCampaignTupleEntry {
  return {
    ...tuple,
    ordinal,
    executionStatus: 'completed',
    classification: result.classification,
    notRunReason: null,
    exactSignatureObserved: result.classification === 'killed',
    killedClaimIds: [...result.killedClaims],
    blockedClaimIds: [...result.blockedClaims],
    freshDetachedWorktree: result.worktreeCreated,
    primaryTreeUnchanged: result.primaryTreeUnchanged,
    ownedResourcesRemovedOrRecovered: result.residue.length === 0,
  };
}

/** Builds one explicit not-run entry after a signal or unsafe cleanup stops the campaign. */
function notRunEntry(
  tuple: FaultCatalogTupleIdentity,
  ordinal: number,
  reason: 'SIGNAL_RECEIVED' | 'CLEANUP_UNSAFE',
): FaultCatalogCampaignTupleEntry {
  return {
    ...tuple,
    ordinal,
    executionStatus: 'not-run',
    classification: null,
    notRunReason: reason,
    exactSignatureObserved: false,
    killedClaimIds: [],
    blockedClaimIds: [],
    freshDetachedWorktree: false,
    primaryTreeUnchanged: true,
    ownedResourcesRemovedOrRecovered: true,
  };
}

/** Records an unexpected tuple-runner failure without claiming cleanup or tree safety. */
function unsafeInfrastructureEntry(
  tuple: FaultCatalogTupleIdentity,
  ordinal: number,
): FaultCatalogCampaignTupleEntry {
  return {
    ...tuple,
    ordinal,
    executionStatus: 'completed',
    classification: 'infrastructure-failed',
    notRunReason: null,
    exactSignatureObserved: false,
    killedClaimIds: [],
    blockedClaimIds: [],
    freshDetachedWorktree: false,
    primaryTreeUnchanged: false,
    ownedResourcesRemovedOrRecovered: false,
  };
}

/** Returns a SHA-256 identity for one bounded value. */
function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

/** Creates an owner-only canonical directory for one aggregate result. */
function requireOwnedDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  if (!lstatSync(path).isDirectory() || realpathSync(path) !== path) {
    throw new Error('fault campaign result directory is not canonical');
  }
}

/** Writes a schema-validated aggregate artifact atomically with owner-only permissions. */
function writeCampaignArtifact(path: string, value: FaultCatalogCampaignArtifact): void {
  const validated = campaignArtifactSchema.parse(value);
  const rendered = `${JSON.stringify(validated, undefined, 2)}\n`;
  if (
    /(?:\/home\/|\/tmp\/|BEGIN [A-Z ]*PRIVATE KEY|Bearer\s|authorization:|password=)/iu.test(
      rendered,
    )
  ) {
    throw new Error('fault campaign artifact contains prohibited material');
  }
  const temporary = `${path}.tmp-${randomUUID()}`;
  try {
    writeFileSync(temporary, rendered, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

/** Executes every snapshotted catalog tuple through the exact single-tuple runner. */
export async function runCuratedFaultCatalog(
  repositoryRoot: string,
): Promise<FaultCatalogCampaignCommandResult> {
  const canonicalRoot = realpathSync(repositoryRoot);
  const provenance = inspectFoundationProvenance(canonicalRoot);
  const catalog = loadFaultCatalog(canonicalRoot);
  const tuples = expandCuratedFaultCatalog(catalog);
  const catalogPath = resolve(canonicalRoot, 'test-harness/assurance/fault/catalog.json');
  const catalogDigest = digest(readFileSync(catalogPath, 'utf8'));
  const runId = randomUUID();
  const resultDirectory = resolve(
    canonicalRoot,
    'test-harness/.assurance-results',
    runId,
    'fault/full-catalog/catalog/all',
  );
  const entries: FaultCatalogCampaignTupleEntry[] = [];
  let interruptedExit: 130 | 143 | undefined;
  let unsafeReason: 'SIGNAL_RECEIVED' | 'CLEANUP_UNSAFE' | undefined;
  let recoveryCommand: string | undefined;
  const onSigint = (): void => {
    interruptedExit ??= 130;
  };
  const onSigterm = (): void => {
    interruptedExit ??= 143;
  };
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);
  try {
    for (const [ordinal, tuple] of tuples.entries()) {
      if (unsafeReason !== undefined || interruptedExit !== undefined) {
        const reason = unsafeReason ?? 'SIGNAL_RECEIVED';
        entries.push(notRunEntry(tuple, ordinal, reason));
        continue;
      }
      let result: FaultCommandResult;
      try {
        result = await runCuratedFault(canonicalRoot, {
          faultId: tuple.faultId,
          claimId: tuple.claimId,
          sentinelId: tuple.sentinelId,
        });
      } catch {
        entries.push(unsafeInfrastructureEntry(tuple, ordinal));
        unsafeReason = 'CLEANUP_UNSAFE';
        continue;
      }
      const entry = completedEntry(tuple, ordinal, result);
      entries.push(entry);
      recoveryCommand ??= result.recoveryCommand;
      if (result.exitCode === 130 || result.exitCode === 143) {
        interruptedExit ??= result.exitCode;
      }
      if (!entry.primaryTreeUnchanged || !entry.ownedResourcesRemovedOrRecovered) {
        unsafeReason = 'CLEANUP_UNSAFE';
      } else if (interruptedExit !== undefined) {
        unsafeReason = 'SIGNAL_RECEIVED';
      }
    }

    let finalTreeUnchanged = false;
    try {
      const after = inspectFoundationProvenance(canonicalRoot);
      finalTreeUnchanged =
        after.commitIdentity === provenance.commitIdentity &&
        after.treeIdentity === provenance.treeIdentity &&
        after.assuranceToolDigest === provenance.assuranceToolDigest;
    } catch {
      finalTreeUnchanged = false;
    }
    if (!finalTreeUnchanged) unsafeReason = 'CLEANUP_UNSAFE';
    const classifiedExitCode = classifyFaultCatalogCampaignExit(entries, interruptedExit);
    const exitCode = finalTreeUnchanged ? classifiedExitCode : 60;
    const terminalReason =
      exitCode === 0
        ? 'ALL_TUPLES_KILLED'
        : exitCode === 60
          ? 'CLEANUP_UNSAFE'
          : exitCode === 130
            ? 'SIGINT_RECEIVED'
            : exitCode === 143
              ? 'SIGTERM_RECEIVED'
              : exitCode === 70
                ? 'TUPLE_TIMEOUT'
                : exitCode === 50
                  ? 'INVALID_TUPLE_RESULT'
                  : exitCode === 30
                    ? 'INFRASTRUCTURE_FAILURE'
                    : 'SURVIVING_TUPLE';
    const artifact: FaultCatalogCampaignArtifact = {
      schemaVersion: 1,
      selector: { fault: 'full-catalog', claim: 'catalog', sentinel: 'all' },
      catalogDigest,
      baseline: {
        commit: provenance.commitIdentity.replace(/^commit:/u, ''),
        treeDigest: digest(provenance.treeIdentity),
        toolchainDigest: provenance.assuranceToolDigest,
        catalogDigest,
        clean: true,
      },
      tuples: entries.map((entry) => ({
        ...entry,
        killedClaimIds: [...entry.killedClaimIds],
        blockedClaimIds: [...entry.blockedClaimIds],
      })),
      exitCode,
      terminalReason,
      artifactMode: 0o600,
      atomicWrite: true,
      primaryTreeUnchanged:
        finalTreeUnchanged && entries.every((entry) => entry.primaryTreeUnchanged),
      ownedResourcesRemovedOrRecovered: entries.every(
        (entry) => entry.ownedResourcesRemovedOrRecovered,
      ),
      ownedResourceCleanup: {
        worktree: recoveryCommand === undefined ? 'removed' : 'recovery-required',
        build: 'removed',
        image: 'removed',
        stack: 'removed',
        evidence: 'removed',
      },
      ...(recoveryCommand === undefined ? {} : { recoveryCommand }),
      retainedFieldNames: [...faultCatalogCampaignRetainedFields],
    };
    requireOwnedDirectory(resultDirectory);
    const artifactPath = resolve(resultDirectory, 'fault-catalog-result.json');
    writeCampaignArtifact(artifactPath, artifact);
    const counts = {
      killed: entries.filter((entry) => entry.classification === 'killed').length,
      survived: entries.filter((entry) => entry.classification === 'survived').length,
      invalid: entries.filter((entry) => entry.classification === 'invalid').length,
      infrastructure: entries.filter((entry) => entry.classification === 'infrastructure-failed')
        .length,
      timeout: entries.filter((entry) => entry.classification === 'timeout').length,
      notRun: entries.filter((entry) => entry.executionStatus === 'not-run').length,
    };
    return {
      runId,
      exitCode,
      artifactPath: relative(canonicalRoot, artifactPath).split(sep).join('/'),
      ...(recoveryCommand === undefined ? {} : { recoveryCommand }),
      counts,
    };
  } finally {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  }
}
