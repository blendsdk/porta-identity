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
  writeFileSync,
} from 'node:fs';
import { basename, resolve } from 'node:path';
import process from 'node:process';

import { runManagedChild } from '../scripts/managed-child.js';
import { inspectFoundationProvenance } from '../scripts/source-provenance.js';
import { digestRegularTree, requireCanonicalChild, sha256Bytes } from './filesystem.js';
import type {
  PackedArchiveIdentity,
  PackedConsumerProvenance,
  PreparedPackedConsumer,
  PackedSurfaceResult,
} from './model.js';

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
): Promise<void> {
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
    throw new Error('packed consumer prerequisite failed');
  }
}

/** Builds one current package before creating its public archive. */
async function buildPackage(repositoryRoot: string, workspace: string): Promise<void> {
  await runRequiredChild('yarn', ['workspace', workspace, 'build'], repositoryRoot);
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
  createOwnedDirectory(archivesDirectory);
  createOwnedDirectory(inspectionDirectory);
  createOwnedDirectory(consumerPath);
  createOwnedDirectory(cachePath);
  validateConsumerLocation(canonicalRoot, consumerPath);
  try {
    await buildPackage(canonicalRoot, '@portaidentity/sdk');
    await buildPackage(canonicalRoot, '@portaidentity/cli');
    const sdk = await packDeterministicArchive(
      canonicalRoot,
      archivesDirectory,
      inspectionDirectory,
      '@portaidentity/sdk',
      'portaidentity-sdk',
    );
    const cli = await packDeterministicArchive(
      canonicalRoot,
      archivesDirectory,
      inspectionDirectory,
      '@portaidentity/cli',
      'portaidentity-cli',
    );
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
    validateInstalledDependencyGraph(consumerPath, dependencies);
    const sourceRevision = provenance.commitIdentity.replace(/^commit:/u, '');
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
    rmSync(runRoot, { recursive: true, force: true });
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
  await runRequiredChild(process.execPath, [probePath], consumer.consumerPath);
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
    loadedSdkExports: Object.freeze([...sdkExportNames]),
    cliBinPath,
    distOnly: cliBinPath.includes('/dist/'),
  });
}

/** Removes the exact run root owned by one prepared consumer. */
export function cleanupPackedConsumer(consumer: PreparedPackedConsumer): void {
  const runRoot = resolve(consumer.consumerPath, '..');
  requireCanonicalChild(resolve(runRoot, '..'), runRoot);
  rmSync(runRoot, { recursive: true, force: true });
}
