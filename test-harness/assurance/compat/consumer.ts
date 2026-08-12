import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { runManagedChild } from '../scripts/managed-child.js';
import { inspectFoundationProvenance } from '../scripts/source-provenance.js';
import { digestRegularTree, requireCanonicalChild, sha256Bytes } from './filesystem.js';
import type {
  PackedArchiveIdentity,
  PackedConsumerCleanupResult,
  PackedConsumerProvenance,
  PreparedPackedConsumer,
  PackedSurfaceResult,
} from './model.js';
import { PackedCompatibilityExecutionError as CompatibilityExecutionError } from './model.js';

/** Maximum build, pack, extract, install, or probe runtime. */
const compatibilityStepTimeoutMilliseconds = 600_000;

/** Grace period before a non-cooperative compatibility child is killed. */
const compatibilityTerminationGraceMilliseconds = 5_000;

/** Bounded child output retained for setup classification without exposing it. */
const compatibilityOutputLimitBytes = 256 * 1024;

/** Expected public SDK export names in the current package contract. */
const sdkExportNames = ['.', './agent', './browser', './node'] as const;

/** Creates an owner-only canonical directory. */
function createOwnedDirectory(path: string): void {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  chmodSync(path, 0o700);
  if (!lstatSync(path).isDirectory() || realpathSync(path) !== path) {
    throw new Error('packed consumer directory is not canonical');
  }
}

/** Writes JSON atomically with owner-only permissions. */
function writeJsonAtomic(path: string, value: unknown): void {
  const temporaryPath = `${path}.tmp-${randomUUID()}`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(value, undefined, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    renameSync(temporaryPath, path);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

/** Runs one shell-free child and rejects every non-clean terminal outcome. */
async function runRequiredChild(
  command: string,
  arguments_: readonly string[],
  cwd: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<Awaited<ReturnType<typeof runManagedChild>>> {
  const result = await runManagedChild(command, arguments_, {
    cwd,
    env: environment,
    stdio: 'pipe',
    maxOutputBytes: compatibilityOutputLimitBytes,
    timeoutMilliseconds: compatibilityStepTimeoutMilliseconds,
    terminationGraceMilliseconds: compatibilityTerminationGraceMilliseconds,
    cleanup: () => undefined,
  });
  if (
    result.code !== 0 ||
    result.signal !== null ||
    result.forwardedSignal !== null ||
    result.timedOut ||
    result.setupFailed ||
    result.cleanupFailed ||
    result.outputTruncated
  ) {
    const exitCode = result.cleanupFailed
      ? 60
      : result.forwardedSignal === 'SIGINT'
        ? 130
        : result.forwardedSignal === 'SIGTERM'
          ? 143
          : result.timedOut
            ? 70
            : 30;
    throw new CompatibilityExecutionError(exitCode);
  }
  return result;
}

/** Builds one current package before creating its public archive. */
async function buildPackage(repositoryRoot: string, workspace: string): Promise<void> {
  await runRequiredChild('yarn', ['workspace', workspace, 'build'], repositoryRoot);
}

/** Creates an exact detached source worktree with only the primary toolchain linked into it. */
function createBuildWorktree(repositoryRoot: string, worktreePath: string, revision: string): void {
  execFileSync('git', ['worktree', 'add', '--detach', '--', worktreePath, revision], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 30_000,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  try {
    const primaryModules = realpathSync(resolve(repositoryRoot, 'node_modules'));
    symlinkSync(primaryModules, resolve(worktreePath, 'node_modules'), 'dir');
  } catch (error) {
    try {
      removeBuildWorktree(repositoryRoot, worktreePath);
    } catch {
      throw new CompatibilityExecutionError(
        60,
        `git worktree remove --force -- test-harness/.assurance-runtime/compat/${basename(resolve(worktreePath, '..'))}/build-worktree`,
      );
    }
    throw error;
  }
}

/** Removes only the exact detached build worktree registered by this consumer run. */
function removeBuildWorktree(repositoryRoot: string, worktreePath: string): void {
  execFileSync('git', ['worktree', 'remove', '--force', '--', worktreePath], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 30_000,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
}

/** Packs twice and rejects any non-deterministic archive identity. */
async function packDeterministicArchive(
  repositoryRoot: string,
  archivesDirectory: string,
  inspectionDirectory: string,
  workspace: '@portaidentity/sdk' | '@portaidentity/cli',
  archiveName: string,
): Promise<PackedArchiveIdentity> {
  const archivePath = resolve(archivesDirectory, `${archiveName}.tgz`);
  const comparisonPath = resolve(archivesDirectory, `${archiveName}.comparison.tgz`);
  await runRequiredChild(
    'yarn',
    ['workspace', workspace, 'pack', '--filename', archivePath],
    repositoryRoot,
  );
  await runRequiredChild(
    'yarn',
    ['workspace', workspace, 'pack', '--filename', comparisonPath],
    repositoryRoot,
  );
  const sha256 = sha256Bytes(readFileSync(archivePath));
  if (sha256 !== sha256Bytes(readFileSync(comparisonPath))) {
    throw new Error('package archive is not deterministic');
  }
  rmSync(comparisonPath, { force: true });

  const extractedRoot = resolve(inspectionDirectory, archiveName);
  createOwnedDirectory(extractedRoot);
  await runRequiredChild('tar', ['-xzf', archivePath, '-C', extractedRoot], repositoryRoot);
  const packageRoot = requireCanonicalChild(extractedRoot, resolve(extractedRoot, 'package'));
  const manifestPath = requireCanonicalChild(packageRoot, resolve(packageRoot, 'package.json'));
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    name?: string;
    version?: string;
  };
  if (
    manifest.name !== workspace ||
    typeof manifest.version !== 'string' ||
    manifest.version === ''
  ) {
    throw new Error('packed archive identity does not match its workspace');
  }
  return Object.freeze({
    name: workspace,
    version: manifest.version,
    sha256,
    contentSha256: digestRegularTree(packageRoot),
    archivePath: realpathSync(archivePath),
  });
}

/** Proves the generated consumer is ignored and lies outside every configured workspace. */
function validateConsumerLocation(repositoryRoot: string, consumerPath: string): void {
  const relativePath = consumerPath.slice(realpathSync(repositoryRoot).length + 1);
  if (relativePath.startsWith('packages/')) {
    throw new Error('packed consumer cannot reside in a root workspace');
  }
  execFileSync('git', ['check-ignore', '--quiet', '--', relativePath], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    timeout: 5_000,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
}

/** Proves Yarn installed only the two exact local archives into ordinary package directories. */
function validateInstalledDependencyGraph(
  consumerPath: string,
  dependencies: Readonly<Record<'@portaidentity/sdk' | '@portaidentity/cli', string>>,
  archives: readonly PackedArchiveIdentity[],
): void {
  const manifest = JSON.parse(readFileSync(resolve(consumerPath, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
  };
  if (JSON.stringify(manifest.dependencies) !== JSON.stringify(dependencies)) {
    throw new Error('packed consumer dependencies changed during installation');
  }
  const lock = readFileSync(resolve(consumerPath, 'yarn.lock'), 'utf8');
  for (const [name, source] of Object.entries(dependencies)) {
    if (!lock.includes(`${name}@file:`) || !lock.includes(basename(source.slice(5)))) {
      throw new Error('packed consumer lock does not bind the local archive');
    }
    const installedRoot = resolve(consumerPath, 'node_modules', ...name.split('/'));
    const metadata = lstatSync(installedRoot);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error('packed dependency is not an ordinary installed directory');
    }
    requireCanonicalChild(consumerPath, installedRoot);
    const archive = archives.find((candidate) => candidate.name === name);
    if (
      archive === undefined ||
      digestRegularTree(installedRoot, new Set(['node_modules'])) !== archive.contentSha256
    ) {
      throw new Error('installed packed dependency content does not match its local archive');
    }
  }
}

/**
 * Builds, packs, and installs the current SDK and CLI into one ignored clean consumer.
 *
 * The caller supplies the selected server and fixture identities because this foundation does not
 * start a server. Live compatibility commands obtain both values from their owned harness run.
 */
export async function preparePackedConsumer(
  repositoryRoot: string,
  triplet: PackedConsumerProvenance,
): Promise<PreparedPackedConsumer> {
  const canonicalRoot = realpathSync(repositoryRoot);
  if (!/^sha256:[0-9a-f]{64}$/u.test(triplet.serverImageDigest)) {
    throw new Error('server image digest must be an exact SHA-256');
  }
  if (triplet.fixtureIdentity.trim() === '') throw new Error('fixture identity is required');
  const provenance = inspectFoundationProvenance(canonicalRoot);
  const runId = randomUUID();
  const runRoot = resolve(canonicalRoot, 'test-harness/.assurance-runtime/compat', runId);
  const archivesDirectory = resolve(runRoot, 'archives');
  const inspectionDirectory = resolve(runRoot, 'inspection');
  const consumerPath = resolve(runRoot, 'consumer');
  const cachePath = resolve(runRoot, 'cache');
  const buildWorktreePath = resolve(runRoot, 'build-worktree');
  createOwnedDirectory(archivesDirectory);
  createOwnedDirectory(inspectionDirectory);
  createOwnedDirectory(consumerPath);
  createOwnedDirectory(cachePath);
  validateConsumerLocation(canonicalRoot, consumerPath);
  let buildWorktreeCreated = false;
  try {
    const sourceRevision = provenance.commitIdentity.replace(/^commit:/u, '');
    createBuildWorktree(canonicalRoot, buildWorktreePath, sourceRevision);
    buildWorktreeCreated = true;
    await buildPackage(buildWorktreePath, '@portaidentity/sdk');
    await buildPackage(buildWorktreePath, '@portaidentity/cli');
    const sdk = await packDeterministicArchive(
      buildWorktreePath,
      archivesDirectory,
      inspectionDirectory,
      '@portaidentity/sdk',
      'portaidentity-sdk',
    );
    const cli = await packDeterministicArchive(
      buildWorktreePath,
      archivesDirectory,
      inspectionDirectory,
      '@portaidentity/cli',
      'portaidentity-cli',
    );
    removeBuildWorktree(canonicalRoot, buildWorktreePath);
    buildWorktreeCreated = false;
    const afterPackaging = inspectFoundationProvenance(canonicalRoot);
    if (JSON.stringify(afterPackaging) !== JSON.stringify(provenance)) {
      throw new Error('packed archive source provenance changed during packaging');
    }
    if (sdk.version !== cli.version) throw new Error('current SDK and CLI versions must match');
    const dependencies = Object.freeze({
      '@portaidentity/sdk': `file:${sdk.archivePath}`,
      '@portaidentity/cli': `file:${cli.archivePath}`,
    });
    const templatePath = resolve(canonicalRoot, 'test-harness/consumers/package.template.json');
    const template = JSON.parse(readFileSync(templatePath, 'utf8')) as Record<string, unknown>;
    writeJsonAtomic(resolve(consumerPath, 'package.json'), { ...template, dependencies });
    copyFileSync(
      resolve(canonicalRoot, 'test-harness/consumers/surface-probe.mjs'),
      resolve(consumerPath, 'surface-probe.mjs'),
    );
    await runRequiredChild(
      'yarn',
      [
        'install',
        '--non-interactive',
        '--production=true',
        '--ignore-scripts',
        '--no-progress',
        '--cache-folder',
        cachePath,
      ],
      consumerPath,
      { ...process.env, YARN_CACHE_FOLDER: cachePath },
    );
    validateInstalledDependencyGraph(consumerPath, dependencies, [sdk, cli]);
    return Object.freeze({
      runId,
      consumerPath: realpathSync(consumerPath),
      outsideEveryWorkspace: true,
      ignored: true,
      cleanInstall: true,
      dependencies,
      archives: Object.freeze([sdk, cli]),
      triplet: Object.freeze({
        nodeVersion: process.version,
        serverImageDigest: triplet.serverImageDigest,
        sourceRevision,
        fixtureIdentity: triplet.fixtureIdentity,
      }),
    });
  } catch (error) {
    if (buildWorktreeCreated) {
      try {
        removeBuildWorktree(canonicalRoot, buildWorktreePath);
      } catch {
        throw new CompatibilityExecutionError(
          60,
          `git worktree remove --force -- test-harness/.assurance-runtime/compat/${runId}/build-worktree`,
        );
      }
    }
    try {
      rmSync(runRoot, { recursive: true, force: true });
    } catch {
      throw new CompatibilityExecutionError(
        60,
        `rm -rf -- test-harness/.assurance-runtime/compat/${runId}`,
      );
    }
    throw error;
  }
}

/** Loads all declared SDK export entries and validates the compiled CLI package bin. */
export async function loadPackedSurfaces(
  consumer: PreparedPackedConsumer,
): Promise<PackedSurfaceResult> {
  const probePath = requireCanonicalChild(
    consumer.consumerPath,
    resolve(consumer.consumerPath, 'surface-probe.mjs'),
  );
  const probe = await runRequiredChild(process.execPath, [probePath], consumer.consumerPath);
  const observations = JSON.parse(probe.stdout) as Array<{ exportName?: string; url?: string }>;
  if (!Array.isArray(observations) || observations.length !== sdkExportNames.length) {
    throw new Error('packed SDK export observations are incomplete');
  }
  const sdkRoot = requireCanonicalChild(
    consumer.consumerPath,
    resolve(consumer.consumerPath, 'node_modules/@portaidentity/sdk'),
  );
  const observedNames = observations.map((observation) => observation.exportName ?? '');
  if (JSON.stringify([...observedNames].sort()) !== JSON.stringify([...sdkExportNames].sort())) {
    throw new Error('packed SDK declared exports changed');
  }
  const resolvedSdkFiles = observations.map((observation) => {
    if (typeof observation.url !== 'string' || !observation.url.startsWith('file:')) {
      throw new Error('packed SDK export did not resolve to a file');
    }
    const resolvedPath = requireCanonicalChild(sdkRoot, fileURLToPath(observation.url));
    const fromSdk = relative(sdkRoot, resolvedPath).split(sep).join('/');
    if (!fromSdk.startsWith('dist/') || !fromSdk.endsWith('.js')) {
      throw new Error('packed SDK export did not resolve to compiled dist output');
    }
    const metadata = lstatSync(resolvedPath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error('packed SDK export is not an ordinary compiled file');
    }
    return resolvedPath;
  });
  const cliRoot = requireCanonicalChild(
    consumer.consumerPath,
    resolve(consumer.consumerPath, 'node_modules/@portaidentity/cli'),
  );
  const cliManifest = JSON.parse(readFileSync(resolve(cliRoot, 'package.json'), 'utf8')) as {
    bin?: { porta?: string };
  };
  if (cliManifest.bin?.porta !== './dist/index.js') {
    throw new Error('packed CLI bin does not identify compiled output');
  }
  const cliBinPath = requireCanonicalChild(cliRoot, resolve(cliRoot, cliManifest.bin.porta));
  const executable = lstatSync(cliBinPath);
  if (!executable.isFile() || (executable.mode & 0o111) === 0) {
    throw new Error('packed CLI bin must be an executable regular file');
  }
  return Object.freeze({
    loadedSdkExports: Object.freeze([...observedNames]),
    resolvedSdkFiles: Object.freeze(
      resolvedSdkFiles.map((path) => relative(sdkRoot, path).split(sep).join('/')),
    ),
    cliBinPath,
    distOnly:
      resolvedSdkFiles.length === sdkExportNames.length &&
      relative(cliRoot, cliBinPath).split(sep).join('/').startsWith('dist/'),
  });
}

/** Removes the exact run root owned by one prepared consumer. */
export function cleanupPackedConsumer(
  consumer: PreparedPackedConsumer,
): PackedConsumerCleanupResult {
  const runRoot = resolve(consumer.consumerPath, '..');
  const compatRoot = resolve(runRoot, '..');
  const recoveryCommand = `rm -rf -- test-harness/.assurance-runtime/compat/${consumer.runId}`;
  try {
    if (!/^[0-9a-f-]{36}$/u.test(consumer.runId) || basename(runRoot) !== consumer.runId) {
      throw new Error('packed consumer cleanup identity is malformed');
    }
    requireCanonicalChild(compatRoot, runRoot);
    if (realpathSync(consumer.consumerPath) !== resolve(runRoot, 'consumer')) {
      throw new Error('packed consumer cleanup path does not match its run identity');
    }
    rmSync(runRoot, { recursive: true, force: false });
    return Object.freeze({ removed: true });
  } catch {
    return Object.freeze({ removed: false, recoveryCommand });
  }
}
