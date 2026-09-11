import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import type { ActiveCoverageRun } from '../coverage/index.js';
import { admitProductionExposureCases } from '../production-exposure/admission.js';
import {
  boundedPublicResponse,
  exposesBodyInternalDetail,
  exposesInternalDetail,
  headerContractObserved,
  normalizePublicHeaders,
} from '../production-exposure/response-classifier.js';
import {
  OwnedDependencyController,
  passwordResetMailFailureIntegrity,
  type ProductionExposureCommandRunner,
  type PasswordResetRecoveryStateObservation,
} from '../production-exposure/service-controller.js';
import {
  createdSessionIds,
  logoutInvalidatedCreatedSession,
} from '../production-exposure/session-observer.js';
import {
  productionExposureCaseEvidence,
  productionExposureExecutionFailure,
} from '../production-exposure/evidence.js';
import { validationExposureProductionCases } from './validation-exposure-production-case-requirements.js';
import { validationExposureRawCases } from './validation-exposure-raw-case-requirements.js';

const containerId = 'a'.repeat(64);

/** Creates one complete active-run identity for controller implementation tests. */
function activeRun(root: string): ActiveCoverageRun {
  const manifest = {
    runId: '11111111-1111-4111-8111-111111111111',
    scenarioId: 'production-exposure-test',
    composeProject: 'porta_assurance_test',
    worktreePath: root,
    environmentName: 'production-security',
    ports: { porta: 40100, app: 40101, bff: 40102, postgres: 40103, redis: 40104, mailhog: 40105 },
    urls: {
      porta: 'https://porta-harness.ci.portaidentity.com:40100',
      app: 'https://app-harness.ci.portaidentity.com:40101',
      attacker: 'https://127.0.0.1:40101',
      bff: 'https://bff-harness.ci.portaidentity.com:40102',
      postgres: 'postgres://127.0.0.1:40103',
      redis: 'redis://127.0.0.1:40104',
      mailhog: 'http://127.0.0.1:40105',
    },
    certificatePath: resolve(root, 'server.crt'),
  } as const;
  return {
    runId: manifest.runId,
    composeProject: manifest.composeProject,
    lease: {
      runId: manifest.runId,
      startupIntentId: '22222222-2222-4222-8222-222222222222',
      ownerProcess: { pid: 42, startedAtFingerprint: 'start:42' },
      worktreePath: root,
      composeProject: manifest.composeProject,
      containerIds: [containerId],
      networkIds: [],
      hostProcesses: [],
      volumeNames: [],
      ownedPaths: [],
      certificatePath: manifest.certificatePath,
      manifest,
    },
  };
}

/** Creates a deterministic Docker runner and captures every shell-free call. */
function fakeRunner(options?: {
  readonly listedId?: string;
  readonly failStart?: boolean;
  readonly root?: string;
  readonly recoveryStates?: readonly string[];
}): { readonly runner: ProductionExposureCommandRunner; readonly calls: string[][] } {
  const calls: string[][] = [];
  let selectedService = 'redis';
  let recoveryStateIndex = 0;
  return {
    calls,
    runner: {
      async checked(command, args) {
        calls.push([command, ...args]);
        if (command !== 'docker') throw new Error('unexpected executable');
        if (args[0] === 'ps') {
          selectedService =
            args
              .find((value) => value.startsWith('label=com.docker.compose.service='))
              ?.split('=')
              .at(-1) ?? 'redis';
          return { exitCode: 0, stdout: `${options?.listedId ?? containerId}\n`, stderr: '' };
        }
        if (args[0] === 'inspect' && args[1] === '--format' && args[2]?.includes('run-id')) {
          return {
            exitCode: 0,
            stdout: `11111111-1111-4111-8111-111111111111|${options?.root ?? ''}|porta_assurance_test|${selectedService}\n`,
            stderr: '',
          };
        }
        if (args[0] === 'inspect') {
          return {
            exitCode: 0,
            stdout: `true|${selectedService === 'mailhog' ? 'none' : 'healthy'}\n`,
            stderr: '',
          };
        }
        if (args[0] === 'exec' && args[2] === 'psql') {
          const state = options?.recoveryStates?.[recoveryStateIndex];
          if (state === undefined) throw new Error('recovery state fixture is unavailable');
          recoveryStateIndex += 1;
          return { exitCode: 0, stdout: `${state}\n`, stderr: '' };
        }
        if (args[0] === 'start' && options?.failStart === true) {
          throw new Error('start failed');
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    },
  };
}

/** Builds one redacted recovery snapshot without exposing database UUIDs. */
function recoveryState(
  jobs: PasswordResetRecoveryStateObservation['jobs'],
  counts: { readonly jobs: number; readonly tokens: number; readonly orphans?: number },
): PasswordResetRecoveryStateObservation {
  return Object.freeze({
    jobs: Object.freeze(jobs),
    totalJobCount: counts.jobs,
    totalTokenCount: counts.tokens,
    orphanTokenCount: counts.orphans ?? 0,
  });
}

test('should reject version-bearing public server headers', () => {
  const response = boundedPublicResponse(200, { server: 'nginx/1.31.0' }, '{"status":"ok"}');
  assert.equal(headerContractObserved('server-version-header-absent', response), false);
});

test('should admit only the exact production-exposure case set for each profile', () => {
  const candidates = [...validationExposureRawCases, ...validationExposureProductionCases];
  assert.equal(admitProductionExposureCases('operational', candidates).length, 6);
  assert.equal(admitProductionExposureCases('production-security', candidates).length, 11);
  assert.throws(
    () =>
      admitProductionExposureCases(
        'production-security',
        candidates.filter((candidate) => candidate.id !== 'st53-untrusted-forwarded-host'),
      ),
    /exact profile case set is incomplete/u,
  );
  assert.throws(
    () => admitProductionExposureCases('operational', [...candidates, candidates[0]!]),
    /identity is duplicated/u,
  );
});

test('should require one new server session plus public logout and rejected cookie reuse', () => {
  const before = new Set(['fixture-session']);
  const created = createdSessionIds(before, new Set(['fixture-session', 'new-session']));
  assert.deepEqual(created, ['new-session']);
  assert.equal(logoutInvalidatedCreatedSession(created, before, true), true);
  assert.equal(
    logoutInvalidatedCreatedSession(created, new Set(['fixture-session', 'new-session']), true),
    false,
  );
  assert.equal(logoutInvalidatedCreatedSession(created, before, false), false);
  assert.equal(logoutInvalidatedCreatedSession([], before, true), false);
});

test('should derive CORS policy checks from concrete response headers', () => {
  const response = boundedPublicResponse(
    204,
    {
      'access-control-allow-origin': 'https://app-harness.ci.portaidentity.com',
      'access-control-allow-methods': 'GET,POST',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-credentials': 'true',
      'access-control-max-age': '86400',
      vary: 'Accept-Encoding, Origin',
    },
    '',
  );
  assert.equal(
    headerContractObserved(
      'access-control-allow-origin-exactly-echoes-the-configured-origin',
      response,
    ),
    true,
  );
  assert.equal(
    headerContractObserved('access-control-allow-methods-does-not-contain-trace', response),
    true,
  );
  assert.equal(headerContractObserved('access-control-allow-credentials:true', response), true);
  assert.equal(headerContractObserved('access-control-max-age:86400', response), true);
  assert.equal(headerContractObserved('vary-includes-origin', response), true);
});

test('should normalize public header names and reject case-colliding duplicates', () => {
  assert.deepEqual(normalizePublicHeaders({ 'Content-Type': 'application/json' }), {
    'content-type': 'application/json',
  });
  assert.throws(
    () => normalizePublicHeaders({ Server: 'nginx', server: 'porta' }),
    /ambiguous duplicate/u,
  );
});

test('should detect dependency addresses and stack material in public responses', () => {
  assert.equal(
    exposesInternalDetail(
      boundedPublicResponse(
        503,
        { 'content-type': 'application/json' },
        '{"reason":"connect ECONNREFUSED 172.18.0.3:5432 at /app/dist/db.js"}',
      ),
    ),
    true,
  );
});

test('should keep a version header separate from body-internal-detail findings', () => {
  const response = boundedPublicResponse(
    200,
    { server: 'nginx/1.31.0', 'content-type': 'text/html' },
    '<html><form method="post"></form></html>',
  );
  assert.equal(exposesInternalDetail(response), true);
  assert.equal(exposesBodyInternalDetail(response), false);
});

test('should restore the exact owned dependency when the probe fails', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'porta-production-exposure-'));
  try {
    const fake = fakeRunner({ root });
    const controller = new OwnedDependencyController(root, activeRun(root), fake.runner);
    await assert.rejects(
      controller.whileUnavailable('redis', async () => {
        throw new Error('probe failed');
      }),
      /probe failed/u,
    );
    assert.ok(fake.calls.some((call) => call[1] === 'stop' && call.at(-1) === containerId));
    assert.ok(fake.calls.some((call) => call[1] === 'start' && call.at(-1) === containerId));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('should reject a dependency container not listed in the durable lease', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'porta-production-exposure-'));
  try {
    const fake = fakeRunner({ listedId: 'b'.repeat(64), root });
    const controller = new OwnedDependencyController(root, activeRun(root), fake.runner);
    await assert.rejects(
      controller.whileUnavailable('redis', async () => 'unreachable'),
      /owned dependency container identity is unavailable/u,
    );
    assert.equal(
      fake.calls.some((call) => call[1] === 'stop'),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('should apply restoration failure precedence over a successful probe', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'porta-production-exposure-'));
  try {
    const fake = fakeRunner({ failStart: true, root });
    const controller = new OwnedDependencyController(root, activeRun(root), fake.runner);
    await assert.rejects(
      controller.whileUnavailable('redis', async () => 'probe'),
      /start failed/u,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('should restore an owned dependency after the caller signal is aborted', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'porta-production-exposure-'));
  try {
    const fake = fakeRunner({ root });
    const controller = new OwnedDependencyController(root, activeRun(root), fake.runner);
    const interruption = new AbortController();
    await controller.whileUnavailable(
      'redis',
      async () => {
        interruption.abort();
        return 'observed';
      },
      interruption.signal,
    );
    const start = fake.calls.find((call) => call[1] === 'start');
    assert.ok(start);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('should classify one bounded retry job with one owned token as intact', () => {
  const before = recoveryState([], { jobs: 0, tokens: 0 });
  const after = recoveryState(
    [
      {
        identity: `sha256:${'a'.repeat(64)}`,
        status: 'available',
        attemptCount: 1,
        failureReason: 'smtp_outcome_unknown',
        tokenCount: 1,
      },
    ],
    { jobs: 1, tokens: 1 },
  );
  assert.deepEqual(passwordResetMailFailureIntegrity(before, after), {
    validFailureState: true,
    validTokenOwnership: true,
  });
});

test('should reject duplicate probe jobs, duplicate tokens, and new orphan tokens', () => {
  const before = recoveryState([], { jobs: 0, tokens: 0 });
  const after = recoveryState(
    [
      {
        identity: `sha256:${'a'.repeat(64)}`,
        status: 'available',
        attemptCount: 1,
        failureReason: 'smtp_outcome_unknown',
        tokenCount: 2,
      },
      {
        identity: `sha256:${'b'.repeat(64)}`,
        status: 'available',
        attemptCount: 1,
        failureReason: 'smtp_outcome_unknown',
        tokenCount: 0,
      },
    ],
    { jobs: 2, tokens: 2, orphans: 1 },
  );
  assert.deepEqual(passwordResetMailFailureIntegrity(before, after), {
    validFailureState: false,
    validTokenOwnership: false,
  });
});

test('should reject a terminal recovery job before its retry budget is exhausted', () => {
  const before = recoveryState([], { jobs: 0, tokens: 0 });
  const after = recoveryState(
    [
      {
        identity: `sha256:${'a'.repeat(64)}`,
        status: 'terminal_failure',
        attemptCount: 1,
        failureReason: 'smtp_outcome_unknown',
        tokenCount: 1,
      },
    ],
    { jobs: 1, tokens: 1 },
  );
  assert.deepEqual(passwordResetMailFailureIntegrity(before, after), {
    validFailureState: false,
    validTokenOwnership: true,
  });
});

test('should observe mail failure through only the owned bounded recovery query', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'porta-production-exposure-'));
  const completedJob = {
    id: '11111111-1111-4111-8111-111111111111',
    status: 'completed',
    attemptCount: 1,
    failureReason: null,
    tokenCount: 1,
  };
  const failedJob = {
    id: '22222222-2222-4222-8222-222222222222',
    status: 'available',
    attemptCount: 1,
    failureReason: 'smtp_outcome_unknown',
    tokenCount: 1,
  };
  try {
    const fake = fakeRunner({
      root,
      recoveryStates: [
        JSON.stringify({
          jobs: [completedJob],
          totalJobCount: 1,
          totalTokenCount: 1,
          orphanTokenCount: 0,
        }),
        JSON.stringify({
          jobs: [completedJob, failedJob],
          totalJobCount: 2,
          totalTokenCount: 2,
          orphanTokenCount: 0,
        }),
      ],
    });
    const controller = new OwnedDependencyController(root, activeRun(root), fake.runner);
    const observation = await controller.observePasswordResetMailFailure(async () => 'response');
    assert.deepEqual(observation, {
      response: 'response',
      integrity: { validFailureState: true, validTokenOwnership: true },
    });
    const query = fake.calls.find((call) => call[1] === 'exec')?.at(-1);
    assert.ok(query);
    assert.match(query, /LIMIT 64/u);
    assert.doesNotMatch(query, /address_ciphertext|address_iv|address_tag|token_hash/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('should classify an unobserved required state as incomplete evidence', () => {
  const requirement = validationExposureProductionCases.find(
    (entry) => entry.id === 'st55-unconfigured-cors-origin',
  );
  assert.ok(requirement);
  const evidence = productionExposureCaseEvidence(requirement, {
    caseId: requirement.id,
    profile: 'production-security',
    control: {
      status: 200,
      bodyContract: 'control',
      headerContracts: Object.fromEntries(
        requirement.control.requiredObservations.map((name) => [name, true]),
      ),
    },
    probe: {
      status: requirement.expected.status,
      bodyContract: requirement.expected.bodyContract,
      headerContracts: Object.fromEntries(
        requirement.expected.headerContract.map((name) => [name, true]),
      ),
    },
    independentStateObservations: Object.fromEntries(
      requirement.independentStateObservations.map((name) => [name, 'unobserved']),
    ),
    prohibitedSideEffects: Object.fromEntries(
      requirement.prohibitedSideEffects.map((name) => [name, false]),
    ),
    recoveryPassed: true,
    recoveryMode: 'none',
    correlatedLogCredit: false,
    correlatedLogGap: 'correlated-security-decision-event-unavailable',
  });
  assert.equal(evidence.outcome, 'incomplete');
  assert.deepEqual(evidence.unobservedStateObservations, requirement.independentStateObservations);
});

test('should reject a CORS case whose positive control omits an exact response contract', () => {
  const requirement = validationExposureProductionCases.find(
    (entry) => entry.id === 'st55-unconfigured-cors-origin',
  );
  assert.ok(requirement);
  const evidence = productionExposureCaseEvidence(requirement, {
    caseId: requirement.id,
    profile: 'production-security',
    control: { status: 200, bodyContract: 'control', headerContracts: {} },
    probe: {
      status: requirement.expected.status,
      bodyContract: requirement.expected.bodyContract,
      headerContracts: Object.fromEntries(
        requirement.expected.headerContract.map((name) => [name, true]),
      ),
    },
    independentStateObservations: Object.fromEntries(
      requirement.independentStateObservations.map((name) => [name, true]),
    ),
    prohibitedSideEffects: Object.fromEntries(
      requirement.prohibitedSideEffects.map((name) => [name, false]),
    ),
    recoveryPassed: true,
    recoveryMode: 'none',
    correlatedLogCredit: false,
    correlatedLogGap: 'correlated-security-decision-event-unavailable',
  });
  assert.equal(evidence.outcome, 'product-failure');
  assert.deepEqual(evidence.failedControlObservations, requirement.control.requiredObservations);
});

test('should create a closed execution-failure record without retaining raw diagnostics', () => {
  const requirement = validationExposureProductionCases[0];
  assert.ok(requirement);
  const serialized = JSON.stringify(productionExposureExecutionFailure(requirement));
  assert.equal(serialized.includes('/private/worktree'), false);
  assert.equal(serialized.includes('synthetic-secret-canary'), false);
  assert.match(serialized, /"outcome":"execution-failure"/u);
});

test('should restart only the exact lease-owned Porta container for recovery', async () => {
  const root = mkdtempSync(resolve(tmpdir(), 'porta-production-exposure-'));
  try {
    const fake = fakeRunner({ root });
    const controller = new OwnedDependencyController(root, activeRun(root), fake.runner);
    await controller.restartPorta();
    assert.ok(fake.calls.some((call) => call[1] === 'restart' && call.at(-1) === containerId));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
