import { spawn } from 'node:child_process';
import { createServer, createConnection, type Server } from 'node:net';
import {
  closeSync,
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
} from '../fixtures/lifecycle-runtime.js';

const actionSchema = z.enum(['start', 'supervise', 'reset', 'stop', 'test']);
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
type ControlAction = 'reset' | 'stop';

/** Maximum bytes accepted from one local control request. */
const maximumControlBytes = 1024;

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
  if (options.length > 1 || (options.length === 1 && options[0] !== '--ci')) return 30;
  const root = worktreePath();
  if (existsSync(activeRunPath(root))) return 30;
  const runId = randomUUID();
  const candidateBasePort = randomInt(3_000, 5_000) * 10;
  if (options[0] !== '--ci') {
    return supervise(root, runId, candidateBasePort);
  }

  const runtimeDirectory = resolve(root, 'test-harness/.assurance-runtime', runId);
  mkdirSync(runtimeDirectory, { recursive: true, mode: 0o700 });
  const logFile = openSync(resolve(runtimeDirectory, 'supervisor.log'), 'a', 0o600);
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
    ],
    {
      cwd: root,
      env: process.env,
      detached: true,
      shell: false,
      stdio: ['ignore', logFile, logFile],
    },
  );
  closeSync(logFile);
  child.unref();
  await waitForActiveRun(root, runId, 600_000, child);
  process.stdout.write(`HARNESS_RUN_ID=${runId}\n`);
  return 0;
}

/** Runs the lifecycle supervisor until an exact stop request or signal completes cleanup. */
async function supervise(
  root: string,
  runId: string,
  candidateBasePort: number,
): Promise<LifecycleExitCode> {
  const controller = createLifecycleController(createRuntimeDependencies(root));
  const started = await controller.start({
    runId,
    scenarioId: 'retained-harness',
    worktreePath: root,
    environmentName: 'retained-harness',
    candidateBasePort,
    collisionRetries: 16,
  });
  if (started.ownedRun === undefined) {
    process.stderr.write(
      `HARNESS_START_FAILED: exit=${started.outcome.exitCode} prerequisite=${started.outcome.prerequisite ?? 'runtime'} recovery=${started.outcome.recoveryIdentifiers.join(',') || 'none'}\n`,
    );
    return started.outcome.exitCode;
  }

  let ownedRun: OwnedRun = started.ownedRun;
  const socketPath = resolve('/tmp', `porta-assurance-${runId}.sock`);
  rmSync(socketPath, { force: true });
  let stopping = false;
  let resolveStopped: (exitCode: LifecycleExitCode) => void = () => undefined;
  const stopped = new Promise<LifecycleExitCode>((resolveStop) => {
    resolveStopped = resolveStop;
  });
  // The client half-closes after sending its bounded request. Keep the writable side open until
  // the asynchronous lifecycle operation has returned its stable outcome.
  const server = createServer({ allowHalfOpen: true }, (socket) => {
    let request = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      request += chunk;
      if (Buffer.byteLength(request, 'utf8') > maximumControlBytes) socket.destroy();
    });
    socket.on('end', () => {
      void handleControlRequest(request, controller, ownedRun)
        .then((result) => {
          if (result.ownedRun !== undefined) ownedRun = result.ownedRun;
          socket.end(`${JSON.stringify(result.outcome)}\n`);
          if (result.shouldStop && !stopping) {
            stopping = true;
            server.close(() => resolveStopped(result.outcome.exitCode));
          }
        })
        .catch(() => socket.end(`${JSON.stringify({ exitCode: 30 })}\n`));
    });
  });
  server.listen(socketPath);
  await onceListening(server);
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
    void controller.stop(ownedRun).then((outcome) => {
      server.close(() => resolveSignalStop(outcome.exitCode === 0 ? exitCode : 60));
    });
  };
  let resolveSignalStop: (exitCode: LifecycleExitCode) => void = () => undefined;
  const signalStop = new Promise<LifecycleExitCode>((resolveStop) => {
    resolveSignalStop = resolveStop;
  });
  process.once('SIGINT', () => stopFromSignal(130));
  process.once('SIGTERM', () => stopFromSignal(143));

  const exitCode = await Promise.race([stopped, signalStop]);
  rmSync(activeRunPath(root), { force: true });
  rmSync(socketPath, { force: true });
  return exitCode;
}

/** Dispatches one bounded socket action through the opaque owned capability. */
async function handleControlRequest(
  rawRequest: string,
  controller: ReturnType<typeof createLifecycleController>,
  ownedRun: OwnedRun,
): Promise<{
  readonly outcome: LifecycleOutcome;
  readonly ownedRun?: OwnedRun;
  readonly shouldStop: boolean;
}> {
  const action = z.enum(['reset', 'stop']).parse(JSON.parse(rawRequest));
  if (action === 'reset') {
    return { outcome: await controller.reset(ownedRun), ownedRun, shouldStop: false };
  }
  const outcome = await controller.stop(ownedRun);
  return { outcome, shouldStop: outcome.exitCode === 0 };
}

/** Sends one exact action to the active supervisor and returns its stable lifecycle exit. */
async function sendControl(action: ControlAction): Promise<LifecycleExitCode> {
  const root = worktreePath();
  if (!existsSync(activeRunPath(root))) return action === 'stop' ? 0 : 30;
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
              z.literal(30),
              z.literal(60),
              z.literal(70),
              z.literal(130),
              z.literal(143),
            ]),
          })
          .parse(JSON.parse(response.trim()));
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
  else if (action === 'reset') exitCode = options.length === 0 ? await sendControl('reset') : 30;
  else if (action === 'stop') exitCode = options.length === 0 ? await sendControl('stop') : 30;
  else if (action === 'test') exitCode = await runRetainedTests(options);
  else {
    if (options.length !== 4 || options[0] !== '--run-id' || options[2] !== '--base-port') {
      exitCode = 30;
    } else {
      const runId = z.uuid().parse(options[1]);
      const basePort = z.coerce.number().int().min(1024).max(65_530).parse(options[3]);
      exitCode = await supervise(worktreePath(), runId, basePort);
    }
  }
  process.exitCode = exitCode;
}

await main(process.argv.slice(2)).catch(() => {
  process.exitCode = 30;
});
