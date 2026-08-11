import { spawn, type ChildProcess } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type {
  ChildExecutionAdapter,
  ComposeAdapter,
  ComposeInspection,
  DeadlineAdapter,
  EndpointManifest,
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

/** Stable runtime environment derived only from one validated endpoint manifest. */
export function environmentForManifest(
  manifest: EndpointManifest,
): Readonly<Record<string, string>> {
  return Object.freeze({
    ...currentEnvironment(),
    HARNESS_RUN_ID: manifest.runId,
    HARNESS_WORKTREE: manifest.worktreePath,
    HARNESS_PORTA_PORT: String(manifest.ports.porta),
    HARNESS_APP_PORT: String(manifest.ports.app),
    HARNESS_BFF_PORT: String(manifest.ports.bff),
    HARNESS_POSTGRES_PORT: String(manifest.ports.postgres),
    HARNESS_REDIS_PORT: String(manifest.ports.redis),
    HARNESS_MAILHOG_PORT: String(manifest.ports.mailhog),
    HARNESS_PORTA_URL: manifest.urls.porta,
    HARNESS_APP_URL: manifest.urls.app,
    HARNESS_BFF_URL: manifest.urls.bff,
    HARNESS_MAILHOG_URL: manifest.urls.mailhog,
    HARNESS_CERT_DIR: dirname(manifest.certificatePath),
    PORTA_ENDPOINT_MANIFEST: resolve(
      manifest.worktreePath,
      'test-harness/.assurance-runtime',
      manifest.runId,
      'endpoint-manifest.json',
    ),
  });
}

/** Result of a bounded shell-free child process. */
interface CommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs fixed executables with argument arrays, bounded output, and no shell interpretation. */
class RuntimeCommandRunner {
  /** Executes a command and rejects on timeout, spawn failure, output overflow, or non-zero exit. */
  public async checked(
    command: string,
    args: readonly string[],
    options: {
      readonly cwd: string;
      readonly environment: Readonly<Record<string, string>>;
      readonly timeoutMilliseconds?: number;
    },
  ): Promise<CommandResult> {
    const result = await this.run(command, args, options);
    if (result.exitCode !== 0) {
      process.stderr.write(
        `HARNESS_RUNTIME_COMMAND_FAILED: command=${command} exit=${result.exitCode}\n`,
      );
      throw new Error(`${command} failed with exit ${result.exitCode}`);
    }
    return result;
  }

  /** Executes a bounded command and returns sanitized process facts to the caller. */
  public run(
    command: string,
    args: readonly string[],
    options: {
      readonly cwd: string;
      readonly environment: Readonly<Record<string, string>>;
      readonly timeoutMilliseconds?: number;
    },
  ): Promise<CommandResult> {
    return new Promise((resolveResult, rejectResult) => {
      const child = spawn(command, args, {
        cwd: options.cwd,
        env: options.environment,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        child.kill('SIGTERM');
        rejectResult(error);
      };
      const timeout = setTimeout(() => {
        if (settled) return;
        fail(new RuntimeTimeoutError());
      }, options.timeoutMilliseconds ?? 120_000);
      child.stdout?.on('data', (chunk: Buffer) => {
        const appended = appendBounded(stdout, chunk);
        if (appended === undefined) fail(new Error('runtime child output exceeded its bound'));
        else stdout = appended;
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        const appended = appendBounded(stderr, chunk);
        if (appended === undefined) fail(new Error('runtime child output exceeded its bound'));
        else stderr = appended;
      });
      child.once('error', (error) => {
        settled = true;
        clearTimeout(timeout);
        rejectResult(error);
      });
      child.once('exit', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolveResult({ exitCode: code ?? 30, stdout, stderr });
      });
    });
  }
}

/** Timeout error carrying only the stable discriminator consumed by the controller. */
class RuntimeTimeoutError extends Error {
  /** Stable interruption kind used by lifecycle classification. */
  public readonly kind = 'timeout';

  /** Creates one non-secret timeout error. */
  public constructor() {
    super('runtime command exceeded its deadline');
    this.name = 'RuntimeTimeoutError';
  }
}

/** Manages SPA/BFF children under the lifetime of one supervisor process. */
class HarnessClientManager {
  /** Active host processes started for the current run. */
  protected children: ChildProcess[] = [];

  /** Starts both clients once and directs output to an owned runtime log. */
  public async start(manifest: EndpointManifest): Promise<void> {
    if (this.children.length > 0) return;
    const runtimeDirectory = resolve(
      manifest.worktreePath,
      'test-harness/.assurance-runtime',
      manifest.runId,
    );
    const log = openSync(resolve(runtimeDirectory, 'clients.log'), 'a', 0o600);
    const environment = environmentForManifest(manifest);
    for (const script of ['test-harness/spa-server.ts', 'test-harness/bff/server.ts']) {
      const child = spawn(process.execPath, ['--import', 'tsx', script], {
        cwd: manifest.worktreePath,
        env: environment,
        shell: false,
        stdio: ['ignore', log, log],
      });
      this.children.push(child);
    }
    closeSync(log);
    await Promise.all([waitForUrl(manifest.urls.app), waitForUrl(manifest.urls.bff)]);
  }

  /** Terminates only children retained by this supervisor and waits for their exit. */
  public async stop(): Promise<void> {
    const children = this.children.splice(0);
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    }
    await Promise.all(children.map(waitForChildExit));
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
      const result = await this.runner.checked(
        'docker',
        ['ps', '-aq', '--filter', `label=com.docker.compose.project=${project}`],
        { cwd: this.worktreePath, environment: currentEnvironment() },
      );
      const containerId = result.stdout.trim().split(/\s+/u).filter(Boolean)[0];
      if (containerId === undefined) return { presence: 'absent' };
      const labels = await this.runner.checked(
        'docker',
        [
          'inspect',
          '--format',
          '{{index .Config.Labels "io.porta.assurance.run-id"}}|{{index .Config.Labels "io.porta.assurance.worktree"}}',
          containerId,
        ],
        { cwd: this.worktreePath, environment: currentEnvironment() },
      );
      const [runId, worktreePath] = labels.stdout.trim().split('|');
      if (runId === undefined || worktreePath === undefined) return { presence: 'unreadable' };
      const identity = await this.leases.read({ runId, worktreePath });
      return typeof identity === 'string'
        ? { presence: 'unreadable' }
        : { presence: 'present', identity };
    } catch {
      return { presence: 'unreadable' };
    }
  }

  /** Builds and starts only the project derived from the immutable manifest. */
  public async start(manifest: EndpointManifest): Promise<void> {
    await this.runner.checked(
      'docker',
      this.composeArgs(manifest.composeProject, ['up', '-d', '--build']),
      {
        cwd: this.worktreePath,
        environment: environmentForManifest(manifest),
        timeoutMilliseconds: 600_000,
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
    await this.clients.stop();
    await this.runner.checked(
      'docker',
      this.composeArgs(record.composeProject, ['down', '--volumes', '--remove-orphans']),
      {
        cwd: this.worktreePath,
        environment: environmentForManifest(record.manifest),
        timeoutMilliseconds: 120_000,
      },
    );
    rmSync(resolve(record.worktreePath, 'test-harness/.assurance-runtime', record.runId), {
      recursive: true,
      force: true,
    });
  }

  /** Creates fixed Compose arguments with an explicit project on every invocation. */
  protected composeArgs(project: string, suffix: readonly string[]): readonly string[] {
    return ['compose', '-p', project, '-f', 'test-harness/docker-compose.yml', ...suffix];
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
    if (existsSync(manifest.certificatePath)) return;
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
        'subjectAltName=DNS:porta-harness.ci.portaidentity.com,DNS:app-harness.ci.portaidentity.com,DNS:localhost,IP:127.0.0.1',
      ],
      { cwd: manifest.worktreePath, environment: environmentForManifest(manifest) },
    );
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
  public async run(name: PrerequisiteName, manifest: EndpointManifest): Promise<void> {
    const environment = environmentForManifest(manifest);
    if (name === 'dns') {
      await this.runner.checked('node', ['test-harness/scripts/check-loopback-dns.mjs'], {
        cwd: manifest.worktreePath,
        environment,
      });
      return;
    }
    if (name === 'health') {
      await waitForUrl(`${manifest.urls.porta}/health`);
      return;
    }
    if (name === 'migration') {
      await this.runner.checked(
        'docker',
        ['exec', `${manifest.composeProject}-porta-1`, 'porta', 'migrate', 'status'],
        { cwd: manifest.worktreePath, environment },
      );
      return;
    }
    if (name === 'seed') {
      await this.runner.checked(
        'docker',
        [
          'exec',
          `${manifest.composeProject}-porta-1`,
          'porta',
          'init',
          '--force',
          '--email',
          'admin@test-harness.local',
          '--given-name',
          'Admin',
          '--family-name',
          'User',
          '--password',
          'TestPassword123!',
        ],
        { cwd: manifest.worktreePath, environment },
      );
      await this.runner.checked(
        process.execPath,
        ['--import', 'tsx', 'test-harness/scripts/seed.ts'],
        { cwd: manifest.worktreePath, environment, timeoutMilliseconds: 120_000 },
      );
      return;
    }
    if (name === 'fixture-verification') {
      await this.copySpaLibraries(manifest);
      await this.clients.start(manifest);
      if (!existsSync(resolve(manifest.worktreePath, 'test-harness/config.generated.json'))) {
        throw new Error('fixture config was not generated');
      }
      return;
    }
    if (name === 'redis-reset') {
      await this.runner.checked(
        'docker',
        ['exec', `${manifest.composeProject}-redis-1`, 'redis-cli', 'FLUSHDB'],
        { cwd: manifest.worktreePath, environment },
      );
      return;
    }
    if (name === 'mailhog-reset') {
      const response = await fetch(`${manifest.urls.mailhog}/api/v1/messages`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('MailHog reset was not successful');
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
export function createRuntimeDependencies(worktreePath: string): LifecycleDependencies {
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
  const deadlines: DeadlineAdapter = {
    async run(_operation, work) {
      return work();
    },
  };
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
  };
}

/** Appends child output while enforcing a hard non-secret diagnostic bound. */
function appendBounded(previous: string, chunk: Buffer): string | undefined {
  const next = previous + chunk.toString('utf8');
  return Buffer.byteLength(next, 'utf8') > 256 * 1024 ? undefined : next;
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

/** Polls one public URL until success or a bounded startup deadline. */
async function waitForUrl(url: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await curlSucceeds(url)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new RuntimeTimeoutError();
}

/** Checks one URL with the harness's generated certificate accepted only for this child. */
function curlSucceeds(url: string): Promise<boolean> {
  return new Promise((resolveResult) => {
    const child = spawn('curl', ['-ksf', '--max-time', '2', url], {
      shell: false,
      stdio: 'ignore',
    });
    child.once('error', () => resolveResult(false));
    child.once('exit', (code) => resolveResult(code === 0));
  });
}
