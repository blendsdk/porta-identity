import { describe, expect, it } from 'vitest';
import { getMagicLinkLiveAuthorityCorrectionCapability } from './magic-link-live-authority-correction-adapter.js';
import {
  MAGIC_LINK_LIVE_AUTHORITY_CORRECTION_CAPABILITY_MISSING,
  MAGIC_LINK_LIVE_AUTHORITY_CORRECTION_ORACLE,
  type MagicLinkLiveAuthorityCorrectionDriver,
  type MagicLinkLiveAuthorityFixture,
  type MagicLinkLiveAuthorityObservation,
} from './magic-link-live-authority-correction-contract.js';

const capabilityRequired = process.env.PORTA_TEST_REQUIRE_MAGIC_LINK_AUTHORITY_CORRECTIONS === '1';
const capability = getMagicLinkLiveAuthorityCorrectionCapability();

/** Require a generic rejection whose shape cannot disclose the failed authority class. */
function expectGenericFailure(
  outcome: Awaited<ReturnType<MagicLinkLiveAuthorityCorrectionDriver['present']>>,
): void {
  expect(outcome).toStrictEqual({
    accepted: false,
    responseShape: '400:text/html:error-page',
    genericFailure: 'invalid-or-expired',
  });
}

/** Require that a rejected callback produced no successful side effect. */
function expectNoSuccessfulEffect(observation: MagicLinkLiveAuthorityObservation): void {
  expect(observation).toMatchObject({
    artifactConsumptions: 0,
    accountMutations: 0,
    successfulAuditEvents: 0,
    continuationWrites: 0,
  });
}

/** Assert that production logger output excludes every arranged protected value. */
function expectProtectedValuesAbsent(
  output: readonly string[],
  fixture: MagicLinkLiveAuthorityFixture,
): void {
  const serialized = output.join('\n');
  for (const protectedValue of [
    fixture.artifact,
    fixture.email,
    fixture.interactionUid,
    fixture.userId,
    fixture.organizationId,
  ]) {
    expect(serialized).not.toContain(protectedValue);
  }
}

describe('magic-link live-authority correction requirements', () => {
  it('should freeze the exact authority, throttling, delivery, and privacy rules', () => {
    expect(MAGIC_LINK_LIVE_AUTHORITY_CORRECTION_ORACLE).toStrictEqual({
      rejectedLiveAuthorities: ['missing', 'foreign-client'],
      callbackLimit: {
        admittedAttempts: 5,
        isolatesSocketPeers: true,
        unavailableAllowsAttempt: false,
      },
      standaloneDelivery: {
        includesInteractionQuery: false,
        successfulUses: 1,
      },
      forbiddenOperationalValues: ['artifact', 'email', 'interaction', 'user', 'organization'],
    });
  });

  it('should fail closed only when production-backed observations are required', () => {
    if (capabilityRequired && !capability.available) {
      throw new Error(MAGIC_LINK_LIVE_AUTHORITY_CORRECTION_CAPABILITY_MISSING);
    }
    expect(capability.available || !capabilityRequired).toBe(true);
  });
});

if (capability.available) {
  describe('magic-link live-authority correction behavior', () => {
    it.each(MAGIC_LINK_LIVE_AUTHORITY_CORRECTION_ORACLE.rejectedLiveAuthorities)(
      'should reject an exact persisted interaction whose live authority is %s without mutation',
      async (liveAuthority) => {
        const driver = await capability.createDriver();
        const fixture = await driver.resetBound();
        await driver.setLiveAuthority(liveAuthority);

        expectGenericFailure(await driver.present());
        const observation = await driver.observe();
        expectNoSuccessfulEffect(observation);
        expectProtectedValuesAbsent(observation.operationalOutput, fixture);
      },
    );

    it('should enforce one isolated callback budget before artifact lookup', async () => {
      const driver = await capability.createDriver();
      await driver.resetCallbackLimit();
      const genericFailure = await driver.present();
      expectGenericFailure(genericFailure);
      for (
        let attempt = 1;
        attempt < MAGIC_LINK_LIVE_AUTHORITY_CORRECTION_ORACLE.callbackLimit.admittedAttempts;
        attempt += 1
      ) {
        expect(await driver.present()).toStrictEqual(genericFailure);
      }

      await driver.activateCallbackArtifact();
      expect(await driver.present()).toStrictEqual(genericFailure);
      expectNoSuccessfulEffect(await driver.observe());

      expect(await driver.present({ socketPeer: '127.0.0.2' })).toMatchObject({
        accepted: true,
        genericFailure: null,
      });
    });

    it('should reject generically when the callback limiter is unavailable', async () => {
      const driver = await capability.createDriver();
      await driver.resetCallbackLimit();
      await driver.activateCallbackArtifact();
      await driver.disableCallbackLimiter();

      expectGenericFailure(await driver.present());
      expectNoSuccessfulEffect(await driver.observe());
    });

    it('should deliver a standalone URL without an interaction query and consume it once', async () => {
      const driver = await capability.createDriver();
      const fixture = await driver.deliverStandalone();
      const delivered = await driver.observe();
      expect(delivered.intendedDeliveries).toBe(1);
      expect(delivered.deliveredUrl).not.toBeNull();
      expect(
        new URL(delivered.deliveredUrl ?? 'https://invalid.test').searchParams.has('interaction'),
      ).toBe(false);

      expect(await driver.present()).toMatchObject({ accepted: true, genericFailure: null });
      expectGenericFailure(await driver.present());
      const finalObservation = await driver.observe();
      expect(finalObservation.artifactConsumptions).toBe(
        MAGIC_LINK_LIVE_AUTHORITY_CORRECTION_ORACLE.standaloneDelivery.successfulUses,
      );
      expectProtectedValuesAbsent(finalObservation.operationalOutput, fixture);
    });

    it('should keep protected authority out of serialized request and continuation logs', async () => {
      const driver = await capability.createDriver();
      const fixture = await driver.resetBound();
      await driver.exerciseOperationalFailures();
      expectProtectedValuesAbsent((await driver.observe()).operationalOutput, fixture);
    });
  });
}
