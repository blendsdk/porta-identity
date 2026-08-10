import { execFileSync } from 'node:child_process';
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
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { commandContracts, commandContractVersion } from '../commands.js';
import { redSignatureRegistrySchema, traceabilitySchema } from '../schema.js';
import { renderJson, renderSummary } from './render-summary.js';
import { validateRedSignatureRegistry, validateTraceability } from './validate-assurance.js';

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

/** Returns the SHA-256 digest of one repository file. */
function digestFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
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

/** Executes foundation validation and returns the generated owned run UUID. */
export function runFoundationValidation(repositoryRoot: string): string {
  const canonicalRoot = realpathSync(repositoryRoot);
  const startedAt = new Date().toISOString();
  const traceabilityPath = resolve(canonicalRoot, 'test-harness/assurance/traceability.json');
  const signaturesPath = resolve(canonicalRoot, 'test-harness/assurance/red-signatures.json');
  const lockPath = resolve(canonicalRoot, 'yarn.lock');

  const traceability = traceabilitySchema.parse(readJson(traceabilityPath));
  validateTraceability(traceability, []);
  const signatures = redSignatureRegistrySchema.parse(readJson(signaturesPath));
  validateRedSignatureRegistry(signatures);
  if (commandContractVersion !== 1 || Object.keys(commandContracts).length !== 11) {
    throw new Error('root assurance command contract is incomplete');
  }

  const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: canonicalRoot,
    encoding: 'utf8',
    timeout: 5_000,
  }).trim();
  const dependencyLockDigest = `sha256:${digestFile(lockPath)}`;
  const definitionDigests = {
    traceability: `sha256:${digestFile(traceabilityPath)}`,
    redSignatures: `sha256:${digestFile(signaturesPath)}`,
  };

  const runId = randomUUID();
  const runDirectory = createRunDirectory(canonicalRoot, runId);
  try {
    const validationDirectory = resolve(runDirectory, 'validation');
    mkdirSync(validationDirectory, { mode: 0o700 });
    requireCanonicalDirectory(validationDirectory);

    const result = {
      id: 'foundation-validation',
      status: 'passed',
      requirementCount: traceability.requirements.length,
      caseCount: traceability.cases.length,
      taskCount: traceability.tasks.length,
      claimCount: traceability.claims.length,
      redSignatureCount: signatures.signatures.length,
      commandContractVersion,
    };
    writeAtomic(resolve(validationDirectory, 'result.json'), renderJson(result));

    const manifest = {
      runId,
      status: 'passed',
      command: 'yarn assurance:validate',
      startedAt,
      completedAt: new Date().toISOString(),
      buildIdentity: `commit:${revision}`,
      dependencyLockDigest,
      definitionDigests,
      toolVersions: { node: process.version, commandContract: commandContractVersion },
      artifacts: ['validation/result.json'],
      accessPolicy: 'local operator and restricted CI artifact readers only',
      retentionPolicy: 'local runs are disposable; CI retention must be explicitly configured',
    };
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
  const manifest = readJson(manifestPath);

  const summaryDirectory = resolve(runDirectory, 'summary');
  mkdirSync(summaryDirectory, { recursive: true, mode: 0o700 });
  requireCanonicalDirectory(summaryDirectory);
  writeAtomic(resolve(summaryDirectory, 'assurance-summary.json'), renderJson(manifest));
  const markdownPath = resolve(summaryDirectory, 'assurance-summary.md');
  writeAtomic(markdownPath, renderSummary(manifest));
  return relative(canonicalRoot, markdownPath).split(sep).join('/');
}
