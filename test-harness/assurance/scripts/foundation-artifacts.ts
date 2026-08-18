import { randomUUID } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import {
  assuranceCommandActions,
  commandContracts,
  commandContractVersion,
  rootAliasForAction,
} from '../commands.js';
import type { AssuranceCommandAction } from '../commands.js';
import {
  foundationManifestSchema,
  foundationValidationResultSchema,
  redSignatureRegistrySchema,
  testInventorySchema,
  traceabilitySchema,
} from '../schema.js';
import { renderJson, renderSummary } from './render-summary.js';
import {
  loadTraceabilityAuthority,
  validateRedSignatureRegistry,
  validateTraceability,
} from './validate-assurance.js';
import {
  AssuranceProvenanceError,
  digestRepositoryFile,
  inspectFoundationProvenance,
} from './source-provenance.js';

/** UUID format used to isolate one generated assurance run. */
const runIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

/** Signals that an exact validation run remains after automatic cleanup failed. */
export class AssuranceCleanupError extends Error {
  /** UUID of the sole owned run that remains. */
  public readonly runId: string;

  /** Bounded repository-root command that removes only the owned run. */
  public readonly recoveryCommand: string;

  /** Creates a cleanup error without retaining the original potentially sensitive exception. */
  public constructor(runId: string) {
    super(`cleanup failed for owned assurance run ${runId}`);
    this.name = 'AssuranceCleanupError';
    this.runId = runId;
    this.recoveryCommand = `rm -r -- test-harness/.assurance-results/${runId}`;
  }
}

/** Signals that immutable source provenance could not be established before a run. */
export class AssuranceSetupError extends Error {
  /** Creates a setup error without producing a passing artifact. */
  public constructor(message: string) {
    super(message);
    this.name = 'AssuranceSetupError';
  }
}

/** Requires an owned directory to be a real directory at its expected canonical path. */
function requireCanonicalDirectory(path: string): void {
  if (!lstatSync(path).isDirectory() || realpathSync(path) !== path) {
    throw new Error(`assurance artifact directory is not canonical: ${path}`);
  }
}

/** Creates the ignored result root and a new permission-restricted run directory. */
function createRunDirectory(repositoryRoot: string, runId: string): string {
  const resultsRoot = resolve(repositoryRoot, 'test-harness/.assurance-results');
  mkdirSync(resultsRoot, { recursive: true, mode: 0o700 });
  requireCanonicalDirectory(resultsRoot);

  const runDirectory = resolve(resultsRoot, runId);
  mkdirSync(runDirectory, { mode: 0o700 });
  requireCanonicalDirectory(runDirectory);
  return runDirectory;
}

/** Resolves an existing UUID-owned run without following directory symlinks. */
function resolveRunDirectory(repositoryRoot: string, runId: string): string {
  if (!runIdPattern.test(runId)) throw new Error('assurance run ID must be a UUID');
  const resultsRoot = resolve(repositoryRoot, 'test-harness/.assurance-results');
  const runDirectory = resolve(resultsRoot, runId);
  const fromRoot = relative(resultsRoot, runDirectory);
  if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    throw new Error('assurance run escapes the results root');
  }
  requireCanonicalDirectory(resultsRoot);
  requireCanonicalDirectory(runDirectory);
  return runDirectory;
}

/** Writes one already-rendered artifact atomically with owner-only permissions. */
function writeAtomic(path: string, content: string): void {
  const temporaryPath = `${path}.tmp-${randomUUID()}`;
  try {
    writeFileSync(temporaryPath, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    renameSync(temporaryPath, path);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

/** Reads and validates one JSON definition file. */
function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Verifies that every dispatcher action has exactly one root command contract.
 *
 * Comparing the complete alias sets prevents a newly registered command from being omitted from
 * validation and also rejects stale contracts whose dispatcher action no longer exists.
 *
 * @param actions - Closed dispatcher actions accepted by the command-line entry point.
 * @param aliases - Root command aliases declared by the machine-readable command contracts.
 * @param version - Command-contract schema version understood by foundation validation.
 * @throws {Error} When the version is unsupported or either alias set is incomplete.
 */
export function validateCommandContractRegistry(
  actions: readonly AssuranceCommandAction[],
  aliases: readonly string[],
  version: number,
): void {
  const expectedAliases = actions.map((action) => rootAliasForAction(action)).sort();
  const actualAliases = [...aliases].sort();
  if (version !== 1 || JSON.stringify(actualAliases) !== JSON.stringify(expectedAliases)) {
    throw new Error('root assurance command contract is incomplete');
  }
}

/** Executes foundation validation and returns the generated owned run UUID. */
export function runFoundationValidation(repositoryRoot: string): string {
  const canonicalRoot = realpathSync(repositoryRoot);
  const startedAt = new Date().toISOString();
  const traceabilityPath = resolve(canonicalRoot, 'test-harness/assurance/traceability.json');
  const inventoryPath = resolve(canonicalRoot, 'test-harness/assurance/test-inventory.json');
  const signaturesPath = resolve(canonicalRoot, 'test-harness/assurance/red-signatures.json');
  const lockPath = resolve(canonicalRoot, 'yarn.lock');
  let provenance: ReturnType<typeof inspectFoundationProvenance>;
  try {
    provenance = inspectFoundationProvenance(canonicalRoot);
  } catch (error) {
    if (error instanceof AssuranceProvenanceError) throw new AssuranceSetupError(error.message);
    throw error;
  }

  const traceability = traceabilitySchema.parse(readJson(traceabilityPath));
  validateTraceability(traceability, loadTraceabilityAuthority(canonicalRoot));
  const signatures = redSignatureRegistrySchema.parse(readJson(signaturesPath));
  validateRedSignatureRegistry(signatures);
  testInventorySchema.parse(readJson(inventoryPath));
  validateCommandContractRegistry(
    assuranceCommandActions,
    Object.keys(commandContracts),
    commandContractVersion,
  );

  const dependencyLockDigest = digestRepositoryFile(lockPath);
  const definitionDigests = {
    traceability: digestRepositoryFile(traceabilityPath),
    redSignatures: digestRepositoryFile(signaturesPath),
    testInventory: digestRepositoryFile(inventoryPath),
  };

  const runId = randomUUID();
  const runDirectory = createRunDirectory(canonicalRoot, runId);
  try {
    const validationDirectory = resolve(runDirectory, 'validation');
    mkdirSync(validationDirectory, { mode: 0o700 });
    requireCanonicalDirectory(validationDirectory);

    const completedAt = new Date().toISOString();
    const fixtureIdentity = 'not-applicable:definition-validation';
    const result = foundationValidationResultSchema.parse({
      id: 'foundation-validation',
      command: 'yarn assurance:validate',
      status: 'passed',
      startedAt,
      completedAt,
      buildIdentity: provenance.commitIdentity,
      fixtureIdentity,
      runtimeProfile: 'operational',
      redactedLog: 'validated assurance foundation definitions',
      metrics: {
        requirementCount: traceability.requirements.length,
        caseCount: traceability.cases.length,
        taskCount: traceability.tasks.length,
        claimCount: traceability.claims.length,
        redSignatureCount: signatures.signatures.length,
        commandContractVersion,
      },
    });
    writeAtomic(resolve(validationDirectory, 'result.json'), renderJson(result));

    const manifest = foundationManifestSchema.parse({
      runId,
      status: 'passed',
      command: 'yarn assurance:validate',
      startedAt,
      completedAt,
      buildIdentity: provenance.commitIdentity,
      treeIdentity: provenance.treeIdentity,
      fixtureIdentity,
      runtimeProfile: 'operational',
      executionArtifact: { kind: 'source-tree', digest: provenance.assuranceToolDigest },
      dependencyLockDigest,
      assuranceToolDigest: provenance.assuranceToolDigest,
      definitionDigests,
      toolVersions: { node: process.version, commandContract: commandContractVersion },
      results: [
        { command: result.command, status: result.status, runtimeProfile: result.runtimeProfile },
      ],
      killedFaultIds: [],
      artifacts: ['validation/result.json'],
      accessPolicy: 'local operator and restricted CI artifact readers only',
      retentionPolicy: 'local runs are disposable; CI retention must be explicitly configured',
    });
    writeAtomic(resolve(runDirectory, 'manifest.json'), renderJson(manifest));
    return runId;
  } catch (error) {
    try {
      rmSync(runDirectory, { recursive: true, force: true });
    } catch {
      throw new AssuranceCleanupError(runId);
    }
    throw error;
  }
}

/** Renders sanitized JSON and Markdown summaries for one owned validation run. */
export function renderFoundationReport(repositoryRoot: string, runId: string): string {
  const canonicalRoot = realpathSync(repositoryRoot);
  const runDirectory = resolveRunDirectory(canonicalRoot, runId);
  const manifestPath = resolve(runDirectory, 'manifest.json');
  if (!lstatSync(manifestPath).isFile() || realpathSync(manifestPath) !== manifestPath) {
    throw new Error('assurance manifest must be a canonical regular file');
  }
  const manifest = foundationManifestSchema.parse(readJson(manifestPath));

  const renderedJson = renderJson(manifest);
  const renderedMarkdown = renderSummary(manifest);

  const summaryDirectory = resolve(runDirectory, 'summary');
  mkdirSync(summaryDirectory, { recursive: true, mode: 0o700 });
  requireCanonicalDirectory(summaryDirectory);
  writeAtomic(resolve(summaryDirectory, 'assurance-summary.json'), renderedJson);
  const markdownPath = resolve(summaryDirectory, 'assurance-summary.md');
  writeAtomic(markdownPath, renderedMarkdown);
  return relative(canonicalRoot, markdownPath).split(sep).join('/');
}
