import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

import { z } from 'zod';

import { RuntimeCommandRunner } from '../../fixtures/lifecycle-runtime.js';
import { FileLeaseStateAdapter } from '../../fixtures/lifecycle-system.js';
import type { LeaseRecord } from '../../fixtures/lifecycle.js';
import type { CoverageRuntimeDependencyInventory } from './model.js';

const provenanceRevisionEnvironment = 'HARNESS_COVERAGE_REVISION';
const provenanceLockEnvironment = 'HARNESS_COVERAGE_LOCK_DIGEST';
const provenanceSourceEnvironment = 'HARNESS_COVERAGE_SOURCE_TREE_DIGEST';

/** Bounded script evaluated only inside the exact lease-authorized Porta container. */
const runtimeDependencyInventoryScript = String.raw`
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { posix } from 'node:path';
const dependencies = [];
const visitPackage = (root) => {
  const manifestPath = posix.join(root, 'package.json');
  if (!existsSync(manifestPath)) return;
  const bytes = readFileSync(manifestPath);
  const manifest = JSON.parse(bytes.toString('utf8'));
  if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string') return;
  dependencies.push({
    name: manifest.name,
    version: manifest.version,
    rootPath: root,
    integrity: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
  });
  const nested = posix.join(root, 'node_modules');
  if (existsSync(nested)) visitModules(nested);
};
const visitModules = (root) => {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '.bin') continue;
    const child = posix.join(root, entry.name);
    if (entry.name.startsWith('@')) {
      for (const scoped of readdirSync(child, { withFileTypes: true })) {
        if (scoped.isDirectory()) visitPackage(posix.join(child, scoped.name));
      }
    } else visitPackage(child);
  }
};
visitModules('/app/node_modules');
dependencies.sort((left, right) => left.rootPath.localeCompare(right.rootPath));
process.stdout.write(JSON.stringify(dependencies));
`;

const runtimeDependencySchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  rootPath: z.string().regex(/^\/app\/node_modules\//u),
  integrity: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
});

const activeRunSchema = z.object({
  runId: z.uuid(),
  worktreePath: z.string().min(1),
  manifest: z.object({
    runId: z.uuid(),
    composeProject: z.string().min(1),
  }),
});

/** Maximum number of raw process files accepted from one bounded Porta run. */
const maximumRawCoverageFiles = 256;

/** Maximum bytes accepted for one raw V8 process file. */
const maximumRawCoverageFileBytes = 32 * 1024 * 1024;

/** Maximum aggregate bytes accepted for one raw V8 capture. */
const maximumRawCoverageBytes = 256 * 1024 * 1024;

/** Shell-free command capability used by the raw extraction boundary. */
interface CoverageCommandRunner {
  /** Runs one fixed command or rejects without returning untrusted process output. */
  checked(
    command: string,
    args: readonly string[],
    options: {
      readonly cwd: string;
      readonly environment: Readonly<Record<string, string>>;
      readonly timeoutMilliseconds?: number;
      readonly signal?: AbortSignal;
    },
  ): Promise<Readonly<{ exitCode: number; stdout: string; stderr: string }>>;
}

/** Supported harness project captured by the server-process coverage command. */
export type CoverageProject = 'protocol' | 'security';

/** Supported runtime profile captured by the server-process coverage command. */
export type CoverageProfile = 'operational' | 'production-security';

/** Harness-owned paths for one ignored coverage run. */
export interface CoverageWorkspace {
  /** Canonical repository whose clean source state owns this run. */
  readonly repositoryRoot: string;
  /** Synthetic evidence run identifier. */
  readonly runId: string;
  /** Root directory for this coverage run. */
  readonly root: string;
  /** Host directory bind-mounted into the Porta container. */
  readonly rawDirectory: string;
  /** Snapshot of exact compiled JavaScript and source maps from the covered container. */
  readonly compiledDirectory: string;
  /** Machine-readable capture manifest path. */
  readonly manifestPath: string;
  /** Deterministic JSON and HTML report directory. */
  readonly reportDirectory: string;
}

/** Non-secret identity of the active owned Porta container. */
export interface PortaContainerIdentity {
  /** Immutable Docker container identifier. */
  readonly containerId: string;
  /** Immutable image content identifier. */
  readonly imageDigest: string;
  /** Node version executing Porta. */
  readonly nodeVersion: string;
  /** Lifecycle run that owns the container. */
  readonly lifecycleRunId: string;
  /** Compose project that owns the container. */
  readonly composeProject: string;
  /** Exact clean revision supplied to the image build. */
  readonly revision: string;
  /** Exact dependency lock supplied to the image build. */
  readonly dependencyLockDigest: string;
  /** Exact clean tracked source tree supplied to the image build. */
  readonly sourceTreeDigest: string;
  /** Public fixture identity observed before the covered requests. */
  readonly fixtureDigest: string;
  /** Runtime packages enumerated inside this exact container image. */
  readonly runtimeDependencyInventory: CoverageRuntimeDependencyInventory;
}

/** Complete active lifecycle authority used to select one destructive capture target. */
export interface ActiveCoverageRun {
  readonly runId: string;
  readonly composeProject: string;
  readonly lease: LeaseRecord;
}

/** One raw V8 file retained after graceful process termination. */
export interface RawCoverageFileIdentity {
  /** Stable run-relative filename. */
  readonly name: string;
  /** SHA-256 content identity. */
  readonly digest: string;
  /** Exact byte length. */
  readonly bytes: number;
}

/** Provenance manifest written before conversion can begin. */
export interface CoverageCaptureManifest {
  /** Manifest schema version. */
  readonly version: 1;
  /** Synthetic evidence run identifier. */
  readonly runId: string;
  /** Durable lifecycle run that produced the covered process. */
  readonly lifecycleRunId: string;
  /** Fixed harness seed. */
  readonly seed: string;
  /** Harness project that produced the requests. */
  readonly project: CoverageProject;
  /** Runtime profile used for the covered server. */
  readonly profile: CoverageProfile;
  /** Exact source commit used to build the image. */
  readonly revision: string;
  /** Docker image content identity. */
  readonly imageDigest: string;
  /** Root dependency lock identity. */
  readonly dependencyLockDigest: string;
  /** Exact clean tracked source tree supplied to the attributed image build. */
  readonly sourceTreeDigest: string;
  /** Generated public fixture identity. */
  readonly fixtureDigest: string;
  /** Exact digest of compiled JavaScript and source maps copied from the image. */
  readonly compiledOutputDigest: string;
  /** Node version executing Porta. */
  readonly nodeVersion: string;
  /** Exact covered process identity. */
  readonly processIdentity: string;
  /** Fixed build operation used by the owned lifecycle. */
  readonly buildCommand: string;
  /** Exact normalized Compose arguments used by the owned lifecycle. */
  readonly buildArguments: readonly string[];
  /** Image-bound runtime packages eligible for dependency exclusion. */
  readonly runtimeDependencyInventory: CoverageRuntimeDependencyInventory;
  /** Whether graceful termination produced complete parseable raw records. */
  readonly flushStatus: 'complete' | 'incomplete';
  /** Every retained raw V8 file. */
  readonly rawFiles: readonly RawCoverageFileIdentity[];
}

/** Creates an ignored run-owned workspace; raw output is absent until validated extraction. */
export function createCoverageWorkspace(
  repositoryRoot: string,
  project: CoverageProject,
  profile: CoverageProfile,
): CoverageWorkspace {
  const canonicalRoot = realpathSync(repositoryRoot);
  const runId = randomUUID();
  const root = resolve(
    canonicalRoot,
    'test-harness/.assurance-results',
    runId,
    'coverage',
    project,
    profile,
  );
  const rawDirectory = resolve(root, 'raw');
  const compiledDirectory = resolve(root, 'compiled');
  mkdirSync(compiledDirectory, { recursive: true, mode: 0o700 });
  return Object.freeze({
    runId,
    repositoryRoot: canonicalRoot,
    root,
    rawDirectory,
    compiledDirectory,
    manifestPath: resolve(root, 'capture-manifest.json'),
    reportDirectory: resolve(root, 'report'),
  });
}

/** Returns the single active lifecycle and verifies it belongs to the current worktree. */
export function readActiveCoverageRun(
  repositoryRoot: string,
  leases = new FileLeaseStateAdapter(),
): ActiveCoverageRun {
  const canonicalRoot = realpathSync(repositoryRoot);
  const activePath = resolve(canonicalRoot, 'test-harness/.assurance-runtime/active-run.json');
  const active = activeRunSchema.parse(JSON.parse(readFileSync(activePath, 'utf8')));
  if (
    realpathSync(active.worktreePath) !== canonicalRoot ||
    active.runId !== active.manifest.runId
  ) {
    throw new Error('active lifecycle identity does not belong to this worktree');
  }
  const lease = leases.readSync({ runId: active.runId, worktreePath: canonicalRoot });
  if (
    typeof lease === 'string' ||
    lease.runId !== active.runId ||
    lease.composeProject !== active.manifest.composeProject ||
    realpathSync(lease.worktreePath) !== canonicalRoot ||
    lease.manifest.runId !== active.runId ||
    lease.manifest.composeProject !== active.manifest.composeProject
  ) {
    throw new Error('active lifecycle does not have complete durable lease authority');
  }
  return { runId: active.runId, composeProject: active.manifest.composeProject, lease };
}

/** Discovers the exact Porta container and snapshots the compiled build before termination. */
export async function inspectPortaContainer(
  repositoryRoot: string,
  workspace: CoverageWorkspace,
  activeRun: ActiveCoverageRun,
  signal?: AbortSignal,
  runner: CoverageCommandRunner = new RuntimeCommandRunner(),
  leases = new FileLeaseStateAdapter(),
): Promise<PortaContainerIdentity> {
  const environment = currentEnvironment();
  const listed = await runner.checked(
    'docker',
    [
      'ps',
      '-aq',
      '--no-trunc',
      '--filter',
      `label=com.docker.compose.project=${activeRun.composeProject}`,
      '--filter',
      'label=com.docker.compose.service=porta',
    ],
    { cwd: repositoryRoot, environment, signal },
  );
  const containerIds = listed.stdout.trim().split(/\s+/u).filter(Boolean);
  if (containerIds.length !== 1) throw new Error('expected exactly one owned Porta container');
  const containerId = containerIds[0];
  if (containerId === undefined || !/^[0-9a-f]{64}$/u.test(containerId)) {
    throw new Error('Porta container identity is malformed');
  }
  const inspected = await runner.checked(
    'docker',
    [
      'inspect',
      '--format',
      '{{.Image}}|{{index .Config.Labels "io.porta.assurance.run-id"}}|{{index .Config.Labels "io.porta.assurance.worktree"}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}|{{index .Config.Labels "io.porta.assurance.coverage-revision"}}|{{index .Config.Labels "io.porta.assurance.coverage-lock-digest"}}|{{index .Config.Labels "io.porta.assurance.coverage-source-tree-digest"}}',
      containerId,
    ],
    { cwd: repositoryRoot, environment, signal },
  );
  const [
    imageDigest,
    runId,
    worktreePath,
    composeProject,
    service,
    revision,
    dependencyLockDigest,
    sourceTreeDigest,
    extra,
  ] = inspected.stdout.trim().split('|');
  const currentProvenance = readCleanSourceProvenance(repositoryRoot);
  const persistedLease = leases.readSync({
    runId: activeRun.runId,
    worktreePath: realpathSync(repositoryRoot),
  });
  if (
    extra !== undefined ||
    runId !== activeRun.runId ||
    worktreePath !== realpathSync(repositoryRoot) ||
    composeProject !== activeRun.composeProject ||
    service !== 'porta' ||
    revision !== currentProvenance.revision ||
    dependencyLockDigest !== currentProvenance.dependencyLockDigest ||
    sourceTreeDigest !== currentProvenance.sourceTreeDigest ||
    typeof persistedLease === 'string' ||
    JSON.stringify(persistedLease) !== JSON.stringify(activeRun.lease) ||
    !persistedLease.containerIds.includes(containerId ?? '') ||
    !/^sha256:[0-9a-f]{64}$/u.test(imageDigest ?? '')
  ) {
    throw new Error('Porta container provenance does not match the active lifecycle');
  }
  const node = await runner.checked(
    'docker',
    ['exec', containerId, 'env', '-u', 'NODE_V8_COVERAGE', 'node', '--version'],
    {
      cwd: repositoryRoot,
      environment,
      signal,
    },
  );
  const inventoryOutput = await runner.checked(
    'docker',
    [
      'exec',
      containerId,
      'env',
      '-u',
      'NODE_V8_COVERAGE',
      'node',
      '--input-type=module',
      '-e',
      runtimeDependencyInventoryScript,
    ],
    { cwd: repositoryRoot, environment, signal, timeoutMilliseconds: 30_000 },
  );
  const dependencies = z
    .array(runtimeDependencySchema)
    .min(1)
    .parse(JSON.parse(inventoryOutput.stdout));
  await runner.checked(
    'docker',
    ['cp', `${containerId}:/app/dist/.`, workspace.compiledDirectory],
    { cwd: repositoryRoot, environment, signal },
  );
  const fixturePath = resolve(
    repositoryRoot,
    'test-harness/.assurance-runtime',
    activeRun.runId,
    'fixture-public.json',
  );
  return {
    containerId,
    imageDigest: imageDigest ?? '',
    nodeVersion: node.stdout.trim(),
    lifecycleRunId: activeRun.runId,
    composeProject: activeRun.composeProject,
    revision: revision ?? '',
    dependencyLockDigest: dependencyLockDigest ?? '',
    sourceTreeDigest: sourceTreeDigest ?? '',
    fixtureDigest: digestCoverageFile(fixturePath),
    runtimeDependencyInventory: Object.freeze({
      revision: revision ?? '',
      imageDigest: imageDigest ?? '',
      dependencies: Object.freeze(dependencies.map((dependency) => Object.freeze(dependency))),
    }),
  };
}

/** Gracefully terminates the exact Porta container and waits for V8 to flush raw output. */
export async function gracefullyFlushPorta(
  repositoryRoot: string,
  container: PortaContainerIdentity,
  signal?: AbortSignal,
  runner: CoverageCommandRunner = new RuntimeCommandRunner(),
): Promise<void> {
  await runner.checked('docker', ['kill', '--signal=SIGTERM', '--', container.containerId], {
    cwd: repositoryRoot,
    environment: currentEnvironment(),
    signal,
    timeoutMilliseconds: 30_000,
  });
  const waited = await runner.checked('docker', ['wait', container.containerId], {
    cwd: repositoryRoot,
    environment: currentEnvironment(),
    signal,
    timeoutMilliseconds: 30_000,
  });
  if (waited.stdout.trim() !== '0') {
    throw new Error('Porta did not exit cleanly after graceful termination');
  }
  const state = await runner.checked(
    'docker',
    [
      'inspect',
      '--format',
      '{{.State.Status}}|{{.State.OOMKilled}}|{{.State.ExitCode}}',
      container.containerId,
    ],
    {
      cwd: repositoryRoot,
      environment: currentEnvironment(),
      signal,
      timeoutMilliseconds: 30_000,
    },
  );
  if (state.stdout.trim() !== 'exited|false|0') {
    throw new Error('Porta final state does not prove a graceful coverage flush');
  }
}

/**
 * Extracts raw output through Docker so host evidence never depends on the container UID.
 *
 * The final raw directory does not exist until every staged file has passed the bounded envelope
 * checks. A failed extraction removes only its run-owned staging directory.
 */
export async function extractRawCoverage(
  repositoryRoot: string,
  workspace: CoverageWorkspace,
  container: PortaContainerIdentity,
  signal?: AbortSignal,
  runner: CoverageCommandRunner = new RuntimeCommandRunner(),
): Promise<readonly RawCoverageFileIdentity[]> {
  const stagingDirectory = resolve(workspace.root, '.raw-staging');
  validateOwnedPath(workspace.root, stagingDirectory);
  if (existsSync(stagingDirectory) || existsSync(workspace.rawDirectory)) {
    throw new Error('raw coverage extraction destination already exists');
  }
  mkdirSync(stagingDirectory, { mode: 0o700 });
  try {
    await runner.checked(
      'docker',
      ['cp', `${container.containerId}:/app/.v8-coverage/.`, stagingDirectory],
      { cwd: repositoryRoot, environment: currentEnvironment(), signal },
    );
    const rawFiles = readRawCoverageFiles(stagingDirectory);
    if (rawFiles.length === 0) throw new Error('graceful coverage flush produced no raw files');
    renameSync(stagingDirectory, workspace.rawDirectory);
    chmodSync(workspace.rawDirectory, 0o700);
    return rawFiles;
  } catch (error) {
    rmSync(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
}

/** Validates every raw record and writes the provenance-bound capture manifest. */
export async function writeCaptureManifest(
  repositoryRoot: string,
  workspace: CoverageWorkspace,
  container: PortaContainerIdentity,
  options: Readonly<{ seed: string; project: CoverageProject; profile: CoverageProfile }>,
): Promise<CoverageCaptureManifest> {
  const rawFiles = readRawCoverageFiles(workspace.rawDirectory);
  chmodSync(workspace.rawDirectory, 0o700);
  const provenance = readCleanSourceProvenance(repositoryRoot);
  const fixturePath = resolve(
    repositoryRoot,
    'test-harness/.assurance-runtime',
    container.lifecycleRunId,
    'fixture-public.json',
  );
  const fixtureDigest = digestCoverageFile(fixturePath);
  if (
    provenance.revision !== container.revision ||
    provenance.dependencyLockDigest !== container.dependencyLockDigest ||
    provenance.sourceTreeDigest !== container.sourceTreeDigest ||
    fixtureDigest !== container.fixtureDigest
  ) {
    throw new Error('coverage build inputs changed after the attributed image was started');
  }
  const manifest: CoverageCaptureManifest = {
    version: 1,
    runId: workspace.runId,
    lifecycleRunId: container.lifecycleRunId,
    seed: options.seed,
    project: options.project,
    profile: options.profile,
    revision: provenance.revision,
    imageDigest: container.imageDigest,
    dependencyLockDigest: provenance.dependencyLockDigest,
    sourceTreeDigest: provenance.sourceTreeDigest,
    fixtureDigest,
    compiledOutputDigest: digestCoverageDirectory(workspace.compiledDirectory),
    nodeVersion: container.nodeVersion,
    processIdentity: `container:${container.containerId}`,
    buildCommand: 'docker compose',
    buildArguments: Object.freeze([
      '-p',
      container.composeProject,
      '-f',
      'test-harness/docker-compose.yml',
      ...(options.profile === 'production-security'
        ? ['-f', 'test-harness/docker-compose.production-security.yml']
        : []),
      'up',
      '-d',
      '--build',
    ]),
    runtimeDependencyInventory: container.runtimeDependencyInventory,
    flushStatus: rawFiles.length === 0 ? 'incomplete' : 'complete',
    rawFiles,
  };
  writeFileSync(workspace.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  return manifest;
}

/** Returns the environment overrides that enable V8 coverage only for the Porta service. */
export function coverageEnvironment(workspace: CoverageWorkspace): NodeJS.ProcessEnv {
  validateOwnedPath(workspace.root, workspace.rawDirectory);
  const provenance = readCleanSourceProvenance(workspace.repositoryRoot);
  return {
    ...process.env,
    HARNESS_COVERAGE_RESULT_DIR: workspace.root,
    [provenanceRevisionEnvironment]: provenance.revision,
    [provenanceLockEnvironment]: provenance.dependencyLockDigest,
    [provenanceSourceEnvironment]: provenance.sourceTreeDigest,
  };
}

/** Returns exact clean inputs used to authorize an attributed Docker build. */
export function readCleanSourceProvenance(repositoryRoot: string): Readonly<{
  revision: string;
  dependencyLockDigest: string;
  sourceTreeDigest: string;
}> {
  const canonicalRoot = realpathSync(repositoryRoot);
  const status = runGit(canonicalRoot, ['status', '--porcelain=v1', '--untracked-files=all', '-z']);
  if (status.length !== 0) {
    throw new Error('coverage attribution requires a clean source tree');
  }
  const revision = runGit(canonicalRoot, ['rev-parse', 'HEAD^{commit}']).toString('utf8').trim();
  if (!/^[0-9a-f]{40}$/u.test(revision)) throw new Error('coverage revision is malformed');
  return Object.freeze({
    revision,
    dependencyLockDigest: digestCoverageFile(resolve(canonicalRoot, 'yarn.lock')),
    sourceTreeDigest: digestTrackedSourceTree(canonicalRoot),
  });
}

/** Hashes tracked paths and contents without following committed symbolic links. */
function digestTrackedSourceTree(repositoryRoot: string): string {
  const listed = runGit(repositoryRoot, ['ls-files', '-z']);
  const paths = listed
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
  const digest = createHash('sha256');
  for (const trackedPath of paths) {
    const path = resolve(repositoryRoot, trackedPath);
    const relation = relative(repositoryRoot, path);
    if (relation.startsWith('..') || isAbsolute(relation)) {
      throw new Error('tracked source path escapes the repository');
    }
    const status = lstatSync(path);
    digest.update(trackedPath);
    digest.update('\0');
    if (status.isFile()) digest.update(readFileSync(path));
    else if (status.isSymbolicLink()) digest.update(`symlink:${readlinkSync(path)}`);
    else throw new Error('tracked source contains an unsupported path type');
    digest.update('\0');
  }
  return `sha256:${digest.digest('hex')}`;
}

/** Executes a fixed Git query without a shell or inherited diagnostic output. */
function runGit(repositoryRoot: string, args: readonly string[]): Buffer {
  try {
    return execFileSync('git', args, {
      cwd: repositoryRoot,
      encoding: 'buffer',
      maxBuffer: 16 * 1024 * 1024,
      timeout: 30_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    throw new Error('coverage source provenance could not be established');
  }
}

/** Parses and identifies every regular raw V8 JSON file in stable order. */
function readRawCoverageFiles(rawDirectory: string): readonly RawCoverageFileIdentity[] {
  const files: RawCoverageFileIdentity[] = [];
  const entries = readdirSync(rawDirectory, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  if (entries.length > maximumRawCoverageFiles) {
    throw new Error('raw coverage file count exceeds its bound');
  }
  let aggregateBytes = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !/^coverage-[0-9]+-[0-9]+-[0-9]+\.json$/u.test(entry.name)) {
      throw new Error(`unexpected raw coverage entry: ${entry.name}`);
    }
    const path = resolve(rawDirectory, entry.name);
    const bytes = statSync(path).size;
    aggregateBytes += bytes;
    if (bytes > maximumRawCoverageFileBytes || aggregateBytes > maximumRawCoverageBytes) {
      throw new Error('raw coverage byte count exceeds its bound');
    }
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      !Array.isArray(Reflect.get(parsed, 'result'))
    ) {
      throw new Error(`raw coverage envelope is malformed: ${entry.name}`);
    }
    chmodSync(path, 0o600);
    files.push({ name: entry.name, digest: digestCoverageFile(path), bytes });
  }
  return Object.freeze(files);
}

/** Returns a SHA-256 identity without retaining file contents. */
export function digestCoverageFile(path: string): string {
  return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
}

/** Returns a stable identity for every regular file beneath one generated directory. */
export function digestCoverageDirectory(directory: string): string {
  const digest = createHash('sha256');
  for (const relativePath of listCoverageFiles(directory)) {
    digest.update(relativePath);
    digest.update('\0');
    digest.update(readFileSync(resolve(directory, relativePath)));
    digest.update('\0');
  }
  return `sha256:${digest.digest('hex')}`;
}

/** Lists only regular generated files in stable repository-independent order. */
function listCoverageFiles(directory: string, prefix = ''): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...listCoverageFiles(path, relativePath));
    else if (entry.isFile()) files.push(relativePath);
    else throw new Error(`compiled coverage snapshot contains a non-regular path: ${relativePath}`);
  }
  return files;
}

/** Ensures a generated child stays beneath its exact owned workspace. */
function validateOwnedPath(root: string, child: string): void {
  const relation = relative(resolve(root), resolve(child));
  if (relation === '' || relation.startsWith('..') || isAbsolute(relation)) {
    throw new Error('coverage artifact path escapes its owned workspace');
  }
}

/** Copies the current environment while excluding undefined values. */
function currentEnvironment(): Readonly<Record<string, string>> {
  const environment: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined) environment[name] = value;
  }
  return environment;
}
