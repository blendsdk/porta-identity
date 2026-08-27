#!/usr/bin/env node

/** Owned lifecycle for the persistent local administration playground. */

import { execFile as execFileCallback, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  constants as nativeConstants,
  fcntlSync,
  lockFileExSync,
  unlockFileExSync,
} from 'fs-ext-extra-prebuilt';
import { open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  ensureRuntimePermissions,
  runPreflight,
  validatePlaygroundPort,
} from './check-prerequisites.mjs';

const execFile = promisify(execFileCallback);
const playgroundRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repositoryRoot = resolve(playgroundRoot, '../..');
const composePath = resolve(playgroundRoot, 'compose.yml');
const runtimeDirectory = resolve(playgroundRoot, 'runtime');
const secretsPath = resolve(runtimeDirectory, 'secrets.env');
const lockPath = resolve(runtimeDirectory, 'lifecycle.lock');
const RESET_PHRASE = 'reset porta-admin-playground';
const OWNED_VOLUME_KEYS = ['postgres_data', 'redis_data'];
const LOCK_TIMEOUT_MS = 5_000;
const COMPOSE_PROJECT_NAME = 'porta-admin-playground';

/** Builds the fixed Compose argument prefix used by every playground command. */
export function composeArguments(arguments_) {
  return ['compose', '--project-name', COMPOSE_PROJECT_NAME, '-f', composePath, ...arguments_];
}

/** Runs Docker Compose without shell interpolation. */
/* node:coverage disable */
async function compose(arguments_, options = {}) {
  return execFile(
    'docker',
    composeArguments(arguments_),
    {
      cwd: repositoryRoot,
      timeout: options.timeout ?? 120_000,
      env: process.env,
    },
  );
}
/* node:coverage enable */

/** Runs an interactive Compose command while preserving hidden terminal input. */
/* node:coverage disable */
async function composeInteractive(arguments_) {
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(
      'docker',
      ['compose', '--project-name', COMPOSE_PROJECT_NAME, '-f', composePath, ...arguments_],
      {
        cwd: repositoryRoot,
        env: process.env,
        stdio: 'inherit',
      },
    );
    child.once('error', rejectRun);
    child.once('exit', (code) =>
      code === 0 ? resolveRun() : rejectRun(new Error('Playground bootstrap failed.')),
    );
  });
}
/* node:coverage enable */

/** Returns true only for documented non-blocking lock contention. */
function isContention(error) {
  return error && ['EACCES', 'EAGAIN', 'EBUSY'].includes(error.code);
}

/** Runs one mutation under the persistent bounded kernel lock. */
export async function withMutationLock(operation, options = {}) {
  const directory = options.runtimeDirectory ?? runtimeDirectory;
  const path = options.lockPath ?? lockPath;
  const timeoutMs = options.timeoutMs ?? LOCK_TIMEOUT_MS;
  await ensureRuntimePermissions(directory);
  const handle = await open(path, 'a+', 0o600);
  const deadline = performance.now() + timeoutMs;
  let locked = false;
  try {
    while (!locked) {
      try {
        if (process.platform === 'win32') {
          lockFileExSync(
            handle.fd,
            nativeConstants.LOCKFILE_EXCLUSIVE_LOCK | nativeConstants.LOCKFILE_FAIL_IMMEDIATELY,
            0,
            0,
            1,
            0,
          );
        } else {
          fcntlSync(handle.fd, 'setlk', nativeConstants.F_WRLCK, 0, 1);
        }
        locked = true;
      } catch (error) {
        if (!isContention(error)) throw error;
        if (performance.now() >= deadline) {
          throw new Error('Playground operation unavailable: lifecycle lock timed out.');
        }
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 25));
      }
    }
    return await operation();
  } finally {
    try {
      if (locked) {
        if (process.platform === 'win32') unlockFileExSync(handle.fd, 0, 0, 1, 0);
        else fcntlSync(handle.fd, 'setlk', nativeConstants.F_UNLCK, 0, 1);
      }
    } finally {
      await handle.close();
    }
  }
}

/** Builds a complete stable secret snapshot without logging its values. */
export function generateSecrets() {
  const databasePassword = randomBytes(24).toString('hex');
  return (
    [
      `POSTGRES_PASSWORD=${databasePassword}`,
      `DATABASE_URL=postgresql://porta:${databasePassword}@postgres:5432/porta`,
      'REDIS_URL=redis://redis:6379',
      `COOKIE_KEYS=${randomBytes(32).toString('base64url')}`,
      `TWO_FACTOR_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`,
      `SIGNING_KEY_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`,
    ].join('\n') + '\n'
  );
}

/** Returns stable secrets, creating them atomically only when absent. */
/* node:coverage disable */
async function ensureStableSecrets() {
  try {
    return await readFile(secretsPath, 'utf8');
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error;
  }
  await rotateSecrets();
  return readFile(secretsPath, 'utf8');
}
/* node:coverage enable */

/** Prepares ignored local configuration needed for static Compose validation. */
/* node:coverage disable */
export async function preparePlaygroundRuntime() {
  await ensureRuntimePermissions(runtimeDirectory);
  await ensureStableSecrets();
}
/* node:coverage enable */

/** Replaces the secret snapshot only after reset has proved old data absent. */
/* node:coverage disable */
async function rotateSecrets() {
  const temporaryPath = `${secretsPath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await writeFile(temporaryPath, generateSecrets(), { mode: 0o600, flag: 'wx' });
    await rename(temporaryPath, secretsPath);
  } finally {
    await unlink(temporaryPath).catch((error) => {
      if (!error || error.code !== 'ENOENT') throw error;
    });
  }
}
/* node:coverage enable */

/** Detects the initialized admin application through an exact read-only query. */
/* node:coverage disable */
async function isInitialized() {
  try {
    const { stdout } = await compose([
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'porta',
      '-d',
      'porta',
      '-tAc',
      "SELECT 1 FROM applications WHERE slug = 'porta-admin' LIMIT 1",
    ]);
    return stdout.trim() === '1';
  } catch {
    return false;
  }
}
/* node:coverage enable */

/** Reports whether an exact requested name occurs in a newline-delimited Docker listing. */
export function volumeListContainsExactName(output, volumeName) {
  return output
    .split('\n')
    .map((value) => value.trim())
    .includes(volumeName);
}

/** Checks exact Docker resource presence while preserving transport and permission failures. */
/* node:coverage disable */
async function dockerVolumeExists(volumeName) {
  const { stdout } = await execFile('docker', [
    'volume',
    'ls',
    '--quiet',
    '--filter',
    `name=^${volumeName}$`,
  ]);
  return volumeListContainsExactName(stdout, volumeName);
}
/* node:coverage enable */

/** Creates production lifecycle boundaries used by the command entry point. */
export function productionDependencies(system = {}) {
  const composeCommand = system.compose ?? compose;
  const composeInteractiveCommand = system.composeInteractive ?? composeInteractive;
  const execute = system.execFile ?? execFile;
  const preflight = system.runPreflight ?? runPreflight;
  const inspectServices = system.inspectComposeServices ?? inspectComposeServices;
  const initialized = system.isInitialized ?? isInitialized;
  const volumeExists = system.dockerVolumeExists ?? dockerVolumeExists;
  const rotate = system.rotateSecrets ?? rotateSecrets;
  const status = system.inspectStatus ?? inspectStatus;
  const environment = system.environment ?? process.env;
  return {
    runPreflight: async () => {
      const services = await inspectServices();
      const httpsPort = validatePlaygroundPort(
        environment.PORTA_ADMIN_HTTPS_PORT,
        3543,
        'PORTA_ADMIN_HTTPS_PORT',
      );
      const mailhogPort = validatePlaygroundPort(
        environment.PORTA_ADMIN_MAILHOG_PORT,
        8026,
        'PORTA_ADMIN_MAILHOG_PORT',
      );
      await preflight({
        runtimeDirectory,
        allowedOccupiedPorts: ownedPublishedPorts(services, httpsPort, mailhogPort),
      });
    },
    withMutationLock,
    ensureStableSecrets,
    startServices: async () =>
      composeCommand(['up', '-d', '--build', 'postgres', 'redis', 'mailhog']),
    runMigrations: async () =>
      composeCommand(['run', '--rm', 'porta', 'node', 'dist/cli/index.js', 'migrate', 'up'], {
        timeout: 300_000,
      }),
    isInitialized: initialized,
    readHiddenPassword: async () => '',
    initialize: async (input) =>
      composeInteractiveCommand([
        'run',
        '--rm',
        'porta',
        'node',
        'dist/cli/index.js',
        'init',
        '--email',
        input.email,
        '--given-name',
        input.givenName,
        '--family-name',
        input.familyName,
      ]),
    verifyHealth: async () => {
      await composeCommand(['up', '-d', 'porta', 'nginx']);
      const httpsPort = environment.PORTA_ADMIN_HTTPS_PORT ?? '3543';
      const mailhogPort = environment.PORTA_ADMIN_MAILHOG_PORT ?? '8026';
      const { stdout: metadataOutput } = await execute('curl', [
        '--fail',
        '--silent',
        '--show-error',
        `https://porta-admin-playground.ci.portaidentity.com:${httpsPort}/api/admin/metadata`,
      ]);
      validateAdminMetadata(metadataOutput, httpsPort);
      await execute('curl', [
        '--fail',
        '--silent',
        '--show-error',
        `https://porta-admin-playground.ci.portaidentity.com:${httpsPort}/health`,
      ]);
      await execute('curl', [
        '--fail',
        '--silent',
        '--show-error',
        `http://127.0.0.1:${mailhogPort}/api/v2/messages`,
      ]);
      return { porta: 'healthy', mailhog: 'healthy' };
    },
    stopServices: async () => {
      await composeCommand(['down', '--remove-orphans']);
    },
    canBootstrapInteractively: () => process.stdin.isTTY === true && process.stdout.isTTY === true,
    resolveVolumeName: async (volumeKey) => `porta-admin-playground_${volumeKey}`,
    removeVolume: async (volumeName) => {
      if (!(await volumeExists(volumeName))) return;
      await execute('docker', ['volume', 'rm', volumeName]);
    },
    volumeExists,
    rotateSecrets: rotate,
    clearMail: async () => undefined,
    inspectStatus: status,
    confirmReset: async () => {
      const terminal = createInterface({ input: process.stdin, output: process.stdout });
      try {
        return (await terminal.question(`Type "${RESET_PHRASE}" to continue: `)) === RESET_PHRASE;
      } finally {
        terminal.close();
      }
    },
  };
}

/** Classifies bounded Compose state and returns only public endpoint values. */
export function classifyComposeStatus(services, environment = process.env) {
  const running = services.filter((service) => service.State === 'running');
  const healthy = running.filter((service) => service.Health === 'healthy');
  const state =
    services.length === 0
      ? 'missing'
      : running.length === 0
        ? 'stopped'
        : running.length === 5 && healthy.length >= 4
          ? 'healthy'
          : 'partial';
  return {
    state,
    endpoints: [
      `https://porta-admin-playground.ci.portaidentity.com:${environment.PORTA_ADMIN_HTTPS_PORT ?? '3543'}`,
      `http://127.0.0.1:${environment.PORTA_ADMIN_MAILHOG_PORT ?? '8026'}`,
    ],
  };
}

/** Inspects only bounded Compose state and public endpoint values. */
/* node:coverage disable */
async function inspectStatus() {
  const services = await inspectComposeServices();
  return classifyComposeStatus(services);
}
/* node:coverage enable */

/** Reads the fixed Compose project's bounded service status records. */
/* node:coverage disable */
async function inspectComposeServices() {
  try {
    const { stdout } = await compose(['ps', '--format', 'json'], { timeout: 30_000 });
    return parseComposeServices(stdout);
  } catch {
    return [];
  }
}
/* node:coverage enable */

/** Parses the newline-delimited JSON emitted by Docker Compose 2.29. */
export function parseComposeServices(output) {
  return output
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

/** Returns host ports proved to belong to the expected running playground publishers. */
export function ownedPublishedPorts(services, httpsPort, mailhogPort) {
  const expected = new Map([
    ['nginx', { hostPort: httpsPort, targetPort: 443 }],
    ['mailhog', { hostPort: mailhogPort, targetPort: 8025 }],
  ]);
  const owned = [];
  for (const service of services) {
    const publication = expected.get(service.Service);
    if (!publication || service.State !== 'running' || !Array.isArray(service.Publishers)) continue;
    const matches = service.Publishers.some(
      (publisher) =>
        publisher.URL === '127.0.0.1' &&
        publisher.PublishedPort === publication.hostPort &&
        publisher.TargetPort === publication.targetPort,
    );
    if (matches) owned.push(publication.hostPort);
  }
  return owned;
}

/** Validates the server metadata required by the packed and embedded admin clients. */
export function validateAdminMetadata(output, httpsPort) {
  let metadata;
  try {
    metadata = JSON.parse(output);
  } catch {
    throw new Error('Playground administrator metadata is unavailable.');
  }
  const origin = `https://porta-admin-playground.ci.portaidentity.com:${httpsPort}`;
  if (
    metadata?.issuer !== `${origin}/porta-admin` ||
    metadata?.orgSlug !== 'porta-admin' ||
    typeof metadata?.clientId !== 'string' ||
    metadata.clientId.length === 0
  ) {
    throw new Error('Playground administrator metadata is invalid.');
  }
}

/** Creates an injectable lifecycle with one mutation lock boundary. */
export function createAdminPlaygroundLifecycle(dependencies) {
  const bootstrapInput = (password) => ({
    organizationSlug: 'porta-admin',
    organizationName: 'Porta Admin',
    email: 'admin@playground.porta.test',
    givenName: 'Playground',
    familyName: 'Administrator',
    password,
  });

  const bootstrap = async (options) => {
    await dependencies.startServices();
    await dependencies.runMigrations();
    if (!(await dependencies.isInitialized())) {
      const password = await dependencies.readHiddenPassword(options);
      await dependencies.initialize(bootstrapInput(password));
    }
    return dependencies.verifyHealth();
  };

  return {
    up: (options = {}) =>
      dependencies.withMutationLock(async () => {
        await dependencies.runPreflight();
        await dependencies.ensureStableSecrets();
        return bootstrap(options);
      }),
    stop: () => dependencies.withMutationLock(() => dependencies.stopServices()),
    status: () => dependencies.inspectStatus(),
    reset: async (options = {}) => {
      if (!dependencies.canBootstrapInteractively(options)) {
        throw new Error('Reset requires an interactive terminal for hidden password input.');
      }
      if (!options.yes && !(await dependencies.confirmReset())) return { status: 'cancelled' };
      return dependencies.withMutationLock(async () => {
        await dependencies.runPreflight();
        await dependencies.stopServices();
        const volumeNames = await Promise.all(
          OWNED_VOLUME_KEYS.map((key) => dependencies.resolveVolumeName(key)),
        );
        for (const volumeName of volumeNames) await dependencies.removeVolume(volumeName);
        const remaining = [];
        for (const volumeName of volumeNames) {
          if (await dependencies.volumeExists(volumeName)) remaining.push(volumeName);
        }
        if (remaining.length > 0) {
          throw new Error('Partial reset: one or more owned volumes remain. Rerun reset.');
        }
        await dependencies.rotateSecrets();
        await dependencies.clearMail();
        return bootstrap(options);
      });
    },
  };
}

/** Converts internal failures to a small documented command-line error vocabulary. */
export function formatPlaygroundError(error) {
  if (!(error instanceof Error)) return 'Playground operation failed.';
  const allowed = [
    'Usage:',
    'Required tool is unavailable:',
    'Playground DNS is unsafe:',
    'Playground host ports must be distinct.',
    'PORTA_ADMIN_',
    'Loopback port ',
    'mkcert local CA is unavailable',
    'Reset requires an interactive terminal',
    'Partial reset:',
    'Playground operation unavailable:',
  ];
  return allowed.some((prefix) => error.message.startsWith(prefix))
    ? error.message
    : 'Playground operation failed.';
}

/** Executes the requested root lifecycle operation. */
/* node:coverage disable */
async function main(arguments_) {
  const [operation, ...flags] = arguments_;
  if (!['up', 'stop', 'status', 'reset'].includes(operation)) {
    throw new Error('Usage: yarn admin:env <up|stop|status|reset> [--yes]');
  }
  const lifecycle = createAdminPlaygroundLifecycle(productionDependencies());
  const options = {
    yes: flags.includes('--yes'),
    stdinIsTTY: process.stdin.isTTY === true,
    stdoutIsTTY: process.stdout.isTTY === true,
  };
  const result = await lifecycle[operation](options);
  if (result !== undefined) process.stdout.write(`${JSON.stringify(result)}\n`);
}
/* node:coverage enable */

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${formatPlaygroundError(error)}\n`);
    process.exitCode = 1;
  });
}
