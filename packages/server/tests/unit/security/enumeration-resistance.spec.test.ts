import { describe, expect, it } from 'vitest';
import { getEnumerationResistanceCapability } from './enumeration-resistance-adapter.js';
import {
  ENUMERATION_RESISTANCE_CAPABILITY_MISSING,
  ENUMERATION_RESISTANCE_ORACLE,
  PASSWORD_IDENTITY_STATES,
  RECOVERY_JOB_TYPES,
  type EnumerationResistanceObservations,
  type EnumerationResistanceSpecDriver,
  type IdentityFixture,
  type PublicResponseSnapshot,
  type RecoveryDependencyFailure,
} from './enumeration-resistance-contract.js';

const capability = getEnumerationResistanceCapability();
const capabilityRequired = process.env.PORTA_ENUMERATION_SPEC_REQUIRED === '1';

function observationsForAction(
  observations: EnumerationResistanceObservations,
  actionId: string,
): EnumerationResistanceObservations {
  const jobIds = new Set(
    observations.recoveryJobs
      .filter((observation) => observation.actionId === actionId)
      .map((observation) => observation.jobId),
  );

  return {
    passwordVerifications: observations.passwordVerifications.filter(
      (observation) => observation.actionId === actionId,
    ),
    failureOperations: observations.failureOperations.filter(
      (observation) => observation.actionId === actionId,
    ),
    authenticationEffects: observations.authenticationEffects.filter(
      (observation) => observation.actionId === actionId,
    ),
    recoveryJobs: observations.recoveryJobs.filter(
      (observation) => observation.actionId === actionId,
    ),
    artifacts: observations.artifacts.filter((observation) => jobIds.has(observation.jobId)),
    deliveries: observations.deliveries.filter((observation) => jobIds.has(observation.jobId)),
    workerEvents: observations.workerEvents.filter(
      (observation) => observation.jobId === undefined || jobIds.has(observation.jobId),
    ),
    workerReasonCatalog: observations.workerReasonCatalog,
    operationalOutput: observations.operationalOutput,
  };
}

function expectNoAuthenticationEffects(observations: EnumerationResistanceObservations): void {
  expect(observations.authenticationEffects).toStrictEqual([]);
}

function publicFailureContract(response: PublicResponseSnapshot): PublicResponseSnapshot {
  return response;
}

function sensitiveFixtureValues(fixture: IdentityFixture): string[] {
  return [fixture.email, fixture.accountId].filter((value): value is string => value !== undefined);
}

function normalizedOperationalOutput(
  observations: EnumerationResistanceObservations,
  fixture: IdentityFixture,
): readonly string[] {
  const dynamicValues = [
    ...sensitiveFixtureValues(fixture),
    ...observations.recoveryJobs.flatMap((job) => [job.actionId, job.jobId]),
  ];
  return observations.operationalOutput.map((line) =>
    dynamicValues.reduce((normalized, value) => normalized.split(value).join('<ref>'), line),
  );
}

async function withDriver(
  behavior: (driver: EnumerationResistanceSpecDriver) => Promise<void>,
): Promise<void> {
  if (!capability.available) {
    throw new Error(ENUMERATION_RESISTANCE_CAPABILITY_MISSING);
  }
  await behavior(await capability.createDriver());
}

describe('enumeration-resistance requirement catalog', () => {
  it('fixes the complete immutable enumeration-resistance oracle set', () => {
    expect(ENUMERATION_RESISTANCE_ORACLE.specificationCases).toStrictEqual([
      'password-failure-work-shape',
      'dummy-hash-has-no-authority',
      'recovery-request-work-shape',
      'recovery-worker-private-outcome',
      'recovery-worker-bounds',
      'timing-diagnostics-are-non-gating',
    ]);
    expect(ENUMERATION_RESISTANCE_ORACLE.passwordIdentityStates).toStrictEqual([
      'active',
      'absent',
      'passwordless',
      'disabled',
      'suspended',
      'locked',
    ]);
    expect(ENUMERATION_RESISTANCE_ORACLE.recoveryJobTypes).toStrictEqual([
      'magic_link',
      'password_reset',
    ]);
  });

  it('fixes exact password, recovery, worker, and timing bounds', () => {
    expect(ENUMERATION_RESISTANCE_ORACLE.password).toStrictEqual({
      argon2idVerificationsPerAdmittedAttempt: 1,
      failureOperationsPerFailedAttempt: 1,
      dummyVerificationCanAuthenticate: false,
    });
    expect(ENUMERATION_RESISTANCE_ORACLE.recoveryRequest).toStrictEqual({
      jobsPerAdmittedRequest: 1,
      accountSpecificWorkInRequest: false,
    });
    expect(ENUMERATION_RESISTANCE_ORACLE.evidence).toStrictEqual({
      passwordVerifier: 'production-service',
      failurePersistence: 'production-repository',
      recoveryProcessor: 'production-processor',
      durableState: 'database-observer',
      delivery: 'mail-transport-observer',
    });
    expect(ENUMERATION_RESISTANCE_ORACLE.worker).toStrictEqual({
      claimBatchMaximum: 25,
      fallbackPollMilliseconds: 1_000,
      totalAttempts: 5,
      retryDelaysMilliseconds: [1_000, 10_000, 60_000, 300_000],
      leaseMilliseconds: 300_000,
      shutdownSettleMilliseconds: 30_000,
    });
    expect(ENUMERATION_RESISTANCE_ORACLE.timing).toStrictEqual({
      gating: false,
      securityClaimImpact: 'none',
      ordinaryVerificationMember: false,
    });
  });

  it('fails closed only when live capability is explicitly required', () => {
    if (capabilityRequired && !capability.available) {
      throw new Error(ENUMERATION_RESISTANCE_CAPABILITY_MISSING);
    }
    expect(capability.available || !capabilityRequired).toBe(true);
  });
});

if (capability.available) {
  describe('enumeration-resistance behavior', () => {
    it('gives every admitted failure one Argon2id check and one fixed-shape operation', async () => {
      await withDriver(async (driver) => {
        let referenceResponse: PublicResponseSnapshot | undefined;
        let referenceFailureShape: readonly string[] | undefined;

        for (const state of PASSWORD_IDENTITY_STATES) {
          const fixture = await driver.reset(state);
          const action = await driver.submitPassword({ fixture, password: 'wrong' });
          const observed = observationsForAction(await driver.observe(), action.actionId);

          expect(observed.passwordVerifications).toHaveLength(1);
          expect(observed.passwordVerifications[0]).toMatchObject({ algorithm: 'argon2id' });
          expect(observed.failureOperations).toHaveLength(1);
          expectNoAuthenticationEffects(observed);

          referenceResponse ??= publicFailureContract(action.response);
          referenceFailureShape ??= observed.failureOperations[0].operationShape;
          expect(publicFailureContract(action.response)).toStrictEqual(referenceResponse);
          expect(observed.failureOperations[0].operationShape).toStrictEqual(referenceFailureShape);
        }
      });
    });

    it('keeps the production dummy-verification path without authentication authority', async () => {
      await withDriver(async (driver) => {
        const absent = await driver.reset('absent');
        const absentAction = await driver.submitPassword({
          fixture: absent,
          password: 'fixture-valid',
        });
        const absentObserved = observationsForAction(await driver.observe(), absentAction.actionId);

        expect(absentObserved.passwordVerifications).toHaveLength(1);
        expect(absentObserved.passwordVerifications[0]).toMatchObject({
          algorithm: 'argon2id',
          hashSource: 'dummy',
          matched: false,
        });
        expectNoAuthenticationEffects(absentObserved);

        const active = await driver.reset('active');
        const activeAction = await driver.submitPassword({
          fixture: active,
          password: 'fixture-valid',
        });
        const activeObserved = observationsForAction(await driver.observe(), activeAction.actionId);

        expect(activeObserved.passwordVerifications).toHaveLength(1);
        expect(activeObserved.passwordVerifications[0]).toMatchObject({
          algorithm: 'argon2id',
          hashSource: 'account',
          matched: true,
        });
        expect(activeObserved.authenticationEffects.map((effect) => effect.kind)).toContain(
          'authentication',
        );
      });
    });

    it('inserts one equal-shape job before every generic recovery response', async () => {
      await withDriver(async (driver) => {
        for (const jobType of RECOVERY_JOB_TYPES) {
          let referenceResponse: PublicResponseSnapshot | undefined;
          let referenceSchema: readonly string[] | undefined;

          for (const state of PASSWORD_IDENTITY_STATES) {
            const fixture = await driver.reset(state);
            const action = await driver.requestRecovery({ fixture, jobType });
            const observed = observationsForAction(await driver.observe(), action.actionId);

            expect(observed.recoveryJobs).toHaveLength(1);
            expect(observed.recoveryJobs[0]).toMatchObject({
              actionId: action.actionId,
              jobType,
              organizationId: fixture.tenantId,
              containsToken: false,
              status: 'available',
              attemptCount: 0,
            });
            expect(observed.artifacts).toStrictEqual([]);
            expect(observed.deliveries).toStrictEqual([]);
            expect(observed.passwordVerifications).toStrictEqual([]);
            expect(observed.failureOperations).toStrictEqual([]);
            expectNoAuthenticationEffects(observed);

            referenceResponse ??= action.response;
            referenceSchema ??= observed.recoveryJobs[0].schema;
            expect(action.response).toStrictEqual(referenceResponse);
            expect(observed.recoveryJobs[0].schema).toStrictEqual(referenceSchema);
          }
        }
      });
    });

    it('delivers active work once while absent and ineligible work completes privately', async () => {
      await withDriver(async (driver) => {
        for (const jobType of RECOVERY_JOB_TYPES) {
          let referenceOperationalOutput: readonly string[] | undefined;
          for (const state of ['active', 'absent', 'disabled'] as const) {
            const fixture = await driver.reset(state);
            await driver.requestRecovery({ fixture, jobType });
            await driver.runRecoveryWorkerOnce();
            const observed = await driver.observe();

            const activeArtifacts = observed.artifacts.filter((artifact) => artifact.active);
            if (state === 'active') {
              expect(activeArtifacts).toHaveLength(1);
              expect(observed.deliveries).toHaveLength(1);
            } else {
              expect(activeArtifacts).toStrictEqual([]);
              expect(observed.deliveries).toStrictEqual([]);
            }
            expect(observed.recoveryJobs).toHaveLength(1);
            expect(observed.recoveryJobs[0].status).toBe('completed');

            const output = observed.operationalOutput.join('\n');
            for (const sensitiveValue of sensitiveFixtureValues(fixture)) {
              expect(output).not.toContain(sensitiveValue);
            }
            referenceOperationalOutput ??= normalizedOperationalOutput(observed, fixture);
            expect(normalizedOperationalOutput(observed, fixture)).toStrictEqual(
              referenceOperationalOutput,
            );
          }
        }
      });
    });

    it('bounds claims, lease recovery, retry, terminal failure, and shutdown', async () => {
      await withDriver(async (driver) => {
        const fixture = await driver.reset('active');
        await driver.requestRecovery({ fixture, jobType: 'magic_link' });
        await driver.enqueueAdditionalRecoveryJobs({ count: 25, identityState: 'absent' });
        await driver.crashRecoveryWorkerAfterClaim();

        let observed = await driver.observe();
        expect(observed.workerEvents.filter((event) => event.event === 'claimed')).toHaveLength(25);

        await driver.restartRecoveryWorker();
        await driver.advanceClock(ENUMERATION_RESISTANCE_ORACLE.worker.leaseMilliseconds - 1);
        await driver.runRecoveryWorkerOnce();
        observed = await driver.observe();
        expect(
          observed.workerEvents.filter((event) => event.event === 'lease_reclaimed'),
        ).toHaveLength(0);

        await driver.advanceClock(1);
        await driver.runRecoveryWorkerOnce();
        observed = await driver.observe();
        expect(
          observed.workerEvents.filter((event) => event.event === 'lease_reclaimed'),
        ).toHaveLength(25);
        expect(observed.artifacts.filter((artifact) => artifact.active).length).toBeLessThanOrEqual(
          1,
        );
        const deliveredJobIds = new Set(observed.deliveries.map((delivery) => delivery.jobId));
        expect(deliveredJobIds.size).toBeLessThanOrEqual(1);

        const retryFixture = await driver.reset('active');
        await driver.requestRecovery({ fixture: retryFixture, jobType: 'password_reset' });
        const failurePlan: readonly RecoveryDependencyFailure[] = [
          'database',
          'smtp',
          'database',
          'smtp',
          'database',
        ];
        await driver.setRecoveryFailurePlan(failurePlan);
        for (const delay of ENUMERATION_RESISTANCE_ORACLE.worker.retryDelaysMilliseconds) {
          await driver.runRecoveryWorkerOnce();
          await driver.advanceClock(delay);
        }
        observed = await driver.observe();
        expect(
          observed.workerEvents
            .filter((event) => event.event === 'retry_scheduled')
            .map((event) => event.delayMilliseconds),
        ).toStrictEqual(ENUMERATION_RESISTANCE_ORACLE.worker.retryDelaysMilliseconds);
        expect(
          observed.workerEvents.filter((event) => event.event === 'terminal_failure'),
        ).toHaveLength(1);
        expect(observed.recoveryJobs[0]).toMatchObject({
          status: 'terminal_failure',
          attemptCount: ENUMERATION_RESISTANCE_ORACLE.worker.totalAttempts,
        });
        const terminalReason = observed.workerEvents.at(-1)?.reason;
        expect(terminalReason).toMatch(/^[a-z][a-z0-9_]*$/);
        expect(observed.workerReasonCatalog).toContain(terminalReason);
        expect(new Set(observed.workerReasonCatalog).size).toBe(
          observed.workerReasonCatalog.length,
        );
        expect(observed.artifacts.filter((artifact) => artifact.active).length).toBeLessThanOrEqual(
          1,
        );
        const deliveryIdentities = new Set(
          observed.deliveries.map((delivery) => delivery.artifactIdentity),
        );
        expect(deliveryIdentities.size).toBeLessThanOrEqual(1);
        const unknownOutcomeDeliveries = observed.deliveries.filter(
          (delivery) => delivery.outcome === 'accepted_outcome_unknown',
        );
        expect(observed.deliveries.length > 1).toBe(unknownOutcomeDeliveries.length > 0);

        await driver.beginRecoveryWorkerShutdown();
        await driver.advanceClock(ENUMERATION_RESISTANCE_ORACLE.worker.shutdownSettleMilliseconds);
        observed = await driver.observe();
        expect(observed.workerEvents.map((event) => event.event)).toContain('shutdown_settled');
      });
    });

    it('gives timing diagnostics no gating or claim-transition authority', async () => {
      await withDriver(async (driver) => {
        expect(await driver.readTimingDiagnostic()).toStrictEqual({
          gating: false,
          securityClaimImpact: 'none',
          ordinaryVerificationMember: false,
          securityClaimTransitions: [],
        });
      });
    });
  });
}
