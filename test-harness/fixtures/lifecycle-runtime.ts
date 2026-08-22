import { spawn, type ChildProcess } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

import type {
  ChildExecutionAdapter,
  ComposeAdapter,
  ComposeInspection,
  DeadlineAdapter,
  EndpointManifest,
  HostProcessIdentity,
  LeaseRecord,
  LifecycleDependencies,
  ManifestConsumerAdapter,
  PrerequisiteAdapter,
  PrerequisiteName,
  SpawnRequest,
} from './lifecycle-planned.js';
import {
  EndpointManifestFileAdapter,
  FileLeaseStateAdapter,
  LinuxProcessProbeAdapter,
  LoopbackEndpointAvailabilityAdapter,
} from './lifecycle-system.js';
import {
  RuntimeCommandRunner,
  RuntimeTimeoutError,
  signalChildProcessGroup,
} from './lifecycle-runtime-command.js';
import {
  createRuntimeResetDependencies,
  runOwnerOnlyBootstrap,
} from './lifecycle-runtime-reset.js';
import { harnessCertificateSubjectAltName } from './lifecycle-validation.js';
export { RuntimeCommandRunner } from './lifecycle-runtime-command.js';

/** Stable runtime environment derived only from one validated endpoint manifest. */
export function environmentForManifest(
  manifest: EndpointManifest,
): Readonly<Record<string, string>> {
  const coverageResultDirectory = coverageResultDirectoryForManifest(manifest);
  return Object.freeze({
    ...currentEnvironment(),
    HARNESS_RUN_ID: manifest.runId,
    HARNESS_PROFILE: manifest.environmentName,
    HARNESS_WORKTREE: manifest.worktreePath,
    HARNESS_PORTA_PORT: String(manifest.ports.porta),
    HARNESS_APP_PORT: String(manifest.ports.app),
    HARNESS_BFF_PORT: String(manifest.ports.bff),
    HARNESS_POSTGRES_PORT: String(manifest.ports.postgres),
    HARNESS_REDIS_PORT: String(manifest.ports.redis),
    HARNESS_MAILHOG_PORT: String(manifest.ports.mailhog),
    HARNESS_PORTA_URL: manifest.urls.porta,
    HARNESS_APP_URL: manifest.urls.app,
    HARNESS_ATTACKER_URL: manifest.urls.attacker,
    HARNESS_BFF_URL: manifest.urls.bff,
    HARNESS_MAILHOG_URL: manifest.urls.mailhog,
    HARNESS_CERT_DIR: dirname(manifest.certificatePath),
    HARNESS_COVERAGE_RESULT_DIR: coverageResultDirectory,
    HARNESS_NODE_V8_COVERAGE:
      process.env.HARNESS_COVERAGE_RESULT_DIR === undefined ? '' : '/app/.v8-coverage',
    PORTA_ENDPOINT_MANIFEST: resolve(
      manifest.worktreePath,
      'test-harness/.assurance-runtime',
      manifest.runId,
      'endpoint-manifest.json',
    ),
    HARNESS_FIXTURE_MANIFEST: resolve(
      manifest.worktreePath,
      'test-harness/.assurance-runtime',
      manifest.runId,
      'fixture-public.json',
    ),
    HARNESS_FIXTURE_CREDENTIALS: resolve(
      manifest.worktreePath,
      'test-harness/.assurance-runtime',
      manifest.runId,
      'fixture-credentials.json',
    ),
  });
}

/** Resolves the coverage result owner without permitting a path outside the current worktree. */
function coverageResultDirectoryForManifest(manifest: EndpointManifest): string {
  const requested = process.env.HARNESS_COVERAGE_RESULT_DIR;
  if (requested === undefined) {
    return resolve(
      manifest.worktreePath,
      'test-harness/.assurance-runtime',
      manifest.runId,
      'coverage-disabled',
    );
  }
  if (!isAbsolute(requested)) throw new Error('coverage result directory must be absolute');
  const allowedRoot = resolve(manifest.worktreePath, 'test-harness/.assurance-results');
  const candidate = resolve(requested);
  const relation = relative(allowedRoot, candidate);
  if (relation === '' || relation.startsWith('..') || isAbsolute(relation)) {
    throw new Error('coverage result directory must be inside the assurance results root');
  }
  if (!existsSync(candidate) || realpathSync(candidate) !== candidate) {
    throw new Error('coverage result directory must be an existing canonical directory');
  }
  return candidate;
}

/** Result of a bounded shell-free child process. */

/** Manages SPA/BFF children under the lifetime of one supervisor process. */
class HarnessClientManager {
  /** Active host processes started for the current run. */
  protected children: Array<{ readonly role: 'spa' | 'bff'; readonly process: ChildProcess }> = [];

  /** Starts both clients once and directs output to an owned runtime log. */
  public async start(manifest: EndpointManifest, signal?: AbortSignal): Promise<void> {
    if (this.children.length > 0) return;
    const runtimeDirectory = resolve(
      manifest.worktreePath,
      'test-harness/.assurance-runtime',
      manifest.runId,
    );
    const log = openSync(resolve(runtimeDirectory, 'clients.log'), 'a', 0o600);
    const environment = environmentForManifest(manifest);
    try {
      for (const role of ['spa', 'bff'] as const) {
        const child = spawn(
          process.execPath,
          ['--import', 'tsx', 'test-harness/scripts/managed-client-bootstrap.ts', role],
          {
            cwd: manifest.worktreePath,
            env: environment,
            detached: process.platform !== 'win32',
            shell: false,
            stdio: ['ignore', log, log, 'ipc'],
          },
        );
        if (child.pid === undefined) throw new Error(`${role} process has no identity`);
        this.children.push({ role, process: child });
        await waitForBootstrapRegistration(child, signal);
        if (signal?.aborted === true) throw new RuntimeTimeoutError();
        child.send?.('release');
      }
    } finally {
      closeSync(log);
    }
    await Promise.all([
      waitForUrl(manifest.urls.app, signal),
      waitForUrl(manifest.urls.bff, signal),
    ]);
  }

  /** Restarts both service children while preserving their registered bootstrap identities. */
  public async restart(manifest: EndpointManifest, signal?: AbortSignal): Promise<void> {
    if (this.children.length !== 2) throw new Error('harness clients are not fully registered');
    await Promise.all(
      this.children.map(({ process: child }) => requestClientRestart(child, signal)),
    );
    await Promise.all([
      waitForUrl(manifest.urls.app, signal),
      waitForUrl(manifest.urls.bff, signal),
    ]);
  }

  /** Terminates only children retained by this supervisor and waits for their exit. */
  public async stop(record: LeaseRecord): Promise<void> {
    const children = this.children.splice(0);
    for (const identity of record.hostProcesses) {
      const presence = await new LinuxProcessProbeAdapter().presence(identity);
      if (presence === 'unreadable') throw new Error('host process ownership is unreadable');
      if (presence === 'present') signalProcessIdentity(identity, 'SIGTERM');
    }
    for (const { process: child } of children) {
      signalChildProcessGroup(child, 'SIGTERM');
    }
    await Promise.all([
      ...children.map(({ process: child }) => waitForChildExit(child)),
      ...record.hostProcesses.map(waitForProcessIdentityExit),
    ]);
  }
}

/** Docker Compose adapter constrained by project, labels, names, and the persisted lease. */
class RuntimeComposeAdapter implements ComposeAdapter {
  /** Creates a project-scoped adapter around the shared lease authority. */
  public constructor(
    protected readonly worktreePath: string,
    protected readonly leases: FileLeaseStateAdapter,
    protected readonly runner: RuntimeCommandRunner,
    protected readonly clients: HarnessClientManager,
  ) {}

  /** Reads Compose labels and resolves them back to the authoritative durable lease. */
  public async inspect(project: string): Promise<ComposeInspection> {
    try {
      const containerResult = await this.runner.checked(
        'docker',
        ['ps', '-aq', '--no-trunc', '--filter', `label=com.docker.compose.project=${project}`],
        { cwd: this.worktreePath, environment: currentEnvironment() },
      );
      const networkResult = await this.runner.checked(
        'docker',
        [
          'network',
          'ls',
          '-q',
          '--no-trunc',
          '--filter',
          `label=com.docker.compose.project=${project}`,
        ],
        { cwd: this.worktreePath, environment: currentEnvironment() },
      );
      const volumeResult = await this.runner.checked(
        'docker',
        ['volume', 'ls', '-q', '--filter', `label=com.docker.compose.project=${project}`],
        { cwd: this.worktreePath, environment: currentEnvironment() },
      );
      const containerIds = splitIdentifiers(containerResult.stdout);
      const networkIds = splitIdentifiers(networkResult.stdout);
      const volumeNames = splitIdentifiers(volumeResult.stdout);
      if (
        containerIds.some((identifier) => !isDockerObjectId(identifier)) ||
        networkIds.some((identifier) => !isDockerObjectId(identifier)) ||
        volumeNames.some((name) => !isDockerVolumeName(name))
      ) {
        return { presence: 'unreadable' };
      }
      if (containerIds.length === 0 && networkIds.length === 0 && volumeNames.length === 0) {
        return { presence: 'absent' };
      }
      if (containerIds.length === 0) return { presence: 'unreadable' };
      const observedLabels = await Promise.all(
        containerIds.map((containerId) => this.inspectContainerLabels(containerId)),
      );
      const [first] = observedLabels;
      if (first === undefined) return { presence: 'unreadable' };
      const { runId, worktreePath } = first;
      if (
        observedLabels.some(
          (labels) =>
            labels.runId !== runId ||
            labels.worktreePath !== worktreePath ||
            labels.project !== project,
        )
      ) {
        return { presence: 'unreadable' };
      }
      for (const networkId of networkIds) {
        const networkLabels = await this.runner.checked(
          'docker',
          [
            'network',
            'inspect',
            '--format',
            '{{index .Labels "io.porta.assurance.run-id"}}|{{index .Labels "io.porta.assurance.worktree"}}|{{index .Labels "com.docker.compose.project"}}',
            networkId,
          ],
          { cwd: this.worktreePath, environment: currentEnvironment() },
        );
        if (networkLabels.stdout.trim() !== `${runId}|${worktreePath}|${project}`) {
          return { presence: 'unreadable' };
        }
      }
      for (const volumeName of volumeNames) {
        const volumeLabels = await this.runner.checked(
          'docker',
          [
            'volume',
            'inspect',
            '--format',
            '{{index .Labels "io.porta.assurance.run-id"}}|{{index .Labels "io.porta.assurance.worktree"}}|{{index .Labels "com.docker.compose.project"}}',
            volumeName,
          ],
          { cwd: this.worktreePath, environment: currentEnvironment() },
        );
        if (volumeLabels.stdout.trim() !== `${runId}|${worktreePath}|${project}`) {
          return { presence: 'unreadable' };
        }
      }
      const services = observedLabels.map((labels) => labels.service).sort();
      if (services.join(',') !== 'mailhog,nginx,porta,postgres,redis') {
        return { presence: 'unreadable' };
      }
      for (const [index, labels] of observedLabels.entries()) {
        const containerId = containerIds[index];
        if (containerId === undefined) return { presence: 'unreadable' };
        const bindingResult = await this.runner.checked(
          'docker',
          ['container', 'inspect', '--format', '{{json .HostConfig.PortBindings}}', containerId],
          { cwd: this.worktreePath, environment: currentEnvironment() },
        );
        const bindingText = bindingResult.stdout;
        if (/"HostIp":"(?!127\.0\.0\.1")[^"]+"/u.test(bindingText)) {
          return { presence: 'unreadable' };
        }
        const publishesHostPort = bindingText.includes('"HostIp":"127.0.0.1"');
        if (labels.service === 'porta' ? publishesHostPort : !publishesHostPort) {
          return { presence: 'unreadable' };
        }
      }
      const identity = await this.leases.read({ runId, worktreePath });
      return typeof identity === 'string'
        ? { presence: 'unreadable' }
        : {
            presence: 'present',
            identity: Object.freeze({
              ...identity,
              containerIds: Object.freeze([...containerIds].sort()),
              networkIds: Object.freeze([...networkIds].sort()),
              volumeNames: Object.freeze([...volumeNames].sort()),
            }),
          };
    } catch {
      return { presence: 'unreadable' };
    }
  }

  /** Reads and validates all ownership labels from one immutable Docker container ID. */
  protected async inspectContainerLabels(containerId: string): Promise<{
    readonly runId: string;
    readonly worktreePath: string;
    readonly project: string;
    readonly service: string;
  }> {
    const labels = await this.runner.checked(
      'docker',
      [
        'inspect',
        '--format',
        '{{index .Config.Labels "io.porta.assurance.run-id"}}|{{index .Config.Labels "io.porta.assurance.worktree"}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}',
        containerId,
      ],
      { cwd: this.worktreePath, environment: currentEnvironment() },
    );
    const [runId, worktreePath, project, service, extra] = labels.stdout.trim().split('|');
    if (
      runId === undefined ||
      worktreePath === undefined ||
      project === undefined ||
      service === undefined ||
      extra !== undefined
    ) {
      throw new Error('Docker ownership labels are incomplete');
    }
    return { runId, worktreePath, project, service };
  }

  /** Builds and starts only the project derived from the immutable manifest. */
  public async start(manifest: EndpointManifest, signal?: AbortSignal): Promise<void> {
    await this.runner.checked(
      'docker',
      this.composeArgs(manifest.composeProject, ['up', '-d', '--build'], manifest.environmentName),
      {
        cwd: this.worktreePath,
        environment: environmentForManifest(manifest),
        timeoutMilliseconds: 600_000,
        signal,
      },
    );
  }

  /** Verifies exact Compose identity and removes only the recorded project and client children. */
  public async stop(record: LeaseRecord): Promise<void> {
    const inspection = await this.inspect(record.composeProject);
    if (inspection.presence === 'present' && inspection.identity !== undefined) {
      if (JSON.stringify(inspection.identity) !== JSON.stringify(record)) {
        throw new Error('Compose ownership changed');
      }
    } else if (inspection.presence === 'unreadable') {
      throw new Error('Compose ownership is unreadable');
    }
    await this.clients.stop(record);
    if (record.containerIds.length > 0) {
      await this.runner.checked('docker', ['rm', '-f', '--', ...record.containerIds], {
        cwd: this.worktreePath,
        environment: environmentForManifest(record.manifest),
        timeoutMilliseconds: 120_000,
      });
    }
    if (record.networkIds.length > 0) {
      await this.runner.checked('docker', ['network', 'rm', ...record.networkIds], {
        cwd: this.worktreePath,
        environment: environmentForManifest(record.manifest),
        timeoutMilliseconds: 120_000,
      });
    }
    if (record.volumeNames.length > 0) {
      await this.runner.checked('docker', ['volume', 'rm', ...record.volumeNames], {
        cwd: this.worktreePath,
        environment: environmentForManifest(record.manifest),
        timeoutMilliseconds: 120_000,
      });
    }
    const postCleanup = await this.inspect(record.composeProject);
    if (postCleanup.presence !== 'absent') {
      throw new Error('Docker resources remain after exact cleanup');
    }
    if (
      (await new LoopbackEndpointAvailabilityAdapter().occupiedEndpoints(record.manifest)).length >
      0
    ) {
      throw new Error('owned endpoints remain bound after cleanup');
    }
    rmSync(resolve(record.worktreePath, 'test-harness/.assurance-runtime', record.runId), {
      recursive: true,
      force: true,
    });
  }

  /** Creates fixed Compose arguments with an explicit project on every invocation. */
  protected composeArgs(
    project: string,
    suffix: readonly string[],
    profile = 'operational',
  ): readonly string[] {
    const files = ['-f', 'test-harness/docker-compose.yml'];
    if (profile === 'production-security') {
      files.push('-f', 'test-harness/docker-compose.production-security.yml');
    }
    return ['compose', '-p', project, ...files, ...suffix];
  }
}

/** Copies the current process environment while excluding undefined values. */
function currentEnvironment(): Readonly<Record<string, string>> {
  const environment: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined) environment[name] = value;
  }
  return environment;
}

/** Generates the run-scoped certificate named by the endpoint manifest. */
class CertificateConsumer implements ManifestConsumerAdapter {
  /** Creates an owner-only key/certificate pair with the exact harness SANs. */
  public async apply(manifest: EndpointManifest): Promise<void> {
    if (!existsSync(manifest.certificatePath)) {
      const runner = new RuntimeCommandRunner();
      mkdirSync(dirname(manifest.certificatePath), { recursive: true, mode: 0o700 });
      await runner.checked(
        'openssl',
        [
          'req',
          '-x509',
          '-nodes',
          '-days',
          '2',
          '-newkey',
          'rsa:2048',
          '-keyout',
          resolve(dirname(manifest.certificatePath), 'server.key'),
          '-out',
          manifest.certificatePath,
          '-subj',
          '/CN=porta-harness.ci.portaidentity.com',
          '-addext',
          harnessCertificateSubjectAltName,
        ],
        { cwd: manifest.worktreePath, environment: environmentForManifest(manifest) },
      );
    }
    const certificate = new X509Certificate(readFileSync(manifest.certificatePath));
    if (!certificate.subjectAltName?.includes('IP Address:127.0.0.1')) {
      throw new Error('harness certificate is missing the required loopback IP identity');
    }
  }
}

/** Fatal prerequisite adapter for the retained harness's current fixture generation. */
class RuntimePrerequisiteAdapter implements PrerequisiteAdapter {
  /** Creates prerequisite actions sharing one manifest and child manager. */
  public constructor(
    protected readonly runner: RuntimeCommandRunner,
    protected readonly clients: HarnessClientManager,
  ) {}

  /** Runs one prerequisite and rejects every non-success before dependent tests begin. */
  public async run(
    name: PrerequisiteName,
    manifest: EndpointManifest,
    signal?: AbortSignal,
  ): Promise<void> {
    const environment = environmentForManifest(manifest);
    if (name === 'dns') {
      await this.runner.checked('node', ['test-harness/scripts/check-loopback-dns.mjs'], {
        cwd: manifest.worktreePath,
        environment,
        signal,
      });
      return;
    }
    if (name === 'health') {
      await waitForUrl(`${manifest.urls.porta}/health`, signal);
      return;
    }
    if (name === 'migration') {
      await this.runner.checked(
        'docker',
        [
          'exec',
          `${manifest.composeProject}-porta-1`,
          'env',
          '-u',
          'NODE_V8_COVERAGE',
          'porta',
          'migrate',
          'status',
        ],
        { cwd: manifest.worktreePath, environment, signal },
      );
      return;
    }
    if (name === 'seed') {
      await runOwnerOnlyBootstrap(this.runner, manifest, signal);
      await this.runner.checked(
        process.execPath,
        ['--import', 'tsx', 'test-harness/scripts/seed.ts'],
        { cwd: manifest.worktreePath, environment, timeoutMilliseconds: 120_000, signal },
      );
      return;
    }
    if (name === 'fixture-verification') {
      await this.verifyRuntimeProfile(manifest, signal);
      await this.copySpaLibraries(manifest);
      await this.clients.start(manifest, signal);
      if (!existsSync(resolve(manifest.worktreePath, 'test-harness/config.generated.json'))) {
        throw new Error('fixture config was not generated');
      }
      return;
    }
    if (name === 'redis-reset') {
      await this.runner.checked(
        'docker',
        ['exec', `${manifest.composeProject}-redis-1`, 'redis-cli', 'FLUSHDB'],
        { cwd: manifest.worktreePath, environment, signal },
      );
      return;
    }
    if (name === 'mailhog-reset') {
      const response = await fetch(`${manifest.urls.mailhog}/api/v1/messages`, {
        method: 'DELETE',
        signal:
          signal === undefined
            ? AbortSignal.timeout(10_000)
            : AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      });
      if (!response.ok) throw new Error('MailHog reset was not successful');
    }
  }

  /** Verifies the selected profile against the running Porta container without exposing its env. */
  protected async verifyRuntimeProfile(
    manifest: EndpointManifest,
    signal?: AbortSignal,
  ): Promise<void> {
    const result = await this.runner.checked(
      'docker',
      [
        'inspect',
        '--format',
        '{{range .Config.Env}}{{println .}}{{end}}',
        `${manifest.composeProject}-porta-1`,
      ],
      { cwd: manifest.worktreePath, environment: environmentForManifest(manifest), signal },
    );
    const environment = new Set(result.stdout.split(/\r?\n/u).filter(Boolean));
    const expected =
      manifest.environmentName === 'production-security'
        ? ['NODE_ENV=production', 'LOG_LEVEL=info']
        : ['NODE_ENV=development', 'LOG_LEVEL=debug'];
    if (!expected.every((entry) => environment.has(entry))) {
      throw new Error('running Porta container does not match the selected runtime profile');
    }
    if (environment.has('PORTA_SKIP_PROD_SAFETY=true')) {
      throw new Error('production safety bypass is forbidden in assurance profiles');
    }
  }

  /** Copies fixed browser dependencies into the ignored SPA runtime directory. */
  protected async copySpaLibraries(manifest: EndpointManifest): Promise<void> {
    mkdirSync(resolve(manifest.worktreePath, 'test-harness/spa/lib'), {
      recursive: true,
      mode: 0o700,
    });
    await this.runner.checked(
      'cp',
      [
        resolve(manifest.worktreePath, 'node_modules/oidc-client-ts/dist/esm/oidc-client-ts.js'),
        resolve(manifest.worktreePath, 'test-harness/spa/lib/oidc-client-ts.js'),
      ],
      { cwd: manifest.worktreePath, environment: environmentForManifest(manifest) },
    );
    await this.runner.checked(
      'cp',
      [
        resolve(manifest.worktreePath, 'node_modules/jwt-decode/build/esm/index.js'),
        resolve(manifest.worktreePath, 'test-harness/spa/lib/jwt-decode.js'),
      ],
      { cwd: manifest.worktreePath, environment: environmentForManifest(manifest) },
    );
  }
}

/** Creates production runtime adapters for one retained harness supervisor. */
export function createRuntimeDependencies(
  worktreePath: string,
  externalSignal?: AbortSignal,
): LifecycleDependencies {
  const leases = new FileLeaseStateAdapter();
  const runner = new RuntimeCommandRunner();
  const clients = new HarnessClientManager();
  const manifestFile = new EndpointManifestFileAdapter();
  const noOperationConsumer: ManifestConsumerAdapter = { async apply(_manifest) {} };
  const compose = new RuntimeComposeAdapter(worktreePath, leases, runner, clients);
  const children: ChildExecutionAdapter = {
    async spawn(request: SpawnRequest) {
      return (
        await runner.run(request.command, request.args, {
          cwd: worktreePath,
          environment: request.environment,
        })
      ).exitCode;
    },
  };
  const deadlines = new RuntimeDeadlineAdapter(externalSignal);
  return {
    leases,
    processes: new LinuxProcessProbeAdapter(),
    compose,
    children,
    endpoints: new LoopbackEndpointAvailabilityAdapter(),
    composeConfig: manifestFile,
    nginx: new CertificateConsumer(),
    seed: noOperationConsumer,
    spa: noOperationConsumer,
    bff: noOperationConsumer,
    playwright: noOperationConsumer,
    health: noOperationConsumer,
    evidence: manifestFile,
    prerequisites: new RuntimePrerequisiteAdapter(runner, clients),
    deadlines,
    reset: createRuntimeResetDependencies(worktreePath, runner, clients),
  };
}

/** Applies one aborting wall-clock deadline to every lifecycle operation. */
class RuntimeDeadlineAdapter implements DeadlineAdapter {
  /** Creates deadlines that also observe an optional lifecycle-supervisor signal. */
  public constructor(protected readonly externalSignal?: AbortSignal) {}

  /** Runs startup with its build allowance and all other operations with the control allowance. */
  public async run<T>(operation: string, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const timeoutMilliseconds = operation === 'startup' ? 900_000 : 120_000;
    const timeout = setTimeout(() => controller.abort(), timeoutMilliseconds);
    const signal =
      this.externalSignal === undefined
        ? controller.signal
        : AbortSignal.any([controller.signal, this.externalSignal]);
    try {
      const result = await work(signal);
      if (signal.aborted) throw new RuntimeTimeoutError();
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Appends child output while enforcing a hard non-secret diagnostic bound. */
/** Splits newline-delimited immutable Docker identifiers without accepting empty values. */
function splitIdentifiers(output: string): readonly string[] {
  return output.trim().split(/\s+/u).filter(Boolean);
}

/** Accepts only immutable full Docker object identifiers returned by no-trunc inspection. */
function isDockerObjectId(identifier: string): boolean {
  return /^[a-f0-9]{64}$/u.test(identifier);
}

/** Accepts only Docker's non-option volume-name alphabet before fixed argv deletion. */
function isDockerVolumeName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_.-]*$/u.test(name);
}

/** Signals the complete isolated child group, falling back to the direct child when unavailable. */
/** Signals one exact recorded host process group after its start fingerprint was verified. */
function signalProcessIdentity(identity: HostProcessIdentity, signal: NodeJS.Signals): void {
  try {
    if (process.platform === 'win32') process.kill(identity.pid, signal);
    else process.kill(-identity.pid, signal);
  } catch {
    // A concurrent natural exit is already the desired terminal state.
  }
}

/** Waits for a recorded host identity to disappear and escalates only that exact process group. */
async function waitForProcessIdentityExit(identity: HostProcessIdentity): Promise<void> {
  const probe = new LinuxProcessProbeAdapter();
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if ((await probe.presence(identity)) === 'absent') return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  if ((await probe.presence(identity)) === 'present') signalProcessIdentity(identity, 'SIGKILL');
  const killDeadline = Date.now() + 5_000;
  while (Date.now() < killDeadline) {
    if ((await probe.presence(identity)) === 'absent') return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error('host process did not terminate');
}

/** Waits for one child to terminate after an owned shutdown request. */
function waitForChildExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolveExit) => {
    const timeout = setTimeout(() => child.kill('SIGKILL'), 5_000);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolveExit();
    });
  });
}

/** Waits until a paused client bootstrap has durably registered its exact process identity. */
function waitForBootstrapRegistration(child: ChildProcess, signal?: AbortSignal): Promise<void> {
  return new Promise((resolveReady, rejectReady) => {
    const timeout = setTimeout(() => finish(new RuntimeTimeoutError()), 30_000);
    const finish = (error?: Error): void => {
      clearTimeout(timeout);
      child.removeListener('message', onMessage);
      child.removeListener('error', onError);
      child.removeListener('exit', onExit);
      signal?.removeEventListener('abort', onAbort);
      if (error === undefined) resolveReady();
      else rejectReady(error);
    };
    const onMessage = (message: unknown): void => {
      if (message === 'registered') finish();
    };
    const onError = (): void => finish(new Error('client bootstrap failed'));
    const onExit = (): void => finish(new Error('client bootstrap exited before registration'));
    const onAbort = (): void => {
      signalChildProcessGroup(child, 'SIGTERM');
      finish(new RuntimeTimeoutError());
    };
    child.on('message', onMessage);
    child.once('error', onError);
    child.once('exit', onExit);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted === true) onAbort();
  });
}

/** Requests one stable bootstrap to replace its service child and acknowledges completion. */
function requestClientRestart(child: ChildProcess, signal?: AbortSignal): Promise<void> {
  return new Promise((resolveRestart, rejectRestart) => {
    const timeout = setTimeout(() => finish(new RuntimeTimeoutError()), 30_000);
    const finish = (error?: Error): void => {
      clearTimeout(timeout);
      child.removeListener('message', onMessage);
      child.removeListener('error', onError);
      child.removeListener('exit', onExit);
      signal?.removeEventListener('abort', onAbort);
      if (error === undefined) resolveRestart();
      else rejectRestart(error);
    };
    const onMessage = (message: unknown): void => {
      if (message === 'restarted') finish();
    };
    const onError = (): void => finish(new Error('client bootstrap restart failed'));
    const onExit = (): void => finish(new Error('client bootstrap exited during restart'));
    const onAbort = (): void => finish(new RuntimeTimeoutError());
    child.on('message', onMessage);
    child.once('error', onError);
    child.once('exit', onExit);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted === true) onAbort();
    else if (!child.connected) finish(new Error('client bootstrap IPC is unavailable'));
    else child.send('restart');
  });
}

/** Polls one public URL until success or a bounded startup deadline. */
async function waitForUrl(url: string, signal?: AbortSignal): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (signal?.aborted === true) throw new RuntimeTimeoutError();
    if (await curlSucceeds(url, signal)) return;
    await abortableDelay(500, signal);
  }
  throw new RuntimeTimeoutError();
}

/** Checks one URL with the harness's generated certificate accepted only for this child. */
function curlSucceeds(url: string, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolveResult) => {
    const child = spawn('curl', ['-ksf', '--max-time', '2', url], {
      signal,
      shell: false,
      stdio: 'ignore',
    });
    child.once('error', () => resolveResult(false));
    child.once('exit', (code) => resolveResult(code === 0));
  });
}

/** Waits between health probes while allowing the owning lifecycle deadline to cancel promptly. */
function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted === true) return Promise.reject(new RuntimeTimeoutError());
  return new Promise((resolveDelay, rejectDelay) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolveDelay();
    }, milliseconds);
    const abort = (): void => {
      clearTimeout(timeout);
      rejectDelay(new RuntimeTimeoutError());
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}
