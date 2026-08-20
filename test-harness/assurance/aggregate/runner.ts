import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';

import type {
  AssuranceAllAggregateEvidence,
  AssuranceAllChildEvidence,
  AssuranceAllConclusion,
  AssuranceAllInvocationEvidence,
  AssuranceAllInvocationRegistration,
  AssuranceAllItemEvidence,
  AssuranceAllTerminalObservation,
} from '../tests/assurance-all-aggregate-contract.js';
import { runManagedChild, type ManagedChildOutcome } from '../scripts/managed-child.js';
import { inspectFoundationProvenance } from '../scripts/source-provenance.js';
import {
  aggregateExitCode,
  aggregateRetainedFields,
  validateAggregateEvidence,
} from './evidence.js';
import { admitKnownIncompleteCollector } from './incomplete-admission.js';
import { aggregateChildRegistry, aggregateKnownGaps, aggregateRegistryDigest } from './registry.js';

/** Bounded result returned to the root dispatcher. */
export interface AggregateRunResult {
  readonly runId: string;
  readonly exitCode: AssuranceAllAggregateEvidence['exitCode'];
  readonly artifactPath: string;
  readonly summaryPath: string;
  readonly counts: Readonly<Record<AssuranceAllConclusion, number>>;
}

/** Injectable execution boundary used by implementation tests. */
export interface AggregateInvocationExecutor {
  execute(
    invocation: AssuranceAllInvocationRegistration,
    timeoutMilliseconds: number,
  ): Promise<ManagedChildOutcome>;
}

/** Testable boundaries whose production implementation enforces clean Git provenance. */
export interface AggregateRunnerDependencies extends AggregateInvocationExecutor {
  /** Captures clean source provenance before and after aggregate execution. */
  inspectProvenance(repositoryRoot: string): ReturnType<typeof inspectFoundationProvenance>;
}

const aggregateDeadlineMilliseconds = 7_200_000;
const aggregateOutputLimitBytes = 8 * 1024 * 1024;

/** Maps an assurance package script to the dispatcher action used by the child process. */
function actionForCommand(command: AssuranceAllInvocationRegistration['command']): string {
  return command.slice('assurance:'.length);
}

/** Returns the bounded timeout for one registered child command. */
function invocationTimeout(invocation: AssuranceAllInvocationRegistration): number {
  if (invocation.command === 'assurance:harness' || invocation.command === 'assurance:compat') {
    return 1_800_000;
  }
  if (invocation.command === 'assurance:coverage') return 2_400_000;
  if (invocation.command === 'assurance:fault') return 3_600_000;
  return 120_000;
}

/** Creates the production shell-free child executor. */
function createManagedExecutor(repositoryRoot: string): AggregateInvocationExecutor {
  return {
    execute(invocation, timeoutMilliseconds): Promise<ManagedChildOutcome> {
      return runManagedChild(
        process.execPath,
        [
          '--import',
          'tsx',
          'test-harness/assurance/scripts/run-command.ts',
          actionForCommand(invocation.command),
          ...invocation.arguments,
        ],
        {
          cwd: repositoryRoot,
          env: process.env,
          stdio: 'pipe',
          maxOutputBytes: aggregateOutputLimitBytes,
          timeoutMilliseconds,
          terminationGraceMilliseconds: 10_000,
          cleanup: () => undefined,
        },
      );
    },
  };
}

/** Creates production dependencies for one aggregate invocation. */
function createRunnerDependencies(repositoryRoot: string): AggregateRunnerDependencies {
  return {
    ...createManagedExecutor(repositoryRoot),
    inspectProvenance: inspectFoundationProvenance,
  };
}

/** Writes one owner-only file through an atomic same-directory replacement. */
function writeAtomic(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  chmodSync(dirname(path), 0o700);
  const temporary = `${path}.tmp-${randomUUID()}`;
  try {
    writeFileSync(temporary, contents, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    renameSync(temporary, path);
    chmodSync(path, 0o600);
  } finally {
    rmSync(temporary, { force: true });
  }
}

/** Returns the SHA-256 identity of bytes already admitted for evidence. */
function digest(value: string | Buffer): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

/** Converts Git provenance into the public aggregate identity format. */
function evidenceProvenance(provenance: ReturnType<typeof inspectFoundationProvenance>): {
  readonly revision: string;
  readonly treeDigest: string;
  readonly toolDigest: string;
} {
  return {
    revision: provenance.commitIdentity.replace(/^commit:/, ''),
    treeDigest: digest(provenance.treeIdentity),
    toolDigest: provenance.assuranceToolDigest,
  };
}

/** Extracts one allowlisted child artifact path from bounded command output. */
function observedArtifactReference(
  invocation: AssuranceAllInvocationRegistration,
  output: string,
): string | null {
  if (invocation.command === 'assurance:validate') {
    const runId = /^ASSURANCE_RUN_ID=([0-9a-f-]{36})$/m.exec(output)?.[1];
    return runId === undefined ? null : `test-harness/.assurance-results/${runId}/manifest.json`;
  }
  const artifact = /\bartifact=(test-harness\/\.assurance-results\/[a-zA-Z0-9/_.-]+)/.exec(
    output,
  )?.[1];
  if (artifact !== undefined) return artifact;
  const capture =
    /^ASSURANCE_COVERAGE_CAPTURE=(test-harness\/\.assurance-results\/[a-zA-Z0-9/_.-]+)$/m.exec(
      output,
    )?.[1];
  if (capture !== undefined) return capture;
  const report = /^ASSURANCE_REPORT=(test-harness\/\.assurance-results\/[a-zA-Z0-9/_.-]+)$/m.exec(
    output,
  )?.[1];
  return report ?? null;
}

/** Returns one child artifact digest only after canonical run-root validation. */
function observedArtifactDigest(repositoryRoot: string, reference: string | null): string | null {
  if (reference === null) return null;
  const absolute = resolve(repositoryRoot, reference);
  const resultsRoot = resolve(repositoryRoot, 'test-harness/.assurance-results');
  if (
    !absolute.startsWith(`${resultsRoot}/`) ||
    !existsSync(absolute) ||
    !statSync(absolute).isFile()
  ) {
    return null;
  }
  return digest(readFileSync(absolute));
}

/**
 * Extracts the exact production-security coverage run owned by this repository.
 *
 * Coverage prints a canonical absolute path in normal execution, while injected tests may use
 * the equivalent repository-relative form. Both forms must resolve to the one registered result
 * location; normalized traversal aliases and duplicate declarations fail closed.
 */
function coverageRunIdentity(repositoryRoot: string, output: string): string | undefined {
  const prefix = 'ASSURANCE_COVERAGE_CAPTURE=';
  const values = output
    .split(/\r?\n/u)
    .filter((line) => line.startsWith(prefix))
    .map((line) => line.slice(prefix.length));
  if (values.length !== 1 || values[0] === '') return undefined;

  const value = values[0]!;
  const absolute = resolve(repositoryRoot, value);
  const repositoryRelative = relative(repositoryRoot, absolute);
  const canonicalInput = value.startsWith('/') ? absolute : repositoryRelative;
  if (value !== canonicalInput) return undefined;

  return /^test-harness\/\.assurance-results\/([0-9a-f-]{36})\/coverage\/security\/production-security\/capture-manifest\.json$/u.exec(
    repositoryRelative,
  )?.[1];
}

/** Chooses one stable exit and stop decision from a managed child result. */
function childTerminal(outcome: ManagedChildOutcome): {
  readonly exitCode: number;
  readonly stop: boolean;
} {
  if (outcome.cleanupFailed) return { exitCode: 60, stop: true };
  if (outcome.forwardedSignal === 'SIGINT') return { exitCode: 130, stop: true };
  if (outcome.forwardedSignal === 'SIGTERM') return { exitCode: 143, stop: true };
  if (outcome.timedOut) return { exitCode: 70, stop: true };
  if (outcome.setupFailed || outcome.outputTruncated || outcome.code === null) {
    return { exitCode: 30, stop: true };
  }
  if (outcome.code === 0) return { exitCode: 0, stop: false };
  if (outcome.code === 20) return { exitCode: 20, stop: false };
  if ([21, 30, 40, 50, 60, 70, 130, 143].includes(outcome.code)) {
    return { exitCode: outcome.code, stop: true };
  }
  return { exitCode: 30, stop: true };
}

/** Builds the disjoint sorted five-way roll-up. */
function rollup(
  items: readonly AssuranceAllItemEvidence[],
): Readonly<Record<AssuranceAllConclusion, readonly string[]>> {
  const result: Record<AssuranceAllConclusion, string[]> = {
    assured: [],
    blocked: [],
    incomplete: [],
    survived: [],
    unqualified: [],
  };
  for (const item of items) result[item.conclusion].push(item.id);
  for (const values of Object.values(result)) values.sort();
  return result;
}

/** Derives terminal flags from children, gaps, and final provenance. */
function terminalObservation(
  exits: readonly number[],
  primaryTreeUnchanged: boolean,
  authorityGapPresent: boolean,
): AssuranceAllTerminalObservation {
  return {
    cleanupOrPrimaryTreeDrift: !primaryTreeUnchanged || exits.includes(60),
    signal: exits.includes(130) ? 'sigint' : exits.includes(143) ? 'sigterm' : null,
    timedOut: exits.includes(70),
    invalidEvidence: exits.includes(50) || authorityGapPresent,
    coverageIncomplete: exits.includes(40),
    infrastructureFailed: exits.includes(30),
    productDefectObserved: exits.includes(20),
    assertionFailedOrFaultSurvived: exits.includes(21),
  };
}

/** Returns the stable terminal reason matching the selected exit. */
function terminalReason(exitCode: number): string {
  const reasons: Readonly<Record<number, string>> = {
    0: 'ALL_REGISTERED_ITEMS_ASSURED',
    20: 'KNOWN_PRODUCT_DEFECT_RETAINED',
    21: 'ASSERTION_OR_FAULT_SURVIVAL',
    30: 'INFRASTRUCTURE_FAILURE',
    40: 'COVERAGE_INCOMPLETE',
    50: 'BLOCKED_OR_UNQUALIFIED_ITEMS_RETAINED',
    60: 'CLEANUP_OR_PRIMARY_TREE_DRIFT',
    70: 'CHILD_TIMEOUT',
    130: 'INTERRUPTED_SIGINT',
    143: 'INTERRUPTED_SIGTERM',
  };
  return reasons[exitCode] ?? 'ASSURANCE_ALL_INVALID_EXIT';
}

/** Runs the exact local aggregate and publishes a truthful sanitized roll-up. */
export async function runAssuranceAggregate(
  repositoryRoot: string,
  injectedDependencies?: AggregateRunnerDependencies,
): Promise<AggregateRunResult> {
  const root = realpathSync(repositoryRoot);
  const dependencies = injectedDependencies ?? createRunnerDependencies(root);
  const before = dependencies.inspectProvenance(root);
  const provenance = evidenceProvenance(before);
  const runId = randomUUID();
  const runDirectory = resolve(root, 'test-harness/.assurance-results', runId, 'all');
  const children: AssuranceAllChildEvidence[] = [];
  const items: AssuranceAllItemEvidence[] = [];
  const exits: number[] = [];
  let stopped = false;
  let validationRunId: string | undefined;
  let coverageRunId: string | undefined;
  const started = Date.now();

  for (const registeredChild of aggregateChildRegistry) {
    const invocations: AssuranceAllInvocationEvidence[] = [];
    for (const registered of registeredChild.invocations) {
      if (stopped || Date.now() - started >= aggregateDeadlineMilliseconds) {
        if (Date.now() - started >= aggregateDeadlineMilliseconds) exits.push(70);
        stopped = true;
        const notRunInvocation: AssuranceAllInvocationEvidence = {
          ...registered,
          executionStatus: 'not-run',
          exitCode: null,
          artifactReference: null,
          artifactDigest: null,
          sourceRevision: provenance.revision,
          sourceTreeDigest: provenance.treeDigest,
          toolIdentity: registered.command,
          toolDigest: provenance.toolDigest,
          cleanupComplete: false,
          notRunReason: 'EARLIER_CHILD_TERMINATED',
        };
        invocations.push(notRunInvocation);
        items.push({
          id: `invocation:${registered.id}`,
          childId: registeredChild.id,
          authority: 'eligible',
          executionStatus: 'not-run',
          observation: null,
          notRunReason: notRunInvocation.notRunReason,
          conclusion: 'incomplete',
        });
        continue;
      }
      const effective =
        registered.command === 'assurance:report' &&
        validationRunId !== undefined &&
        coverageRunId !== undefined
          ? {
              ...registered,
              arguments: ['--run', validationRunId, '--coverage-run', coverageRunId],
            }
          : registered;
      const remaining = Math.max(1, aggregateDeadlineMilliseconds - (Date.now() - started));
      const outcome = await dependencies.execute(
        effective,
        Math.min(invocationTimeout(effective), remaining),
      );
      const observedReference = observedArtifactReference(effective, outcome.stdout);
      const initialTerminal = childTerminal(outcome);
      const knownIncompleteAdmitted =
        initialTerminal.exitCode === 40 &&
        admitKnownIncompleteCollector({
          repositoryRoot: root,
          invocation: effective,
          artifactReference: observedReference,
          provenance: before,
          cleanupComplete: !outcome.cleanupFailed,
        });
      const terminal = {
        exitCode: initialTerminal.exitCode,
        stop: knownIncompleteAdmitted ? false : initialTerminal.stop,
      };
      exits.push(terminal.exitCode);
      if (registered.command === 'assurance:validate') {
        validationRunId = /^ASSURANCE_RUN_ID=([0-9a-f-]{36})$/m.exec(outcome.stdout)?.[1];
        if (terminal.exitCode === 0 && validationRunId === undefined) {
          exits.push(50);
          stopped = true;
        }
      }
      if (registered.id === 'coverage-security-production-security') {
        coverageRunId = coverageRunIdentity(root, outcome.stdout);
        if (terminal.exitCode === 0 && coverageRunId === undefined) {
          exits.push(50);
          stopped = true;
        }
      }
      const childEvidencePath = resolve(runDirectory, 'children', `${registered.id}.json`);
      const childArtifact = {
        schemaVersion: 1,
        invocationId: registered.id,
        command: registered.command,
        selector: registered.selector,
        profile: registered.profile,
        exitCode: terminal.exitCode,
        observedArtifactDigest: observedArtifactDigest(root, observedReference),
        cleanupComplete: !outcome.cleanupFailed && terminal.exitCode !== 60,
      };
      writeAtomic(childEvidencePath, `${JSON.stringify(childArtifact, undefined, 2)}\n`);
      const artifactReference = `all/children/${registered.id}.json`;
      invocations.push({
        ...effective,
        executionStatus: 'completed',
        exitCode: terminal.exitCode,
        artifactReference,
        artifactDigest: digest(readFileSync(childEvidencePath)),
        sourceRevision: provenance.revision,
        sourceTreeDigest: provenance.treeDigest,
        toolIdentity: registered.command,
        toolDigest: provenance.toolDigest,
        cleanupComplete: !outcome.cleanupFailed && terminal.exitCode !== 60,
        notRunReason: null,
      });
      items.push({
        id: `invocation:${registered.id}`,
        childId: registeredChild.id,
        authority: terminal.exitCode === 20 ? 'known-product-defect-collector' : 'eligible',
        executionStatus: 'completed',
        observation:
          terminal.exitCode === 0
            ? 'passed'
            : terminal.exitCode === 20
              ? 'product-defect-observed'
              : terminal.exitCode === 40
                ? 'evidence-incomplete'
                : terminal.exitCode === 21 && registeredChild.id === 'fault'
                  ? 'fault-survived'
                  : 'assertion-failed',
        notRunReason: null,
        conclusion:
          terminal.exitCode === 0
            ? 'assured'
            : terminal.exitCode === 20
              ? 'blocked'
              : terminal.exitCode === 40
                ? 'incomplete'
                : terminal.exitCode === 21 && registeredChild.id === 'fault'
                  ? 'survived'
                  : 'incomplete',
      });
      if (terminal.stop) stopped = true;
    }
    const completed = invocations.filter(
      (invocation) => invocation.executionStatus === 'completed',
    );
    const notRun = invocations.length - completed.length;
    const childExitCodes = completed.map((invocation) => invocation.exitCode ?? 30);
    const knownDefect = childExitCodes.includes(20);
    const incomplete = childExitCodes.includes(40) || notRun > 0;
    const failed = childExitCodes.some((code) => code !== 0 && code !== 20 && code !== 40);
    children.push({
      id: registeredChild.id,
      ordinal: registeredChild.ordinal,
      executionStatus: notRun === invocations.length ? 'not-run' : 'completed',
      processOwnership: notRun === invocations.length ? null : 'managed-child',
      outcome:
        notRun === invocations.length
          ? null
          : failed
            ? 'assertion-failed'
            : incomplete
              ? 'incomplete'
              : knownDefect
                ? 'known-product-defect'
                : 'passed',
      notRunReason: notRun === invocations.length ? 'EARLIER_CHILD_TERMINATED' : null,
      cleanupComplete: completed.every((invocation) => invocation.cleanupComplete),
      invocations,
    });
  }

  for (const gap of aggregateKnownGaps) {
    items.push({
      id: gap.id,
      childId: 'report',
      authority: gap.authority,
      executionStatus: 'not-run',
      observation: null,
      notRunReason:
        gap.authority === 'authority-blocked'
          ? 'AUTHORITY_CONTRACT_UNAVAILABLE'
          : 'OBSERVATION_UNQUALIFIED',
      conclusion: gap.conclusion,
    });
  }
  let primaryTreeUnchanged: boolean;
  try {
    const after = dependencies.inspectProvenance(root);
    primaryTreeUnchanged =
      before.commitIdentity === after.commitIdentity &&
      before.treeIdentity === after.treeIdentity &&
      before.assuranceToolDigest === after.assuranceToolDigest;
  } catch {
    primaryTreeUnchanged = false;
  }
  const terminal = terminalObservation(exits, primaryTreeUnchanged, aggregateKnownGaps.length > 0);
  const selectedExit = aggregateExitCode(terminal);
  const evidence: AssuranceAllAggregateEvidence = {
    schemaVersion: 1,
    registryVersion: 1,
    registryDigest: aggregateRegistryDigest(),
    baselineRevision: provenance.revision,
    baselineTreeDigest: provenance.treeDigest,
    children,
    items,
    rollup: rollup(items),
    terminal,
    exitCode: selectedExit,
    terminalReason: terminalReason(selectedExit),
    artifactMode: 0o600,
    atomicWrite: true,
    cleanup: {
      primaryTreeUnchanged,
      activeChildStopped: !exits.includes(60),
      childProcessGroupStopped: !exits.includes(60),
      ownedResourcesRemovedOrExactlyRecovered:
        !existsSync(resolve(root, 'test-harness/.assurance-runtime/active-run.json')) &&
        children.every((child) => child.cleanupComplete),
      recoveryRequired: exits.includes(60),
      recoveryCommand: null,
    },
    retainedFieldNames: aggregateRetainedFields,
  };
  validateAggregateEvidence(evidence);
  const artifactPath = relative(root, resolve(runDirectory, 'result.json'));
  const summaryPath = relative(root, resolve(runDirectory, 'summary.md'));
  writeAtomic(resolve(root, artifactPath), `${JSON.stringify(evidence, undefined, 2)}\n`);
  const counts: Readonly<Record<AssuranceAllConclusion, number>> = {
    assured: evidence.rollup.assured.length,
    blocked: evidence.rollup.blocked.length,
    incomplete: evidence.rollup.incomplete.length,
    survived: evidence.rollup.survived.length,
    unqualified: evidence.rollup.unqualified.length,
  };
  writeAtomic(
    resolve(root, summaryPath),
    `# Local Assurance Aggregate\n\nResult: ${evidence.terminalReason} (exit ${evidence.exitCode}).\n\n| Conclusion | Count |\n| --- | ---: |\n${Object.entries(
      counts,
    )
      .map(([name, count]) => `| ${name} | ${count} |`)
      .join('\n')}\n`,
  );
  return Object.freeze({ runId, exitCode: selectedExit, artifactPath, summaryPath, counts });
}
