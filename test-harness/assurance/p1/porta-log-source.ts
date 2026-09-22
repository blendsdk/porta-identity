/**
 * Bounded Porta container log capture for the P1 live boundary.
 *
 * The production-security harness runs Porta in an owned Compose container whose logs are the only
 * source of the structured `security.decision.v1` events. This module resolves that exact container
 * by its owned labels and reads a bounded, timestamped log window using fixed `docker` arguments.
 * The command runner is injected so the resolution and argument construction are testable without
 * Docker.
 *
 * @module p1/porta-log-source
 */

/** Minimal command runner surface needed to read owned container logs. */
export interface LogCommandRunner {
  /**
   * Runs one fixed command with an argument array and no shell.
   *
   * @param command - Executable name.
   * @param args - Fixed argument array.
   * @param options - Working directory, environment, and optional abort signal.
   * @returns The captured standard output.
   */
  checked(
    command: string,
    args: readonly string[],
    options: {
      readonly cwd: string;
      readonly environment: Readonly<Record<string, string>>;
      readonly signal?: AbortSignal;
    },
  ): Promise<{ readonly stdout: string }>;
}

/** The owned-run fact needed to isolate one Porta container. */
export interface OwnedRunIdentity {
  /** Compose project name owned by the active assurance run. */
  readonly composeProject: string;
}

/** Inputs for resolving the owned Porta container. */
export interface ResolvePortaContainerOptions {
  /** Repository root used as the command working directory. */
  readonly repositoryRoot: string;
  /** Active owned run identity. */
  readonly activeRun: OwnedRunIdentity;
  /** Injected command runner. */
  readonly runner: LogCommandRunner;
  /** Process environment for the child command. */
  readonly environment: Readonly<Record<string, string>>;
  /** Optional abort signal. */
  readonly signal?: AbortSignal;
}

/** Inputs for reading a bounded Porta log window. */
export interface ReadPortaLogOptions extends ResolvePortaContainerOptions {
  /** Inclusive start of the captured window. */
  readonly since: Date;
  /** Inclusive end of the captured window. */
  readonly until: Date;
}

/** A bounded log capture and the exact container it came from. */
export interface PortaLogCapture {
  /** Validated full container identifier. */
  readonly containerId: string;
  /** Raw timestamped log text. */
  readonly text: string;
}

/** Returns true when a value is a full 64-character hexadecimal container id. */
function isContainerId(value: string): boolean {
  return /^[0-9a-f]{64}$/u.test(value);
}

/**
 * Resolve the single owned Porta container id.
 *
 * @param options - Resolution inputs.
 * @returns The validated full container id.
 * @throws {Error} When the owned run does not resolve to exactly one well-formed container.
 */
export async function resolveOwnedPortaContainer(
  options: ResolvePortaContainerOptions,
): Promise<string> {
  const listed = await options.runner.checked(
    'docker',
    [
      'ps',
      '-aq',
      '--no-trunc',
      '--filter',
      `label=com.docker.compose.project=${options.activeRun.composeProject}`,
      '--filter',
      'label=com.docker.compose.service=porta',
    ],
    {
      cwd: options.repositoryRoot,
      environment: options.environment,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    },
  );
  const containerIds = listed.stdout.trim().split(/\s+/u).filter(Boolean);
  if (containerIds.length !== 1) throw new Error('expected exactly one owned Porta container');
  const containerId = containerIds[0];
  if (containerId === undefined || !isContainerId(containerId)) {
    throw new Error('Porta container identity is malformed');
  }
  return containerId;
}

/**
 * Read one bounded, timestamped log window from a resolved container.
 *
 * @param containerId - Validated full container id.
 * @param options - Log window inputs.
 * @returns The raw timestamped log text.
 */
async function readContainerLog(
  containerId: string,
  options: ReadPortaLogOptions,
): Promise<string> {
  const logged = await options.runner.checked(
    'docker',
    [
      'logs',
      '--timestamps',
      '--since',
      options.since.toISOString(),
      '--until',
      options.until.toISOString(),
      '--',
      containerId,
    ],
    {
      cwd: options.repositoryRoot,
      environment: options.environment,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    },
  );
  return logged.stdout;
}

/**
 * Resolve the owned Porta container and read one bounded log window from it.
 *
 * @param options - Capture inputs.
 * @returns The validated container id and its captured log text.
 */
export async function capturePortaLog(options: ReadPortaLogOptions): Promise<PortaLogCapture> {
  const containerId = await resolveOwnedPortaContainer(options);
  const text = await readContainerLog(containerId, options);
  return { containerId, text };
}
