import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createAdminPlaygroundLifecycle,
  formatPlaygroundError,
  ownedPublishedPorts,
  parseComposeServices,
  validateAdminMetadata,
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
