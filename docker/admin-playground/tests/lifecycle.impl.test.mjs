import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  classifyComposeStatus,
  composeArguments,
  createAdminPlaygroundLifecycle,
  formatPlaygroundError,
  generateSecrets,
  ownedPublishedPorts,
  parseComposeServices,
  productionDependencies,
  validateAdminMetadata,
  volumeListContainsExactName,
  withMutationLock,
} from '../scripts/admin-env.mjs';
import { requireTool, verifyLoopbackPortAvailable } from '../scripts/check-prerequisites.mjs';

test('should classify a missing required tool without exposing process diagnostics', async () => {
  await assert.rejects(
    requireTool('missing-tool', async () => {
      throw new Error('/private/path token=secret');
    }),
    (error) => error.message === 'Required tool is unavailable: missing-tool.',
  );
});

test('should generate complete non-empty playground secrets without exposing their values', () => {
  const entries = Object.fromEntries(
    generateSecrets()
      .trim()
      .split('\n')
      .map((line) => line.split('=', 2)),
  );
  assert.match(entries.DATABASE_URL, /^postgresql:\/\/porta:[0-9a-f]{48}@postgres:5432\/porta$/);
  assert.equal(entries.POSTGRES_PASSWORD.length, 48);
  assert.ok(entries.COOKIE_KEYS.length >= 43);
  assert.equal(entries.TWO_FACTOR_ENCRYPTION_KEY.length, 64);
  assert.equal(entries.SIGNING_KEY_ENCRYPTION_KEY.length, 64);
});

test('should build fixed Compose commands and classify exact Docker volume names', () => {
  assert.deepEqual(composeArguments(['ps']), [
    'compose',
    '--project-name',
    'porta-admin-playground',
    '-f',
    resolve(import.meta.dirname, '../compose.yml'),
    'ps',
  ]);
  assert.equal(volumeListContainsExactName('owned\nunrelated\n', 'owned'), true);
  assert.equal(volumeListContainsExactName('owned-extra\n', 'owned'), false);
});

test('should classify missing stopped partial and healthy Compose states', () => {
  const environment = { PORTA_ADMIN_HTTPS_PORT: '4550', PORTA_ADMIN_MAILHOG_PORT: '9026' };
  assert.equal(classifyComposeStatus([], environment).state, 'missing');
  assert.equal(classifyComposeStatus([{ State: 'exited' }], environment).state, 'stopped');
  assert.equal(classifyComposeStatus([{ State: 'running', Health: 'starting' }], environment).state, 'partial');
  const healthy = Array.from({ length: 5 }, (_value, index) => ({
    State: 'running',
    Health: index < 4 ? 'healthy' : '',
  }));
  assert.deepEqual(classifyComposeStatus(healthy, environment), {
    state: 'healthy',
    endpoints: [
      'https://porta-admin-playground.ci.portaidentity.com:4550',
      'http://127.0.0.1:9026',
    ],
  });
});

test('should wire production lifecycle policy through injected system adapters', async () => {
  const events = [];
  const services = [
    {
      Service: 'nginx',
      State: 'running',
      Publishers: [{ URL: '127.0.0.1', PublishedPort: 4550, TargetPort: 443 }],
    },
  ];
  const dependencies = productionDependencies({
    compose: async (arguments_) => events.push(`compose:${arguments_.join(' ')}`),
    composeInteractive: async (arguments_) => events.push(`interactive:${arguments_.join(' ')}`),
    execFile: async (command, arguments_) => {
      events.push(`exec:${command}:${arguments_.join(' ')}`);
      return {
        stdout: arguments_.some((value) => String(value).includes('/api/admin/metadata'))
          ? JSON.stringify({
              issuer:
                'https://porta-admin-playground.ci.portaidentity.com:4550/porta-admin',
              orgSlug: 'porta-admin',
              clientId: 'porta-cli',
            })
          : '',
      };
    },
    runPreflight: async (options) => events.push(`preflight:${options.allowedOccupiedPorts}`),
    inspectComposeServices: async () => services,
    isInitialized: async () => true,
    dockerVolumeExists: async (name) => name === 'present',
    rotateSecrets: async () => events.push('rotate'),
    inspectStatus: async () => ({ state: 'healthy', endpoints: [] }),
    environment: { PORTA_ADMIN_HTTPS_PORT: '4550', PORTA_ADMIN_MAILHOG_PORT: '9026' },
  });

  await dependencies.runPreflight();
  await dependencies.startServices();
  await dependencies.runMigrations();
  await dependencies.initialize({
    email: 'admin@example.test',
    givenName: 'Admin',
    familyName: 'User',
  });
  assert.deepEqual(await dependencies.verifyHealth(), { porta: 'healthy', mailhog: 'healthy' });
  await dependencies.stopServices();
  await dependencies.removeVolume('absent');
  await dependencies.removeVolume('present');
  await dependencies.rotateSecrets();
  assert.deepEqual(await dependencies.inspectStatus(), { state: 'healthy', endpoints: [] });
  assert.equal(await dependencies.resolveVolumeName('postgres_data'), 'porta-admin-playground_postgres_data');
  assert.equal(dependencies.canBootstrapInteractively(), false);
  assert.ok(events.some((event) => event.includes('preflight:4550')));
  assert.ok(events.some((event) => event.includes('compose:up -d porta nginx')));
  assert.ok(events.some((event) => event.includes('exec:docker:volume rm present')));
});

test('should acquire and release the direct native lifecycle lock around one mutation', async () => {
  const parent = await mkdtemp(resolve(tmpdir(), 'porta-admin-lock-'));
  const runtimeDirectory = resolve(parent, 'runtime');
  const lockPath = resolve(runtimeDirectory, 'lifecycle.lock');
  const events = [];
  try {
    await withMutationLock(
      async () => {
        events.push('start');
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
        events.push('end');
      },
      { runtimeDirectory, lockPath, timeoutMs: 1_000 },
    );
    assert.deepEqual(events, ['start', 'end']);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('should replace unexpected process diagnostics with one public failure', () => {
  assert.equal(
    formatPlaygroundError(new Error('Command failed at /private/path token=secret')),
    'Playground operation failed.',
  );
  assert.equal(
    formatPlaygroundError(new Error('Playground operation unavailable: lifecycle lock timed out.')),
    'Playground operation unavailable: lifecycle lock timed out.',
  );
});

test('should report a loopback port conflict without terminating its owner', async () => {
  const fakeServer = {
    once(_event, handler) {
      this.error = handler;
      return this;
    },
    listen() {
      this.error({ code: 'EADDRINUSE' });
    },
  };
  await assert.rejects(
    verifyLoopbackPortAvailable(3543, () => fakeServer),
    /Loopback port 3543 is unavailable/,
  );
});

test('should keep status and repeated stop bounded through injected system boundaries', async () => {
  let stops = 0;
  const lifecycle = createAdminPlaygroundLifecycle({
    runPreflight: async () => undefined,
    withMutationLock: async (operation) => operation(),
    stopServices: async () => {
      stops += 1;
    },
    inspectStatus: async () => ({ state: 'stopped', endpoints: [] }),
  });
  await lifecycle.stop();
  await lifecycle.stop();
  assert.equal(stops, 2);
  assert.deepEqual(await lifecycle.status(), { state: 'stopped', endpoints: [] });
});

test('should parse newline-delimited Docker Compose status records', () => {
  const services = parseComposeServices(
    '{"Service":"postgres","State":"running"}\n{"Service":"redis","State":"running"}\n',
  );
  assert.deepEqual(services, [
    { Service: 'postgres', State: 'running' },
    { Service: 'redis', State: 'running' },
  ]);
});

test('should allow only ports published by their running playground services', () => {
  const services = [
    {
      Service: 'mailhog',
      State: 'running',
      Publishers: [{ URL: '127.0.0.1', PublishedPort: 8026, TargetPort: 8025 }],
    },
    {
      Service: 'nginx',
      State: 'exited',
      Publishers: [{ URL: '127.0.0.1', PublishedPort: 3543, TargetPort: 443 }],
    },
  ];
  assert.deepEqual(ownedPublishedPorts(services, 3543, 8026), [8026]);
});

test('should require exact admin issuer discovery before reporting healthy', () => {
  assert.doesNotThrow(() =>
    validateAdminMetadata(
      JSON.stringify({
        issuer: 'https://porta-admin-playground.ci.portaidentity.com:3543/porta-admin',
        orgSlug: 'porta-admin',
        clientId: 'local-client',
      }),
      3543,
    ),
  );
  assert.throws(
    () =>
      validateAdminMetadata(
        JSON.stringify({
          issuer: 'https://attacker.example/porta-admin',
          orgSlug: 'porta-admin',
          clientId: 'local-client',
        }),
        3543,
      ),
    /metadata is invalid/,
  );
});

test('should stop before removing exact resources during reset recovery', async () => {
  const events = [];
  const lifecycle = createAdminPlaygroundLifecycle({
    runPreflight: async () => undefined,
    withMutationLock: async (operation) => operation(),
    stopServices: async () => events.push('stop'),
    canBootstrapInteractively: () => true,
    resolveVolumeName: async (key) => `porta-admin-playground_${key}`,
    removeVolume: async (name) => events.push(`remove:${name}`),
    volumeExists: async () => true,
    rotateSecrets: async () => events.push('rotate'),
    clearMail: async () => events.push('clear-mail'),
  });
  await assert.rejects(
    lifecycle.reset({ yes: true, stdinIsTTY: true, stdoutIsTTY: true }),
    /Partial reset/,
  );
  assert.equal(events[0], 'stop');
  assert.equal(events.includes('rotate'), false);
  assert.equal(events.includes('clear-mail'), false);
});
