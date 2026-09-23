import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';

const playgroundRoot = resolve(import.meta.dirname, '..');
const lifecyclePath = resolve(playgroundRoot, 'scripts/admin-env.mjs');
const composePath = resolve(playgroundRoot, 'compose.yml');

/**
 * @typedef {object} AdminPlaygroundLifecycle
 * @property {(options: Record<string, unknown>) => Promise<unknown>} up Starts or resumes the playground.
 * @property {() => Promise<unknown>} stop Stops the playground while preserving state.
 * @property {(options: Record<string, unknown>) => Promise<unknown>} reset Resets exact owned state.
 * @property {() => Promise<Record<string, unknown>>} status Reports a bounded lifecycle state.
 */

/**
 * Loads the lifecycle factory after proving the production entry point exists.
 *
 * @returns {Promise<(dependencies: Record<string, unknown>) => AdminPlaygroundLifecycle>} Factory with injected system boundaries.
 */
async function loadLifecycleFactory() {
  await assert.doesNotReject(
    access(lifecyclePath),
    'the admin playground lifecycle entry point must exist',
  );
  const lifecycleModule = await import(pathToFileURL(lifecyclePath).href);

  assert.equal(
    typeof lifecycleModule.createAdminPlaygroundLifecycle,
    'function',
    'the lifecycle must expose an injectable factory for Docker-free verification',
  );
  return lifecycleModule.createAdminPlaygroundLifecycle;
}

/**
 * Creates deterministic lifecycle boundaries without invoking Docker, DNS, or terminal APIs.
 *
 * @param {Record<string, unknown>} overrides Boundary replacements for one scenario.
 * @returns {{ dependencies: Record<string, unknown>, events: string[], state: Record<string, unknown> }} Fixture state.
 */
function createLifecycleFixture(overrides = {}) {
  const events = [];
  const state = {
    initialized: false,
    secret: 'stable-infrastructure-secret',
    status: 'healthy',
  };
  const dependencies = {
    runPreflight: async () => events.push('preflight'),
    withMutationLock: async (operation) => {
      events.push('lock:begin');
      try {
        return await operation();
      } finally {
        events.push('lock:end');
      }
    },
    ensureStableSecrets: async () => {
      events.push('secrets');
      return state.secret;
    },
    startServices: async () => events.push('start'),
    runMigrations: async () => events.push('migrate'),
    isInitialized: async () => state.initialized,
    readHiddenPassword: async () => {
      events.push('password');
      return 'fixture-password';
    },
    initialize: async (input) => {
      events.push('initialize');
      state.initialized = true;
      state.initializeInput = input;
    },
    verifyHealth: async () => {
      events.push('health');
      return { porta: 'healthy', mailhog: 'healthy' };
    },
    stopServices: async () => events.push('stop'),
    canBootstrapInteractively: () => true,
    resolveVolumeName: async (volumeKey) => `porta-admin-playground_${volumeKey}`,
    removeVolume: async (volumeName) => events.push(`remove:${volumeName}`),
    volumeExists: async () => false,
    rotateSecrets: async () => {
      events.push('rotate-secrets');
      state.secret = 'rotated-infrastructure-secret';
    },
    clearMail: async () => events.push('clear-mail'),
    inspectStatus: async () => ({
      state: state.status,
      endpoints: [
        'https://porta-admin-playground.ci.portaidentity.com:3543',
        'http://127.0.0.1:8026',
      ],
    }),
    ...overrides,
  };

  return { dependencies, events, state };
}

/**
 * Reads the declarative playground topology without running Docker.
 *
 * @returns {Promise<Record<string, unknown>>} Parsed Compose configuration.
 */
async function readComposeConfiguration() {
  return parse(await readFile(composePath, 'utf8'));
}

test('should bootstrap the verified administrator in lifecycle order when clean state is started', async () => {
  const createLifecycle = await loadLifecycleFactory();
  const fixture = createLifecycleFixture();
  const lifecycle = createLifecycle(fixture.dependencies);

  await lifecycle.up({ stdinIsTTY: true, stdoutIsTTY: true });

  const orderedOperations = fixture.events.filter((event) =>
    ['preflight', 'start', 'migrate', 'initialize', 'health'].includes(event),
  );
  assert.deepEqual(orderedOperations, ['preflight', 'start', 'migrate', 'initialize', 'health']);
  assert.deepEqual(fixture.state.initializeInput, {
    organizationSlug: 'porta-admin',
    organizationName: 'Porta Admin',
    email: 'admin@playground.porta.test',
    givenName: 'Playground',
    familyName: 'Administrator',
    password: 'fixture-password',
  });
  assert.equal(fixture.state.secret, 'stable-infrastructure-secret');
});

test('should preserve data and secrets without another password prompt when stopped state is started again', async () => {
  const createLifecycle = await loadLifecycleFactory();
  const fixture = createLifecycleFixture();
  const lifecycle = createLifecycle(fixture.dependencies);

  await lifecycle.up({ stdinIsTTY: true, stdoutIsTTY: true });
  await lifecycle.stop();
  await lifecycle.up({ stdinIsTTY: true, stdoutIsTTY: true });

  assert.equal(fixture.events.filter((event) => event === 'initialize').length, 1);
  assert.equal(fixture.events.filter((event) => event === 'password').length, 1);
  assert.equal(fixture.events.filter((event) => event === 'health').length, 2);
  assert.equal(fixture.state.secret, 'stable-infrastructure-secret');
});

test('should route application email to internal MailHog when the playground topology is rendered', async () => {
  const compose = await readComposeConfiguration();
  const portaEnvironment = JSON.stringify(compose.services?.porta?.environment ?? {});

  assert.ok(
    compose.services?.mailhog,
    'the playground must include MailHog from its first milestone',
  );
  assert.match(portaEnvironment, /mailhog/i, 'Porta SMTP must target the internal MailHog service');
  assert.match(portaEnvironment, /1025/, 'Porta SMTP must use MailHog internal SMTP port 1025');
  assert.deepEqual(
    compose.services.mailhog.ports,
    ['127.0.0.1:${PORTA_ADMIN_MAILHOG_PORT:-8026}:8025'],
    'only the MailHog web UI may be published to loopback',
  );
});

test('should serialize mutating commands when two lifecycle operations contend', async () => {
  const createLifecycle = await loadLifecycleFactory();
  let releaseFirstMutation;
  const firstMutationGate = new Promise((resolveGate) => {
    releaseFirstMutation = resolveGate;
  });
  let lockTail = Promise.resolve();
  let activeMutations = 0;
  let maximumActiveMutations = 0;
  const fixture = createLifecycleFixture({
    withMutationLock: async (operation) => {
      const previous = lockTail;
      let releaseLock;
      lockTail = new Promise((resolveLock) => {
        releaseLock = resolveLock;
      });
      await previous;
      activeMutations += 1;
      maximumActiveMutations = Math.max(maximumActiveMutations, activeMutations);
      try {
        return await operation();
      } finally {
        activeMutations -= 1;
        releaseLock();
      }
    },
    startServices: async () => {
      fixture.events.push('start');
      await firstMutationGate;
    },
  });
  const lifecycle = createLifecycle(fixture.dependencies);

  const firstUp = lifecycle.up({ stdinIsTTY: true, stdoutIsTTY: true });
  await new Promise((resolveImmediate) => setImmediate(resolveImmediate));
  const competingStop = lifecycle.stop();
  releaseFirstMutation();
  await Promise.all([firstUp, competingStop]);

  assert.equal(maximumActiveMutations, 1);
  assert.ok(fixture.events.indexOf('health') < fixture.events.indexOf('stop'));
});

test('should reject reset without mutation when hidden password input is unavailable', async () => {
  const createLifecycle = await loadLifecycleFactory();
  const fixture = createLifecycleFixture({ canBootstrapInteractively: () => false });
  const lifecycle = createLifecycle(fixture.dependencies);

  await assert.rejects(
    lifecycle.reset({ yes: true, stdinIsTTY: false, stdoutIsTTY: false }),
    /interactive|terminal|hidden password/i,
  );
  assert.deepEqual(fixture.events, []);
  assert.equal(fixture.state.secret, 'stable-infrastructure-secret');
});

test('should leave state untouched when the bounded mutation lock cannot be acquired', async () => {
  const createLifecycle = await loadLifecycleFactory();
  const fixture = createLifecycleFixture({
    withMutationLock: async () => {
      throw new Error('playground operation unavailable');
    },
  });
  const lifecycle = createLifecycle(fixture.dependencies);

  await assert.rejects(
    lifecycle.up({ stdinIsTTY: true, stdoutIsTTY: true }),
    /unavailable|lock|operation/i,
  );
  assert.deepEqual(fixture.events, []);
  assert.equal(fixture.state.secret, 'stable-infrastructure-secret');
});

test('should preserve old secrets and skip bootstrap when any exact reset volume remains', async () => {
  const createLifecycle = await loadLifecycleFactory();
  const compose = await readComposeConfiguration();
  const volumeKeys = Object.keys(compose.volumes ?? {});
  assert.ok(volumeKeys.length > 0, 'the playground must own at least one data volume');
  const remainingVolume = `porta-admin-playground_${volumeKeys[0]}`;
  const fixture = createLifecycleFixture({
    volumeExists: async (volumeName) => volumeName === remainingVolume,
  });
  const lifecycle = createLifecycle(fixture.dependencies);

  await assert.rejects(
    lifecycle.reset({ yes: true, stdinIsTTY: true, stdoutIsTTY: true }),
    /partial|volume|reset/i,
  );

  assert.deepEqual(
    fixture.events.filter((event) => event.startsWith('remove:')),
    volumeKeys.map((key) => `remove:porta-admin-playground_${key}`),
  );
  assert.equal(fixture.events.includes('rotate-secrets'), false);
  assert.equal(fixture.events.includes('initialize'), false);
  assert.equal(fixture.state.secret, 'stable-infrastructure-secret');
});

test('should rotate only after exact volume deletion when a confirmed reset completes', async () => {
  const createLifecycle = await loadLifecycleFactory();
  const compose = await readComposeConfiguration();
  const volumeKeys = Object.keys(compose.volumes ?? {});
  const unrelatedResource = 'unrelated-project_data';
  const existingResources = new Set([
    unrelatedResource,
    ...volumeKeys.map((key) => `porta-admin-playground_${key}`),
  ]);
  const fixture = createLifecycleFixture({
    removeVolume: async (volumeName) => {
      fixture.events.push(`remove:${volumeName}`);
      existingResources.delete(volumeName);
    },
    volumeExists: async (volumeName) => existingResources.has(volumeName),
  });
  const lifecycle = createLifecycle(fixture.dependencies);

  await lifecycle.reset({ yes: true, stdinIsTTY: true, stdoutIsTTY: true });

  const lastRemovalIndex = Math.max(
    ...fixture.events
      .map((event, index) => (event.startsWith('remove:') ? index : -1))
      .filter((index) => index >= 0),
  );
  assert.ok(lastRemovalIndex < fixture.events.indexOf('rotate-secrets'));
  assert.ok(fixture.events.indexOf('rotate-secrets') < fixture.events.indexOf('initialize'));
  assert.equal(existingResources.has(unrelatedResource), true);
  assert.equal(fixture.state.secret, 'rotated-infrastructure-secret');
});

test('should report bounded non-secret status without mutation when lifecycle states differ', async () => {
  const createLifecycle = await loadLifecycleFactory();

  for (const expectedState of ['missing', 'stopped', 'partial', 'healthy']) {
    const fixture = createLifecycleFixture();
    fixture.state.status = expectedState;
    const lifecycle = createLifecycle(fixture.dependencies);
    const result = await lifecycle.status();
    const serializedResult = JSON.stringify(result);

    assert.equal(result.state, expectedState);
    assert.deepEqual(result.endpoints, [
      'https://porta-admin-playground.ci.portaidentity.com:3543',
      'http://127.0.0.1:8026',
    ]);
    assert.ok(serializedResult.length <= 512, 'status output must remain bounded');
    assert.doesNotMatch(
      serializedResult,
      /stable-infrastructure-secret|password|DATABASE_URL|raw configuration/i,
      'status must not expose secrets or raw configuration',
    );
    assert.deepEqual(fixture.events, []);
  }
});
