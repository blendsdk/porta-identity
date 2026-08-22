import {
  authenticationArtifactExposureEffects,
  functionalResponse,
  humanAuthForbiddenCaseLogFields,
  humanAuthIndependenceRule,
  humanAuthRequiredLogFields,
  humanAuthStep as step,
} from './human-auth-case-requirement-helpers.js';

import type {
  HumanAuthCaseRequirement,
  HumanAuthStepRequirement,
} from './human-auth-cases-contract.js';

type DeliveredArtifact = 'magic-link' | 'password-reset' | 'invitation' | 'email-otp';

interface DeliveredArtifactSteps {
  readonly deliveryControl: HumanAuthStepRequirement;
  readonly consumptionControl: HumanAuthStepRequirement;
  readonly probes: readonly HumanAuthStepRequirement[];
}

/** Defines one complete delivered-artifact control and its exact negative variations. */
function deliveredArtifactSteps(kind: DeliveredArtifact): DeliveredArtifactSteps {
  const action = `consume-${kind}`;
  const controlId = `${kind}-intended-consumption-control`;
  const target = `tenant-bound-${kind}`;
  return {
    deliveryControl: step({
      id: `${kind}-delivery-control`,
      boundary: 'raw-http',
      action: `request-${kind}`,
      target: 'synthetic-mailbox',
      inputs: { recipient: 'intended-synthetic-recipient', tenant: 'alpha' },
      expectedFacts: {
        result: 'generic-response',
        deliveryCount: 1,
        cryptographicallyUnpredictable: true,
        intendedDeliveryOnly: true,
      },
      expectedPublicResponse: functionalResponse(`${kind}-delivery-control`),
    }),
    consumptionControl: step({
      id: controlId,
      boundary: 'synthetic-mailbox',
      action,
      target,
      inputs: {
        recipient: 'intended-synthetic-recipient',
        tenant: 'alpha',
        expiryState: 'inside-configured-boundary',
        use: 'first',
      },
      expectedFacts: {
        result: 'accepted',
        durableEffectCount: 1,
      },
      expectedPublicResponse: functionalResponse(`${kind}-accepted-control`),
    }),
    probes: [
      step({
        id: `${kind}-wrong-recipient`,
        controlId,
        boundary: 'synthetic-mailbox',
        action,
        target,
        inputs: { recipient: 'wrong-synthetic-recipient', tenant: 'alpha', use: 'first' },
        expectedFacts: { result: 'invalid-artifact', durableEffectCount: 0 },
        expectedPublicResponse: functionalResponse(`${kind}-invalid-artifact`),
      }),
      step({
        id: `${kind}-wrong-tenant`,
        controlId,
        boundary: 'synthetic-mailbox',
        action,
        target: `wrong-tenant-${kind}`,
        inputs: { recipient: 'intended-synthetic-recipient', tenant: 'bravo', use: 'first' },
        expectedFacts: { result: 'invalid-artifact', durableEffectCount: 0 },
        expectedPublicResponse: functionalResponse(`${kind}-invalid-artifact`),
      }),
      step({
        id: `${kind}-configured-expiry`,
        controlId,
        boundary: 'synthetic-mailbox',
        action,
        target,
        inputs: { expiryState: 'at-or-after-configured-boundary', use: 'first' },
        expectedFacts: { result: 'expired-artifact', durableEffectCount: 0 },
        expectedPublicResponse: functionalResponse(`${kind}-invalid-artifact`),
      }),
      step({
        id: `${kind}-sequential-replay`,
        controlId,
        boundary: 'synthetic-mailbox',
        action,
        target,
        inputs: { expiryState: 'inside-configured-boundary', use: 'second-sequential' },
        expectedFacts: { result: 'invalid-artifact', durableEffectCount: 0 },
        expectedPublicResponse: functionalResponse(`${kind}-invalid-artifact`),
      }),
      step({
        id: `${kind}-throttled-request`,
        controlId: `${kind}-delivery-control`,
        boundary: 'raw-http',
        action: `request-${kind}`,
        target: 'synthetic-mailbox',
        inputs: { limitState: 'exhausted', limitKeyVariant: 'equivalent-public-input' },
        expectedFacts: { result: 'throttled', durableEffectCount: 0, deliveryCount: 0 },
        expectedPublicResponse: functionalResponse(`${kind}-throttled-rejection`),
      }),
    ],
  };
}

const magicLink = deliveredArtifactSteps('magic-link');
const passwordReset = deliveredArtifactSteps('password-reset');
const invitation = deliveredArtifactSteps('invitation');
const emailOtp = deliveredArtifactSteps('email-otp');

/** Exact delivered-artifact and second-factor cases executed through the stable adapter seam. */
export const humanAuthArtifactCaseRequirements: readonly HumanAuthCaseRequirement[] = [
  {
    sentinelId: 'ST-46',
    profileIds: ['magic-link', 'password-reset', 'invitation'],
    controls: [
      magicLink.deliveryControl,
      magicLink.consumptionControl,
      passwordReset.deliveryControl,
      passwordReset.consumptionControl,
      invitation.deliveryControl,
      invitation.consumptionControl,
    ],
    probes: [...magicLink.probes, ...passwordReset.probes, ...invitation.probes],
    prohibitedSideEffects: [
      'authentication-for-wrong-recipient-or-tenant',
      'password-change-for-wrong-recipient-or-tenant',
      'membership-for-wrong-recipient-or-tenant',
      'second-durable-effect-from-one-artifact',
      'delivery-after-throttle',
      ...authenticationArtifactExposureEffects,
    ],
    protectedStateKeys: [
      'intended-account-state',
      'wrong-recipient-account-state',
      'wrong-tenant-state',
      'membership-and-role-state',
      'artifact-consumption-state',
    ],
    requiredLogEvent: 'delivered-authentication-artifact-rejection',
    requiredLogFields: humanAuthRequiredLogFields,
    forbiddenLogFields: humanAuthForbiddenCaseLogFields,
    recoveryExpectation: 'fresh-valid-artifact-can-be-issued-without-restoring-consumed-artifacts',
    independenceRule: humanAuthIndependenceRule,
  },
  {
    sentinelId: 'ST-47',
    profileIds: ['email-otp'],
    controls: [emailOtp.deliveryControl, emailOtp.consumptionControl],
    probes: emailOtp.probes,
    prohibitedSideEffects: [
      'verification-for-wrong-recipient-or-tenant',
      'second-verification-from-one-otp',
      'delivery-after-throttle',
      ...authenticationArtifactExposureEffects,
    ],
    protectedStateKeys: [
      'intended-account-verification-state',
      'wrong-recipient-account-state',
      'wrong-tenant-state',
      'otp-consumption-state',
    ],
    requiredLogEvent: 'email-otp-rejection',
    requiredLogFields: humanAuthRequiredLogFields,
    forbiddenLogFields: humanAuthForbiddenCaseLogFields,
    recoveryExpectation: 'fresh-otp-does-not-revalidate-the-consumed-or-expired-otp',
    independenceRule: humanAuthIndependenceRule,
  },
  {
    sentinelId: 'ST-48',
    profileIds: ['totp', 'recovery-code'],
    controls: [
      step({
        id: 'valid-totp-control',
        boundary: 'independent-authenticator',
        action: 'submit-valid-totp',
        target: 'tenant-bound-totp-enrollment',
        inputs: {
          account: 'intended-synthetic-account',
          tenant: 'alpha',
          expiryState: 'current-window',
          use: 'first',
        },
        expectedFacts: {
          result: 'accepted',
          secondFactorSatisfied: true,
          cryptographicallyUnpredictable: true,
        },
        expectedPublicResponse: functionalResponse('totp-accepted-control'),
      }),
      step({
        id: 'unused-recovery-code-control',
        boundary: 'browser',
        action: 'consume-recovery-code',
        target: 'intended-account-and-tenant-recovery-code',
        inputs: {
          account: 'intended-synthetic-account',
          tenant: 'alpha',
          expiryState: 'inside-configured-boundary',
          use: 'first',
        },
        expectedFacts: {
          result: 'accepted',
          recoveryCount: 1,
          cryptographicallyUnpredictable: true,
        },
        expectedPublicResponse: functionalResponse('recovery-code-accepted-control'),
      }),
    ],
    probes: [
      ...(['missing', 'invalid', 'wrong-account-or-tenant'] as const).map((variant) =>
        step({
          id: `${variant}-totp`,
          controlId: 'valid-totp-control',
          boundary: 'independent-authenticator',
          action: 'submit-valid-totp',
          target: 'tenant-bound-totp-enrollment',
          inputs: { variant },
          expectedFacts: { result: 'second-factor-required', secondFactorSatisfied: false },
          expectedPublicResponse: functionalResponse('totp-rejection'),
        }),
      ),
      step({
        id: 'expired-totp',
        controlId: 'valid-totp-control',
        boundary: 'independent-authenticator',
        action: 'submit-valid-totp',
        target: 'tenant-bound-totp-enrollment',
        inputs: { expiryState: 'outside-current-window' },
        expectedFacts: { result: 'invalid-totp', secondFactorSatisfied: false },
        expectedPublicResponse: functionalResponse('totp-rejection'),
      }),
      step({
        id: 'sequential-totp-replay',
        controlId: 'valid-totp-control',
        boundary: 'independent-authenticator',
        action: 'submit-valid-totp',
        target: 'tenant-bound-totp-enrollment',
        inputs: { use: 'second-sequential' },
        expectedFacts: { result: 'invalid-totp', secondFactorSatisfied: false },
        expectedPublicResponse: functionalResponse('totp-rejection'),
      }),
      step({
        id: 'totp-verification-throttled',
        controlId: 'valid-totp-control',
        boundary: 'independent-authenticator',
        action: 'submit-valid-totp',
        target: 'tenant-bound-totp-enrollment',
        inputs: { limitState: 'exhausted' },
        expectedFacts: { result: 'throttled', secondFactorSatisfied: false },
        expectedPublicResponse: functionalResponse('totp-throttled-rejection'),
      }),
      ...(['wrong-account-or-tenant', 'expired', 'sequential-replay', 'throttled'] as const).map(
        (variant) =>
          step({
            id: `${variant}-recovery-code`,
            controlId: 'unused-recovery-code-control',
            boundary: 'browser',
            action: 'consume-recovery-code',
            target: 'intended-account-and-tenant-recovery-code',
            inputs: { variant },
            expectedFacts: {
              result: variant === 'throttled' ? 'throttled' : 'invalid-recovery-code',
              recoveryCount: 0,
            },
            expectedPublicResponse: functionalResponse('recovery-code-rejection'),
          }),
      ),
    ],
    prohibitedSideEffects: [
      'protected-session-without-required-second-factor',
      'second-success-from-one-totp',
      'recovery-for-wrong-account-or-tenant',
      'second-recovery-from-one-code',
      'unrelated-recovery-code-consumption',
      ...authenticationArtifactExposureEffects,
    ],
    protectedStateKeys: [
      'second-factor-enforcement-state',
      'wrong-account-state',
      'wrong-tenant-state',
      'unused-recovery-code-set',
    ],
    requiredLogEvent: 'second-factor-rejection',
    requiredLogFields: humanAuthRequiredLogFields,
    forbiddenLogFields: humanAuthForbiddenCaseLogFields,
    recoveryExpectation: 'valid-current-totp-and-unused-recovery-codes-retain-their-exact-state',
    independenceRule: humanAuthIndependenceRule,
  },
];
