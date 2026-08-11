import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

import { z } from 'zod';

import { RuntimeCommandRunner } from '../../fixtures/lifecycle-runtime.js';

const activeRunSchema = z.object({
  runId: z.uuid(),
  worktreePath: z.string().min(1),
  manifest: z.object({
    runId: z.uuid(),
    composeProject: z.string().min(1),
  }),
});

/** Supported harness project captured by the server-process coverage command. */
export type CoverageProject = 'protocol' | 'security';

/** Supported runtime profile captured by the server-process coverage command. */
export type CoverageProfile = 'operational' | 'production-security';

/** Harness-owned paths for one ignored coverage run. */
export interface CoverageWorkspace {
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
  /** Generated public fixture identity. */
  readonly fixtureDigest: string;
  /** Node version executing Porta. */
  readonly nodeVersion: string;
  /** Exact covered process identity. */
  readonly processIdentity: string;
  /** Fixed build operation used by the owned lifecycle. */
  readonly buildCommand: string;
  /** Whether graceful termination produced complete parseable raw records. */
  readonly flushStatus: 'complete' | 'incomplete';
  /** Every retained raw V8 file. */
  readonly rawFiles: readonly RawCoverageFileIdentity[];
}

/** Creates an ignored, run-owned workspace and a world-writable container handoff directory. */
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
  mkdirSync(rawDirectory, { recursive: true, mode: 0o700 });
  chmodSync(rawDirectory, 0o777);
  mkdirSync(compiledDirectory, { recursive: true, mode: 0o700 });
  return Object.freeze({
    runId,
    root,
    rawDirectory,
    compiledDirectory,
    manifestPath: resolve(root, 'capture-manifest.json'),
  });
}

/** Returns the single active lifecycle and verifies it belongs to the current worktree. */
export function readActiveCoverageRun(repositoryRoot: string): {
  readonly runId: string;
  readonly composeProject: string;
} {
  const canonicalRoot = realpathSync(repositoryRoot);
  const activePath = resolve(canonicalRoot, 'test-harness/.assurance-runtime/active-run.json');
  const active = activeRunSchema.parse(JSON.parse(readFileSync(activePath, 'utf8')));
  if (realpathSync(active.worktreePath) !== canonicalRoot || active.runId !== active.manifest.runId) {
    throw new Error('active lifecycle identity does not belong to this worktree');
  }
  return { runId: active.runId, composeProject: active.manifest.composeProject };
}

/** Discovers the exact Porta container and snapshots the compiled build before termination. */
export async function inspectPortaContainer(
  repositoryRoot: string,
  workspace: CoverageWorkspace,
  activeRun: Readonly<{ runId: string; composeProject: string }>,
  signal?: AbortSignal,
): Promise<PortaContainerIdentity> {
  const runner = new RuntimeCommandRunner();
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
      '{{.Image}}|{{index .Config.Labels "io.porta.assurance.run-id"}}',
      containerId,
    ],
    { cwd: repositoryRoot, environment, signal },
  );
  const [imageDigest, runId, extra] = inspected.stdout.trim().split('|');
  if (extra !== undefined || runId !== activeRun.runId || !/^sha256:[0-9a-f]{64}$/u.test(imageDigest ?? '')) {
    throw new Error('Porta container provenance does not match the active lifecycle');
  }
  const node = await runner.checked('docker', ['exec', containerId, 'node', '--version'], {
    cwd: repositoryRoot,
    environment,
    signal,
  });
  await runner.checked(
    'docker',
    ['cp', `${containerId}:/app/dist/.`, workspace.compiledDirectory],
    { cwd: repositoryRoot, environment, signal },
  );
  return {
    containerId,
    imageDigest: imageDigest ?? '',
    nodeVersion: node.stdout.trim(),
    lifecycleRunId: activeRun.runId,
    composeProject: activeRun.composeProject,
  };
}

/** Gracefully terminates the exact Porta container and waits for V8 to flush raw output. */
export async function gracefullyFlushPorta(
  repositoryRoot: string,
  container: PortaContainerIdentity,
  signal?: AbortSignal,
): Promise<void> {
  const runner = new RuntimeCommandRunner();
  await runner.checked(
    'docker',
    ['kill', '--signal=SIGTERM', '--', container.containerId],
    { cwd: repositoryRoot, environment: currentEnvironment(), signal },
  );
  await runner.checked('docker', ['wait', container.containerId], {
    cwd: repositoryRoot,
    environment: currentEnvironment(),
    signal,
  });
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
  const runner = new RuntimeCommandRunner();
  const revision = (
    await runner.checked('git', ['rev-parse', 'HEAD^{commit}'], {
      cwd: repositoryRoot,
      environment: currentEnvironment(),
    })
  ).stdout.trim();
  const fixturePath = resolve(
    repositoryRoot,
    'test-harness/.assurance-runtime',
    container.lifecycleRunId,
    'fixture-public.json',
  );
  const manifest: CoverageCaptureManifest = {
    version: 1,
    runId: workspace.runId,
    seed: options.seed,
    project: options.project,
    profile: options.profile,
    revision,
    imageDigest: container.imageDigest,
    dependencyLockDigest: digestFile(resolve(repositoryRoot, 'yarn.lock')),
    fixtureDigest: digestFile(fixturePath),
    nodeVersion: container.nodeVersion,
    processIdentity: `container:${container.containerId}`,
    buildCommand: 'docker compose up -d --build',
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
  return { ...process.env, HARNESS_COVERAGE_RAW_DIR: workspace.rawDirectory };
}

/** Parses and identifies every regular raw V8 JSON file in stable order. */
function readRawCoverageFiles(rawDirectory: string): readonly RawCoverageFileIdentity[] {
  const files: RawCoverageFileIdentity[] = [];
  for (const entry of readdirSync(rawDirectory, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (!entry.isFile() || !/^coverage-[0-9]+-[0-9]+-[0-9]+\.json$/u.test(entry.name)) {
      throw new Error(`unexpected raw coverage entry: ${entry.name}`);
    }
    const path = resolve(rawDirectory, entry.name);
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      !Array.isArray(Reflect.get(parsed, 'result'))
    ) {
      throw new Error(`raw coverage envelope is malformed: ${entry.name}`);
    }
    files.push({ name: entry.name, digest: digestFile(path), bytes: statSync(path).size });
  }
  return Object.freeze(files);
}

/** Returns a SHA-256 identity without retaining file contents. */
function digestFile(path: string): string {
  return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
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
