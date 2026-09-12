import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdminPlaygroundLifecycle } from '../scripts/admin-env.mjs';

/** Creates reset-focused boundaries with exact owned volume tracking. */
function resetFixture(overrides = {}) {
  const events = [];
  const existing = new Set([
    'porta-admin-playground_postgres_data',
    'porta-admin-playground_redis_data',
    'unrelated_data',
  ]);
  const dependencies = {
    runPreflight: async () => events.push('preflight'),
    withMutationLock: async (operation) => operation(),
    stopServices: async () => events.push('stop'),
    canBootstrapInteractively: () => true,
    confirmReset: async () => true,
    resolveVolumeName: async (key) => `porta-admin-playground_${key}`,
    removeVolume: async (name) => {
      events.push(`remove:${name}`);
      existing.delete(name);
    },
    volumeExists: async (name) => existing.has(name),
    rotateSecrets: async () => events.push('rotate'),
    clearMail: async () => events.push('clear-mail'),
    startServices: async () => events.push('start'),
    runMigrations: async () => events.push('migrate'),
    isInitialized: async () => false,
    readHiddenPassword: async () => 'temporary-password',
    initialize: async () => events.push('initialize'),
    verifyHealth: async () => events.push('health'),
    ...overrides,
  };
  return { lifecycle: createAdminPlaygroundLifecycle(dependencies), events, existing };
}

test('should perform no mutation when reset confirmation is declined', async () => {
  const fixture = resetFixture({ confirmReset: async () => false });
  assert.deepEqual(await fixture.lifecycle.reset({ stdinIsTTY: true, stdoutIsTTY: true }), {
    status: 'cancelled',
  });
  assert.deepEqual(fixture.events, []);
});

test('should preserve all state when reset preflight fails', async () => {
  const fixture = resetFixture({
    runPreflight: async () => {
      throw new Error('preflight failed');
    },
  });
  await assert.rejects(
    fixture.lifecycle.reset({ yes: true, stdinIsTTY: true, stdoutIsTTY: true }),
    /preflight failed/,
  );
  assert.deepEqual(fixture.events, []);
  assert.equal(fixture.existing.has('porta-admin-playground_postgres_data'), true);
  assert.equal(fixture.existing.has('porta-admin-playground_redis_data'), true);
});

test('should preserve secrets when Docker cannot prove volume absence', async () => {
  const fixture = resetFixture({
    volumeExists: async () => {
      throw new Error('Docker daemon unavailable');
    },
  });
  await assert.rejects(
    fixture.lifecycle.reset({ yes: true, stdinIsTTY: true, stdoutIsTTY: true }),
    /Docker daemon unavailable/,
  );
  assert.equal(fixture.events.includes('rotate'), false);
  assert.equal(fixture.events.includes('initialize'), false);
});

test('should remove only exact playground volumes before rotating secrets', async () => {
  const fixture = resetFixture();
  await fixture.lifecycle.reset({ yes: true, stdinIsTTY: true, stdoutIsTTY: true });
  assert.deepEqual(
    fixture.events.filter((event) => event.startsWith('remove:')),
    ['remove:porta-admin-playground_postgres_data', 'remove:porta-admin-playground_redis_data'],
  );
  assert.equal(fixture.existing.has('unrelated_data'), true);
  assert.ok(
    fixture.events.indexOf('remove:porta-admin-playground_redis_data') <
      fixture.events.indexOf('rotate'),
  );
});
