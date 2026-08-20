import { realpathSync } from 'node:fs';

import { readActiveCoverageRun, type ActiveCoverageRun } from '../coverage/index.js';
import { RuntimeCommandRunner } from '../../fixtures/lifecycle-runtime.js';

/** Dependency services that may be interrupted inside an owned disposable harness run. */
export type InterruptibleService = 'postgres' | 'redis' | 'mailhog';

/** Every exact Compose service identity used by dependency recovery. */
type OwnedService = InterruptibleService | 'porta';

/** Shell-free command result used by the dependency controller. */
export interface ProductionExposureCommandResult {
  /** Process exit code. */
  readonly exitCode: number;
  /** Bounded standard output. */
  readonly stdout: string;
  /** Bounded standard error. */
  readonly stderr: string;
}

/** Shell-free runner seam used by implementation tests. */
export interface ProductionExposureCommandRunner {
  /** Runs one fixed command or rejects on non-zero exit. */
  checked(
    command: string,
    args: readonly string[],
    options: {
      readonly cwd: string;
      readonly environment: Readonly<Record<string, string>>;
      readonly timeoutMilliseconds?: number;
      readonly signal?: AbortSignal;
    },
  ): Promise<ProductionExposureCommandResult>;
}

/** Copies defined environment variables for shell-free Docker children. */
function currentEnvironment(): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
  );
}

/** Delays one bounded health-poll iteration. */
function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

/**
 * Controls only dependency containers listed in the active lifecycle lease.
 *
 * The controller never uses a Compose project-wide mutation. The immutable container ID remains
 * the authority for stop, start, inspection, and restoration.
 */
export class OwnedDependencyController {
  /** Canonical worktree that owns the active lifecycle. */
  protected readonly repositoryRoot: string;
  /** Complete durable run and resource identity. */
  protected readonly activeRun: ActiveCoverageRun;
  /** Defined environment inherited by shell-free Docker children. */
  protected readonly environment: Readonly<Record<string, string>>;

  /** Creates a controller bound to one already validated active lifecycle. */
  public constructor(
    repositoryRoot: string,
    activeRun: ActiveCoverageRun,
    protected readonly runner: ProductionExposureCommandRunner = new RuntimeCommandRunner(),
  ) {
    this.repositoryRoot = realpathSync(repositoryRoot);
    this.activeRun = activeRun;
    this.environment = currentEnvironment();
    if (realpathSync(activeRun.lease.worktreePath) !== this.repositoryRoot) {
      throw new Error('active dependency controller worktree mismatch');
    }
  }

  /** Creates a controller from the exact durable active-run and lease records. */
  public static fromActiveRun(
    repositoryRoot: string,
    runner?: ProductionExposureCommandRunner,
  ): OwnedDependencyController {
    return new OwnedDependencyController(
      repositoryRoot,
      readActiveCoverageRun(repositoryRoot),
      runner,
    );
  }

  /** Runs a probe while one exact owned dependency is unavailable, then restores it in `finally`. */
  public async whileUnavailable<T>(
    service: InterruptibleService,
    probe: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const containerId = await this.resolveContainer(service, signal);
    await this.runner.checked('docker', ['stop', '--time', '10', '--', containerId], {
      cwd: this.repositoryRoot,
      environment: this.environment,
      timeoutMilliseconds: 30_000,
      signal,
    });
    let result: T | undefined;
    let probeError: unknown;
    try {
      result = await probe();
    } catch (error) {
      probeError = error;
    } finally {
      // Restoration deliberately ignores the caller's aborted signal. Once the owned service has
      // been stopped, cleanup must finish or fail explicitly instead of inheriting cancellation.
      await this.restore(containerId, service);
    }
    if (probeError !== undefined) throw probeError;
    if (result === undefined) throw new Error('dependency probe returned no observation');
    return result;
  }

  /** Restarts only the exact lease-owned Porta container when dependency reconnection requires it. */
  public async restartPorta(): Promise<void> {
    const containerId = await this.resolveContainer('porta');
    await this.runner.checked('docker', ['restart', '--time', '10', '--', containerId], {
      cwd: this.repositoryRoot,
      environment: this.environment,
      timeoutMilliseconds: 60_000,
    });
    await this.waitUntilHealthy(containerId, 'porta');
  }

  /** Resolves and verifies one exact service container from active-run labels and lease IDs. */
  protected async resolveContainer(service: OwnedService, signal?: AbortSignal): Promise<string> {
    const listed = await this.runner.checked(
      'docker',
      [
        'ps',
        '-aq',
        '--no-trunc',
        '--filter',
        `label=com.docker.compose.project=${this.activeRun.composeProject}`,
        '--filter',
        `label=com.docker.compose.service=${service}`,
      ],
      {
        cwd: this.repositoryRoot,
        environment: this.environment,
        timeoutMilliseconds: 30_000,
        signal,
      },
    );
    const identifiers = listed.stdout.trim().split(/\s+/u).filter(Boolean);
    const identifier = identifiers[0];
    if (
      identifiers.length !== 1 ||
      identifier === undefined ||
      !/^[0-9a-f]{64}$/u.test(identifier) ||
      !this.activeRun.lease.containerIds.includes(identifier)
    ) {
      throw new Error('owned dependency container identity is unavailable');
    }
    const inspected = await this.runner.checked(
      'docker',
      [
        'inspect',
        '--format',
        '{{index .Config.Labels "io.porta.assurance.run-id"}}|{{index .Config.Labels "io.porta.assurance.worktree"}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}',
        identifier,
      ],
      {
        cwd: this.repositoryRoot,
        environment: this.environment,
        timeoutMilliseconds: 30_000,
        signal,
      },
    );
    const [runId, worktreePath, composeProject, observedService, extra] = inspected.stdout
      .trim()
      .split('|');
    if (
      extra !== undefined ||
      runId !== this.activeRun.runId ||
      worktreePath !== this.repositoryRoot ||
      composeProject !== this.activeRun.composeProject ||
      observedService !== service
    ) {
      throw new Error('owned dependency labels do not match the active lifecycle');
    }
    return identifier;
  }

  /** Restarts the exact stopped container and waits for a truthful running/healthy state. */
  protected async restore(
    containerId: string,
    service: InterruptibleService,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.runner.checked('docker', ['start', '--', containerId], {
      cwd: this.repositoryRoot,
      environment: this.environment,
      timeoutMilliseconds: 30_000,
      signal,
    });
    await this.waitUntilHealthy(containerId, service, signal);
  }

  /** Waits for one exact restarted service to become running and, where declared, healthy. */
  protected async waitUntilHealthy(
    containerId: string,
    service: OwnedService,
    signal?: AbortSignal,
  ): Promise<void> {
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      const inspected = await this.runner.checked(
        'docker',
        [
          'inspect',
          '--format',
          '{{.State.Running}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}',
          containerId,
        ],
        {
          cwd: this.repositoryRoot,
          environment: this.environment,
          timeoutMilliseconds: 10_000,
          signal,
        },
      );
      const [running, health, extra] = inspected.stdout.trim().split('|');
      if (extra !== undefined) throw new Error('dependency health response is malformed');
      if (
        running === 'true' &&
        (service === 'mailhog' ? health === 'none' : health === 'healthy')
      ) {
        return;
      }
      await delay(250);
    }
    throw new Error('owned dependency did not recover before the deadline');
  }
}
