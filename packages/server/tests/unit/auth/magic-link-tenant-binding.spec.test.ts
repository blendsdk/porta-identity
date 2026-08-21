import { describe, expect, it } from 'vitest';
import { getMagicLinkTenantBindingCapability } from './magic-link-tenant-binding-adapter.js';
import {
  MAGIC_LINK_TENANT_BINDING_CAPABILITY_MISSING,
  MAGIC_LINK_TENANT_BINDING_ORACLE,
  type MagicLinkAuthorityFixture,
  type MagicLinkAuthorityObservations,
  type MagicLinkPublicOutcome,
  type MagicLinkTenantBindingSpecDriver,
} from './magic-link-tenant-binding-contract.js';

const capability = getMagicLinkTenantBindingCapability();
const capabilityRequired = process.env.PORTA_MAGIC_LINK_AUTHORITY_SPEC_REQUIRED === '1';

/** Runs a behavior case only through an admitted public-action and owned-observer driver. */
async function withDriver(
  behavior: (driver: MagicLinkTenantBindingSpecDriver) => Promise<void>,
): Promise<void> {
  if (!capability.available) {
    throw new Error(MAGIC_LINK_TENANT_BINDING_CAPABILITY_MISSING);
  }
  await behavior(await capability.createDriver());
}

/** Asserts that an invalid presentation adds no durable or session-visible effect. */
function expectNoMutation(
  observations: MagicLinkAuthorityObservations,
  expectedConsumptionCount = 0,
): void {
  expect(observations).toMatchObject({
    artifactConsumptionCount: expectedConsumptionCount,
    userMutations: 0,
    emailMutations: 0,
    loginEffects: 0,
    successfulAuditEvents: 0,
    continuationWrites: 0,
    sessionMutations: 0,
    continuationExists: false,
  });
}

/** Asserts the generic public rejection shared by every authority-invalid presentation. */
function expectGenericRejection(outcome: MagicLinkPublicOutcome): void {
  expect(outcome).toMatchObject({ accepted: false });
  expect(outcome.genericError).not.toBeNull();
}

/** Asserts operational output contains none of the protected input classes. */
function expectPrivacySafeOutput(
  observations: MagicLinkAuthorityObservations,
  fixture: MagicLinkAuthorityFixture,
): void {
  const protectedValues = [
    fixture.email,
    fixture.tokenValue,
    fixture.interactionUid,
    fixture.changedInteractionUid,
    fixture.foreignClientInteractionUid,
  ];
  for (const line of observations.operationalOutput) {
    for (const protectedValue of protectedValues) {
      expect(line).not.toContain(protectedValue);
    }
  }
}

describe('magic-link tenant-binding requirement catalog', () => {
  it('should fix the complete immutable magic-link authority oracle set', () => {
    expect(MAGIC_LINK_TENANT_BINDING_ORACLE.specificationCases).toStrictEqual([
      'foreign-route-rejects-before-mutation',
      'exact-bound-presentation-succeeds-once',
      'stored-interaction-is-authoritative',
      'standalone-rejects-supplied-interaction',
      'consumed-artifact-cannot-replay',
      'concurrent-exact-continuation-consume-is-single-use',
      'mismatched-continuation-consume-preserves-key',
    ]);
  });

  it('should fix exact artifact, interaction, single-use, and privacy authority bounds', () => {
    expect(MAGIC_LINK_TENANT_BINDING_ORACLE.artifactAuthority).toStrictEqual({
      routeOrganizationMatchesArtifact: true,
      artifactOrganizationMatchesUser: true,
      mismatchConsumesArtifact: false,
    });
    expect(MAGIC_LINK_TENANT_BINDING_ORACLE.interactionAuthority).toStrictEqual({
      boundArtifactRequiresExactPersistedUid: true,
      interactionClientMatchesRouteOrganization: true,
      standaloneAcceptsSuppliedUid: false,
      queryOverridesPersistedAuthority: false,
    });
    expect(MAGIC_LINK_TENANT_BINDING_ORACLE.singleUse).toStrictEqual({
      successfulArtifactPresentations: 1,
      successfulExactContinuationConsumers: 1,
      mismatchPreservesContinuation: true,
    });
    expect(MAGIC_LINK_TENANT_BINDING_ORACLE.privacy).toStrictEqual({
      failureIsGeneric: true,
      forbiddenLogValues: ['token', 'email', 'raw-interaction'],
    });
  });

  it('should fail closed only when live authority evidence is explicitly required', () => {
    if (capabilityRequired && !capability.available) {
      throw new Error(MAGIC_LINK_TENANT_BINDING_CAPABILITY_MISSING);
    }
    expect(capability.available || !capabilityRequired).toBe(true);
  });
});

if (capability.available) {
  describe('magic-link tenant-binding behavior', () => {
    // A foreign route must leave an artifact intact so its exact owning route can still consume it once.
    it('should preserve a foreign-route rejection for the same artifact that later succeeds exactly once', async () => {
      await withDriver(async (driver) => {
        const fixture = await driver.reset({ mode: 'interaction-bound' });
        const foreignOutcome = await driver.present({
          routeOrganizationId: fixture.foreignOrganizationId,
          interactionUid: fixture.interactionUid,
        });

        expectGenericRejection(foreignOutcome);
        const rejectedObservations = await driver.observe();
        expectNoMutation(rejectedObservations);
        expectPrivacySafeOutput(rejectedObservations, fixture);

        const exactOutcome = await driver.present({
          routeOrganizationId: fixture.organizationId,
          interactionUid: fixture.interactionUid,
        });

        expect(exactOutcome).toMatchObject({ accepted: true, genericError: null });
        expect(await driver.observe()).toMatchObject({
          artifactConsumptionCount: 1,
          userMutations: 1,
          emailMutations: 0,
          loginEffects: 1,
          successfulAuditEvents: 1,
          continuationWrites: 1,
          sessionMutations: 0,
          continuationExists: true,
        });
      });
    });

    // Transport values, expiry, and a foreign route must all share one generic rejection contract.
    it('should use one generic failure shape for every invalid authority presentation', async () => {
      await withDriver(async (driver) => {
        const foreignFixture = await driver.reset({ mode: 'interaction-bound' });
        const foreignOutcome = await driver.present({
          routeOrganizationId: foreignFixture.foreignOrganizationId,
          interactionUid: foreignFixture.interactionUid,
        });
        expectGenericRejection(foreignOutcome);
        const foreignObservations = await driver.observe();
        expectNoMutation(foreignObservations);
        expectPrivacySafeOutput(foreignObservations, foreignFixture);

        const referenceFailure = foreignOutcome;
        for (const invalidInteraction of ['missing', 'changed', 'foreign-client'] as const) {
          const fixture = await driver.reset({ mode: 'interaction-bound' });
          const interactionUid =
            invalidInteraction === 'changed'
              ? fixture.changedInteractionUid
              : invalidInteraction === 'foreign-client'
                ? fixture.foreignClientInteractionUid
                : undefined;
          const outcome = await driver.present({
            routeOrganizationId: fixture.organizationId,
            ...(interactionUid === undefined ? {} : { interactionUid }),
          });

          expectGenericRejection(outcome);
          expect(outcome).toStrictEqual(referenceFailure);
          const observations = await driver.observe();
          expectNoMutation(observations);
          expectPrivacySafeOutput(observations, fixture);
        }

        const expiredFixture = await driver.reset({ mode: 'interaction-bound' });
        await driver.expireArtifact();
        const expiredOutcome = await driver.present({
          routeOrganizationId: expiredFixture.organizationId,
          interactionUid: expiredFixture.interactionUid,
        });
        expectGenericRejection(expiredOutcome);
        expect(expiredOutcome).toStrictEqual(referenceFailure);
        const expiredObservations = await driver.observe();
        expectNoMutation(expiredObservations);
        expectPrivacySafeOutput(expiredObservations, expiredFixture);

        const standaloneFixture = await driver.reset({ mode: 'standalone' });
        const standaloneOutcome = await driver.present({
          routeOrganizationId: standaloneFixture.organizationId,
          interactionUid: standaloneFixture.interactionUid,
        });
        expectGenericRejection(standaloneOutcome);
        expect(standaloneOutcome).toStrictEqual(referenceFailure);
        const standaloneObservations = await driver.observe();
        expectNoMutation(standaloneObservations);
        expectPrivacySafeOutput(standaloneObservations, standaloneFixture);

        const replayFixture = await driver.reset({ mode: 'interaction-bound' });
        await driver.consumeArtifact();
        const replayOutcome = await driver.present({
          routeOrganizationId: replayFixture.organizationId,
          interactionUid: replayFixture.interactionUid,
        });
        expectGenericRejection(replayOutcome);
        expect(replayOutcome).toStrictEqual(referenceFailure);
        const replayObservations = await driver.observe();
        expectNoMutation(replayObservations, 1);
        expectPrivacySafeOutput(replayObservations, replayFixture);
      });
    });

    // Concurrent exact consumers may create at most one session and must remove the continuation key.
    it('should allow exactly one concurrent exact continuation consumer', async () => {
      await withDriver(async (driver) => {
        const fixture = await driver.reset({ mode: 'interaction-bound' });
        await driver.present({
          routeOrganizationId: fixture.organizationId,
          interactionUid: fixture.interactionUid,
        });

        const consumers = await Promise.all([
          driver.consumeContinuation({
            organizationId: fixture.organizationId,
            interactionUid: fixture.interactionUid,
          }),
          driver.consumeContinuation({
            organizationId: fixture.organizationId,
            interactionUid: fixture.interactionUid,
          }),
        ]);

        expect(consumers.filter((consumer) => consumer.sessionCreated)).toHaveLength(1);
        expect(await driver.observe()).toMatchObject({
          continuationExists: false,
          sessionMutations: 1,
        });
      });
    });

    // A continuation mismatch is non-destructive so the legitimate tenant and interaction can retry once.
    it('should preserve a continuation after a mismatched consume and allow one exact retry', async () => {
      await withDriver(async (driver) => {
        const fixture = await driver.reset({ mode: 'interaction-bound' });
        await driver.present({
          routeOrganizationId: fixture.organizationId,
          interactionUid: fixture.interactionUid,
        });

        const mismatch = await driver.consumeContinuation({
          organizationId: fixture.foreignOrganizationId,
          interactionUid: fixture.changedInteractionUid,
        });
        expect(mismatch).toStrictEqual({ sessionCreated: false });
        expect(await driver.observe()).toMatchObject({
          continuationExists: true,
          sessionMutations: 0,
        });

        const retry = await driver.consumeContinuation({
          organizationId: fixture.organizationId,
          interactionUid: fixture.interactionUid,
        });
        expect(retry).toStrictEqual({ sessionCreated: true });
        expect(await driver.observe()).toMatchObject({
          continuationExists: false,
          sessionMutations: 1,
        });
      });
    });
  });
}
