import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  ensureRuntimePermissions,
  requireTool,
  validatePlaygroundPort,
  verifyLoopbackPortAvailable,
  verifyPlaygroundDns,
} from '../scripts/check-prerequisites.mjs';

test('should reject invalid or privileged configured ports', () => {
  for (const value of ['abc', '0', '443', '65536', '12.5']) {
    assert.throws(() => validatePlaygroundPort(value, 3543, 'TEST_PORT'));
  }
  assert.equal(validatePlaygroundPort('3543', 9999, 'TEST_PORT'), 3543);
});

test('should require the Docker Compose capability explicitly', async () => {
  await assert.rejects(
    requireTool(
      'docker',
      async (_command, arguments_) => {
        assert.deepEqual(arguments_, ['compose', 'version']);
        throw new Error('missing plugin');
      },
      ['compose', 'version'],
      'docker compose',
    ),
    /Required tool is unavailable: docker compose/,
  );
});

test('should not bypass an unrelated port owner during partial recovery', async () => {
  const unavailableServer = {
    once(_event, handler) {
      this.fail = handler;
      return this;
    },
    listen() {
      this.fail();
    },
  };
  await assert.rejects(
    verifyLoopbackPortAvailable(3543, () => unavailableServer, false),
    /unavailable/,
  );
  await assert.doesNotReject(verifyLoopbackPortAvailable(8026, () => unavailableServer, true));
});

test('should reject every DNS result except exact IPv4 loopback with no AAAA', async () => {
  await verifyPlaygroundDns({
    resolve4: async () => ['127.0.0.1'],
    resolve6: async () => {
      const error = new Error('no data');
      error.code = 'ENODATA';
      throw error;
    },
  });
  await assert.rejects(
    verifyPlaygroundDns({
      resolve4: async () => ['127.0.0.1', '192.0.2.1'],
      resolve6: async () => [],
    }),
    /unsafe/,
  );
  await assert.rejects(
    verifyPlaygroundDns({
      resolve4: async () => ['127.0.0.1'],
      resolve6: async () => ['::1'],
    }),
    /unsafe/,
  );
});

test('should create owner-only runtime directories', async () => {
  const parent = await mkdtemp(resolve(tmpdir(), 'porta-admin-preflight-'));
  const runtime = resolve(parent, 'runtime');
  try {
    await ensureRuntimePermissions(runtime);
    const { stat } = await import('node:fs/promises');
    assert.equal((await stat(runtime)).mode & 0o777, 0o700);
    assert.equal((await stat(resolve(runtime, 'tls'))).mode & 0o777, 0o700);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
