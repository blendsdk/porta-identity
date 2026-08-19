import { spawn } from 'node:child_process';
import { createServer, createConnection, type Server } from 'node:net';
import {
  closeSync,
  chmodSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { randomInt, randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';

import { z } from 'zod';

import type {
  LifecycleExitCode,
  LifecycleOutcome,
  OwnedRun,
} from '../fixtures/lifecycle-planned.js';
import { createLifecycleController } from '../fixtures/lifecycle-planned.js';
import {
  createRuntimeDependencies,
  environmentForManifest,
  RuntimeCommandRunner,
} from '../fixtures/lifecycle-runtime.js';
import { RuntimeTimeoutError } from '../fixtures/lifecycle-runtime-command.js';
import { lifecycleSocketDirectory, lifecycleSocketPath } from '../fixtures/lifecycle-validation.js';

const actionSchema = z.enum([
  'start',
  'supervise',
  'prepare',
  'reset',
  'restart-porta',
  'recover',
  'stop',
  'test',
  'project',
]);
const activeRunSchema = z.object({
  runId: z.uuid(),
  worktreePath: z.string().min(1),
  socketPath: z.string().min(1),
  supervisorPid: z.number().int().positive(),
  manifest: z.object({
    runId: z.uuid(),
    scenarioId: z.string().min(1),
    composeProject: z.string().min(1),
    worktreePath: z.string().min(1),
    environmentName: z.string().min(1),
    ports: z.object({
      porta: z.number().int(),
      app: z.number().int(),
      bff: z.number().int(),
      postgres: z.number().int(),
      redis: z.number().int(),
      mailhog: z.number().int(),
    }),
    urls: z.object({
      porta: z.string().url(),
      app: z.string().url(),
      attacker: z.string().url(),
      bff: z.string().url(),
      postgres: z.string().url(),
      redis: z.string().url(),
      mailhog: z.string().url(),
    }),
    certificatePath: z.string().min(1),
  }),
});

/** Validated non-secret discovery record for the active worktree supervisor. */
type ActiveRun = z.infer<typeof activeRunSchema>;

/** Request accepted by the owner-only local lifecycle control socket. */
type AssuranceProject = 'spa' | 'bff' | 'protocol' | 'security' | 'compatibility';

/** Serialized owner-socket actions, including project admission. */
type ControlAction = 'prepare' | 'reset' | 'restart-porta' | 'stop' | `project:${AssuranceProject}`;

/** Parses one bounded control action without trusting a caller-supplied discriminator. */
function parseControlAction(rawRequest: string): ControlAction {
  const value = z.string().parse(JSON.parse(rawRequest));
  if (value === 'prepare' || value === 'reset' || value === 'restart-porta' || value === 'stop') {
    return value;
  }
  const match = /^project:(.+)$/u.exec(value);
  const project = z.enum(['spa', 'bff', 'protocol', 'security', 'compatibility']).parse(match?.[1]);
  return `project:${project}`;
}

/** Maximum bytes accepted from one local control request. */
const maximumControlBytes = 1024;
const profileSchema = z.enum(['operational', 'production-security']);

/** Resolves the canonical repository worktree owning this command. */
function worktreePath(): string {
  return realpathSync(resolve(import.meta.dirname, '../..'));
}

/** Returns the ignored active-run discovery path for one worktree. */
function activeRunPath(root: string): string {
  return resolve(root, 'test-harness/.assurance-runtime/active-run.json');
}

/** Starts interactively or launches a detached long-lived CI supervisor. */
async function start(options: readonly string[]): Promise<LifecycleExitCode> {
  const ci = options[0] === '--ci';
  let profile: z.infer<typeof profileSchema> = 'operational';
  if (options.length === 3 && ci && options[1] === '--profile') {
    const parsedProfile = profileSchema.safeParse(options[2]);
    if (!parsedProfile.success) return 30;
    profile = parsedProfile.data;
  } else if (options.length !== 0 && !(options.length === 1 && ci)) return 30;
  const root = worktreePath();
  if (existsSync(activeRunPath(root))) return 30;
  const runId = randomUUID();
  const candidateBasePort = randomInt(3_000, 5_000) * 10;
  if (!ci) {
    return supervise(root, runId, candidateBasePort, profile);
  }

  const runtimeDirectory = resolve(root, 'test-harness/.assurance-runtime', runId);
  mkdirSync(runtimeDirectory, { recursive: true, mode: 0o700 });
  const logFile = openSync(resolve(runtimeDirectory, 'supervisor.log'), 'a', 0o600);
  const supervisorRef: { current?: ReturnType<typeof spawn> } = {};
  let interrupted: 130 | 143 | undefined;
  const forwardStartupSignal = (signal: 'SIGINT' | 'SIGTERM'): void => {
    interrupted ??= signal === 'SIGINT' ? 130 : 143;
    supervisorRef.current?.kill(signal);
  };
  const onSigint = (): void => forwardStartupSignal('SIGINT');
  const onSigterm = (): void => forwardStartupSignal('SIGTERM');
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      'test-harness/scripts/lifecycle.ts',
      'supervise',
      '--run-id',
      runId,
      '--base-port',
      String(candidateBasePort),
      '--profile',
      profile,
    ],
    {
      cwd: root,
      env: process.env,
      detached: true,
      shell: false,
      stdio: ['ignore', logFile, logFile],
    },
  );
  supervisorRef.current = child;
  closeSync(logFile);
  if (interrupted !== undefined) child.kill(interrupted === 130 ? 'SIGINT' : 'SIGTERM');
  try {
    await waitForActiveRun(root, runId, 600_000, child);
    if (interrupted !== undefined) {
      await waitForSupervisorExit(child);
      const cleanupExit = await cleanupStaleRuns(root, true);
      if (cleanupExit === 0) rmSync(runtimeDirectory, { recursive: true, force: true });
      return cleanupExit === 0 ? interrupted : 60;
    }
    child.unref();
    process.stdout.write(`HARNESS_RUN_ID=${runId}\n`);
    return 0;
  } catch (error) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await waitForSupervisorExit(child);
    const cleanupExit = await cleanupStaleRuns(root, true);
    if (cleanupExit === 0) rmSync(runtimeDirectory, { recursive: true, force: true });
    if (cleanupExit !== 0) return 60;
    if (interrupted !== undefined) return interrupted;
    throw error;
  } finally {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  }
}

/** Joins one exact startup supervisor so the launcher cannot report before cleanup ownership ends. */
async function waitForSupervisorExit(supervisor: ReturnType<typeof spawn>): Promise<void> {
  if (supervisor.exitCode !== null || supervisor.signalCode !== null) return;
  await new Promise<void>((resolveExit) => {
    const force = setTimeout(() => supervisor.kill('SIGKILL'), 10_000);
    supervisor.once('exit', () => {
      clearTimeout(force);
      resolveExit();
    });
  });
}

/** Runs the lifecycle supervisor until an exact stop request or signal completes cleanup. */
async function supervise(
  root: string,
  runId: string,
  candidateBasePort: number,
  profile: 'operational' | 'production-security',
): Promise<LifecycleExitCode> {
  const startupAbort = new AbortController();
  let requestedSignal: 130 | 143 | undefined;
  let dispatchSignal = (exitCode: 130 | 143): void => {
    requestedSignal ??= exitCode;
    startupAbort.abort();
  };
  const onSigint = (): void => dispatchSignal(130);
  const onSigterm = (): void => dispatchSignal(143);
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);

  const controller = createLifecycleController(
    createRuntimeDependencies(root, startupAbort.signal),
  );
  const started = await controller.start({
    runId,
    scenarioId: `assurance-${profile}`,
    worktreePath: root,
    environmentName: profile,
    candidateBasePort,
    collisionRetries: 16,
  });
  if (started.ownedRun === undefined) {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
    process.stderr.write(
      `HARNESS_START_FAILED: exit=${started.outcome.exitCode} prerequisite=${started.outcome.prerequisite ?? 'runtime'} recovery=${started.outcome.recoveryIdentifiers.join(',') || 'none'}\n`,
    );
    return requestedSignal !== undefined && started.outcome.exitCode !== 60
      ? requestedSignal
      : started.outcome.exitCode;
  }

  let ownedRun: OwnedRun = started.ownedRun;
  const socketDirectory = lifecycleSocketDirectory(runId);
  mkdirSync(socketDirectory, { recursive: true, mode: 0o700 });
  chmodSync(socketDirectory, 0o700);
  const socketPath = lifecycleSocketPath(runId);
  rmSync(socketPath, { force: true });
  let stopping = false;
  let activeProjectAbort: AbortController | undefined;
  let operationQueue: Promise<void> = Promise.resolve();
  let stopOperation: Promise<LifecycleOutcome> | undefined;
  let resolveStopped: (exitCode: LifecycleExitCode) => void = () => undefined;
  const stopped = new Promise<LifecycleExitCode>((resolveStop) => {
    resolveStopped = resolveStop;
  });
  // The client half-closes after sending its bounded request. Keep the writable side open until
  // the asynchronous lifecycle operation has returned its stable outcome.
  const scheduleControl = async (
    rawRequest: string,
    cancellationSignal?: AbortSignal,
  ): Promise<Awaited<ReturnType<typeof handleControlRequest>>> => {
    let action: ControlAction;
    try {
      action = parseControlAction(rawRequest);
    } catch {
      return { outcome: setupFailureOutcome(), shouldStop: false };
    }
    if (action !== 'stop' && stopping) {
      return { outcome: setupFailureOutcome(), shouldStop: false };
    }
    if (action === 'stop') {
      stopping = true;
      activeProjectAbort?.abort();
      stopOperation ??= operationQueue.then(() => controller.stop(ownedRun));
      const result = stopOperation.then((outcome) => ({ outcome, shouldStop: true }));
      operationQueue = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    }
    const operation = operationQueue.then(async () => {
      if (!action.startsWith('project:')) {
        return handleControlRequest(JSON.stringify(action), controller, ownedRun);
      }
      const projectAbort = new AbortController();
      activeProjectAbort = projectAbort;
      const cancelProject = (): void => projectAbort.abort();
      cancellationSignal?.addEventListener('abort', cancelProject, { once: true });
      if (cancellationSignal?.aborted === true) cancelProject();
      try {
        return await handleControlRequest(
          JSON.stringify(action),
          controller,
          ownedRun,
          projectAbort.signal,
        );
      } finally {
        cancellationSignal?.removeEventListener('abort', cancelProject);
        if (activeProjectAbort === projectAbort) activeProjectAbort = undefined;
      }
    });
    operationQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  };

  const server = createServer({ allowHalfOpen: true }, (socket) => {
    let request = '';
    let responseCompleted = false;
    const requestAbort = new AbortController();
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      request += chunk;
      if (Buffer.byteLength(request, 'utf8') > maximumControlBytes) socket.destroy();
    });
    socket.on('end', () => {
      void scheduleControl(request, requestAbort.signal)
        .then((result) => {
          if (result.ownedRun !== undefined) ownedRun = result.ownedRun;
          responseCompleted = true;
          socket.end(`${JSON.stringify(result.outcome)}\n`);
          if (result.shouldStop) {
            server.close(() => resolveStopped(result.outcome.exitCode));
          }
        })
        .catch(() => socket.end(`${JSON.stringify({ exitCode: 30 })}\n`));
    });
    socket.once('close', () => {
      if (!responseCompleted) requestAbort.abort();
    });
  });
  server.listen(socketPath);
  await onceListening(server);
  chmodSync(socketPath, 0o600);
  writeActiveRun(root, {
    runId,
    worktreePath: root,
    socketPath,
    supervisorPid: process.pid,
    manifest: ownedRun.manifest,
  });

  const stopFromSignal = (exitCode: 130 | 143): void => {
    if (stopping) return;
    stopping = true;
    activeProjectAbort?.abort();
    stopOperation ??= operationQueue.then(() => controller.stop(ownedRun));
    void stopOperation.then((outcome) => {
      server.close(() => resolveSignalStop(outcome.exitCode === 0 ? exitCode : 60));
    });
  };
  let resolveSignalStop: (exitCode: LifecycleExitCode) => void = () => undefined;
  const signalStop = new Promise<LifecycleExitCode>((resolveStop) => {
    resolveSignalStop = resolveStop;
  });
  dispatchSignal = stopFromSignal;
  if (requestedSignal !== undefined) stopFromSignal(requestedSignal);

  const exitCode = await Promise.race([stopped, signalStop]);
  process.off('SIGINT', onSigint);
  process.off('SIGTERM', onSigterm);
  if (exitCode !== 60) rmSync(activeRunPath(root), { force: true });
  rmSync(socketPath, { force: true });
  if (exitCode !== 60) rmSync(socketDirectory, { recursive: true, force: true });
  return exitCode;
}

/** Creates the stable fail-closed response used after supervisor shutdown begins. */
function setupFailureOutcome(): LifecycleOutcome {
  return {
    exitCode: 30,
    classification: 'setup-failure',
    primaryExitCode: 30,
    recoveryIdentifiers: [],
  };
}

/** Dispatches one bounded socket action through the opaque owned capability. */
async function handleControlRequest(
  rawRequest: string,
  controller: ReturnType<typeof createLifecycleController>,
  ownedRun: OwnedRun,
  projectSignal?: AbortSignal,
): Promise<{
  readonly outcome: LifecycleOutcome;
  readonly ownedRun?: OwnedRun;
  readonly shouldStop: boolean;
}> {
  const action = parseControlAction(rawRequest);
  if (action === 'prepare') {
    return { outcome: await controller.prepare(ownedRun), ownedRun, shouldStop: false };
  }
  if (action === 'reset') {
    return { outcome: await controller.reset(ownedRun), ownedRun, shouldStop: false };
  }
  if (action === 'restart-porta') {
    return { outcome: await controller.restartPorta(ownedRun), ownedRun, shouldStop: false };
  }
  if (action.startsWith('project:')) {
    const project = z
      .enum(['spa', 'bff', 'protocol', 'security', 'compatibility'])
      .parse(action.slice('project:'.length));
    const exitCode = await runProjectWithManifest(ownedRun.manifest, project, projectSignal);
    const classification: LifecycleOutcome['classification'] =
      exitCode === 0
        ? 'success'
        : exitCode === 20
          ? 'product-failure'
          : exitCode === 21
            ? 'test-failure'
            : exitCode === 70
              ? 'timeout'
              : 'setup-failure';
    const outcome: LifecycleOutcome = {
      exitCode,
      classification,
      primaryExitCode: exitCode,
      recoveryIdentifiers: [],
    };
    return {
      outcome,
      ownedRun,
      shouldStop: false,
    };
  }
  const outcome = await controller.stop(ownedRun);
  return { outcome, shouldStop: outcome.exitCode === 0 };
}

/** Sends one exact action to the active supervisor and returns its stable lifecycle exit. */
async function sendControl(action: ControlAction): Promise<LifecycleExitCode> {
  const root = worktreePath();
  if (!existsSync(activeRunPath(root)))
    return action === 'stop' ? cleanupStaleRuns(root, true) : 30;
  const active = readActiveRun(root);
  return new Promise((resolveExit, rejectExit) => {
    const socket = createConnection(active.socketPath);
    let response = '';
    let settled = false;
    const resolveResponse = (): void => {
      if (settled || !response.includes('\n')) return;
      settled = true;
      try {
        const outcome = z
          .object({
            exitCode: z.union([
              z.literal(0),
              z.literal(20),
              z.literal(21),
              z.literal(30),
              z.literal(60),
              z.literal(70),
              z.literal(130),
              z.literal(143),
            ]),
            prerequisite: z.string().min(1).optional(),
          })
          .parse(JSON.parse(response.trim()));
        if (outcome.exitCode !== 0) {
          process.stderr.write(
            `HARNESS_CONTROL_FAILED: action=${action} exit=${outcome.exitCode} prerequisite=${outcome.prerequisite ?? 'runtime'}\n`,
          );
        }
        resolveExit(outcome.exitCode);
      } catch (error) {
        rejectExit(error);
      }
    };
    socket.setEncoding('utf8');
    socket.once('connect', () => socket.end(JSON.stringify(action)));
    socket.on('data', (chunk) => {
      response += chunk;
      if (Buffer.byteLength(response, 'utf8') > maximumControlBytes) socket.destroy();
      resolveResponse();
    });
    socket.once('error', (error) => {
      if (!settled) rejectExit(error);
    });
    socket.once('end', () => {
      resolveResponse();
      if (!settled) rejectExit(new Error('lifecycle supervisor returned no complete outcome'));
    });
  });
}

/** Cleans a stale run discovered from the durable lease rather than a caller-supplied resource ID. */
async function cleanupStaleRuns(root: string, emptyIsSuccess: boolean): Promise<LifecycleExitCode> {
  const dependencies = createRuntimeDependencies(root);
  const records = await dependencies.leases.findByWorktree(root);
  if (records === 'unreadable' || records.length > 1) return 60;
  const record = records[0];
  if (record === undefined) return emptyIsSuccess ? 0 : 60;
  const outcome = await createLifecycleController(dependencies).cleanupStale({
    runId: record.runId,
    worktreePath: record.worktreePath,
  });
  if (outcome.exitCode === 0) {
    rmSync(activeRunPath(root), { force: true });
    rmSync(lifecycleSocketDirectory(record.runId), { recursive: true, force: true });
  }
  return outcome.exitCode;
}

/** Executes the retained SPA/BFF Playwright projects with the active endpoint manifest. */
async function runRetainedTests(options: readonly string[]): Promise<LifecycleExitCode> {
  if (options.length !== 0) return 30;
  const root = worktreePath();
  const active = readActiveRun(root);
  return new Promise((resolveExit, rejectExit) => {
    const child = spawn(
      resolve(root, 'node_modules/.bin/playwright'),
      ['test', '--project', 'spa', '--project', 'bff'],
      {
        cwd: resolve(root, 'test-harness'),
        env: environmentForManifest(active.manifest),
        shell: false,
        stdio: 'inherit',
      },
    );
    child.once('error', rejectExit);
    child.once('exit', (code) => resolveExit(code === 0 ? 0 : 30));
  });
}

/** Executes one allowlisted assurance project with the active endpoint manifest. */
async function runAssuranceProject(options: readonly string[]): Promise<LifecycleExitCode> {
  if (options.length !== 2 || options[0] !== '--name') return 30;
  const project = z.enum(['spa', 'bff', 'protocol', 'security', 'compatibility']).parse(options[1]);
  return sendControl(`project:${project}`);
}

/** Executes one admitted project inside the supervisor's serialized operation queue. */
async function runProjectWithManifest(
  manifest: OwnedRun['manifest'],
  project: AssuranceProject,
  signal?: AbortSignal,
): Promise<LifecycleExitCode> {
  const root = worktreePath();
  try {
    const result = await new RuntimeCommandRunner().run(
      resolve(root, 'node_modules/.bin/playwright'),
      ['test', '--project', project],
      {
        cwd: resolve(root, 'test-harness'),
        environment: { ...environmentForManifest(manifest), HARNESS_PROJECT_ADMITTED: '1' },
        timeoutMilliseconds: 1_800_000,
        signal,
      },
    );
    if (result.exitCode === 0) return 0;
    const failedAssertion = /(?:^|\n)\s*[1-9][0-9]* failed(?:\s|$)/u.test(
      `${result.stdout}\n${result.stderr}`,
    );
    return failedAssertion ? 20 : 21;
  } catch (error) {
    return error instanceof RuntimeTimeoutError ? 70 : 30;
  }
}

/** Writes active discovery through an owner-only atomic replacement. */
function writeActiveRun(root: string, active: ActiveRun): void {
  const path = activeRunPath(root);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const replacement = `${path}.${active.runId}.tmp`;
  writeFileSync(replacement, `${JSON.stringify(active)}\n`, { mode: 0o600, flag: 'wx' });
  renameSync(replacement, path);
}

/** Reads and validates the non-secret active-run discovery record. */
function readActiveRun(root: string): ActiveRun {
  const active = activeRunSchema.parse(JSON.parse(readFileSync(activeRunPath(root), 'utf8')));
  if (active.worktreePath !== root || active.manifest.worktreePath !== root) {
    throw new Error('active lifecycle worktree identity changed');
  }
  return active;
}

/** Waits for a detached supervisor to publish the exact requested run identity. */
async function waitForActiveRun(
  root: string,
  runId: string,
  timeoutMilliseconds: number,
  supervisor: ReturnType<typeof spawn>,
): Promise<void> {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (existsSync(activeRunPath(root))) {
      const active = readActiveRun(root);
      if (active.runId === runId) return;
      throw new Error('another lifecycle run became active');
    }
    if (supervisor.exitCode !== null || supervisor.signalCode !== null) {
      throw new Error('lifecycle supervisor exited before readiness');
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error('lifecycle supervisor did not become ready');
}

/** Resolves after the local supervisor socket is accepting connections. */
function onceListening(server: Server): Promise<void> {
  if (server.listening) return Promise.resolve();
  return new Promise((resolveReady, rejectReady) => {
    server.once('listening', resolveReady);
    server.once('error', rejectReady);
  });
}

/** Validates the CLI and executes exactly one lifecycle action. */
async function main(arguments_: readonly string[]): Promise<void> {
  const [rawAction, ...options] = arguments_;
  const action = actionSchema.parse(rawAction);
  let exitCode: LifecycleExitCode;
  if (action === 'start') exitCode = await start(options);
  else if (action === 'prepare')
    exitCode = options.length === 0 ? await sendControl('prepare') : 30;
  else if (action === 'reset') exitCode = options.length === 0 ? await sendControl('reset') : 30;
  else if (action === 'restart-porta') {
    exitCode = options.length === 0 ? await sendControl('restart-porta') : 30;
  } else if (action === 'recover') {
    exitCode = options.length === 0 ? await cleanupStaleRuns(worktreePath(), false) : 30;
  } else if (action === 'stop') {
    if (options.length !== 0) exitCode = 30;
    else {
      try {
        exitCode = await sendControl('stop');
      } catch {
        exitCode = await cleanupStaleRuns(worktreePath(), true);
      }
    }
  } else if (action === 'test') exitCode = await runRetainedTests(options);
  else if (action === 'project') exitCode = await runAssuranceProject(options);
  else {
    if (
      options.length !== 6 ||
      options[0] !== '--run-id' ||
      options[2] !== '--base-port' ||
      options[4] !== '--profile'
    ) {
      exitCode = 30;
    } else {
      const runId = z.uuid().parse(options[1]);
      const basePort = z.coerce.number().int().min(1024).max(65_530).parse(options[3]);
      const profile = profileSchema.parse(options[5]);
      exitCode = await supervise(worktreePath(), runId, basePort, profile);
    }
  }
  process.exitCode = exitCode;
}

await main(process.argv.slice(2)).catch(() => {
  process.exitCode = 30;
});
