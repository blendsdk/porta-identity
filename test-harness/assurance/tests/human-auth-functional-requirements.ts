import type {
  HumanAuthFunctionalCaseRequirement,
  HumanAuthFunctionalStepRequirement,
  HumanAuthPublicStateRequirement,
} from './human-auth-functional-contract.js';

function state(
  id: string,
  channel: HumanAuthPublicStateRequirement['channel'],
  expected: HumanAuthPublicStateRequirement['expected'],
): HumanAuthPublicStateRequirement {
  return Object.freeze({ id, channel, expected: Object.freeze(expected) });
}

function step(value: HumanAuthFunctionalStepRequirement): HumanAuthFunctionalStepRequirement {
  return Object.freeze({
    ...value,
    setupControlIds: Object.freeze(value.setupControlIds),
    response: Object.freeze(value.response),
    publicState: Object.freeze(value.publicState),
  });
}

const fixturePrerequisite = Object.freeze({
  id: 'two-tenant-human-auth-fixture',
  kind: 'fixture' as const,
  failurePolicy: 'fatal-invalid-evidence' as const,
  requiredCapabilities: Object.freeze([
    'active-account',
    'locked-account',
    'enabled-and-disabled-login-policies',
    'active-expired-and-revocable-sessions',
  ]),
});

const emailPrerequisite = Object.freeze({
  id: 'synthetic-mailbox-ready-empty-and-pollable',
  kind: 'email' as const,
  failurePolicy: 'fatal-invalid-evidence' as const,
  requiredCapabilities: Object.freeze([
    'mailhog-health',
    'fatal-clear',
    'fatal-delivery-poll',
    'recipient-specific-cardinality',
  ]),
});

const loginAcceptedState = [
  state('callback-code-issued', 'authorization-callback', { codePresent: true }),
  state('spa-authenticated', 'spa-authentication-status', { authenticated: true }),
] as const;

const loginRejectedState = [
  state('callback-code-absent', 'authorization-callback', { codePresent: false }),
  state('spa-remains-anonymous', 'spa-authentication-status', { authenticated: false }),
] as const;

const st42Controls = [
  step({
    id: 'existing-valid-login-control',
    kind: 'control',
    controlId: null,
    setupControlIds: [],
    boundary: 'raw-http',
    action: 'submit-password-login',
    target: 'alpha-active-account',
    variation: 'existing-valid-credentials',
    response: {
      status: 'redirect',
      bodySchemaId: 'authorization-callback',
      headerSetId: 'redirect',
    },
    publicState: loginAcceptedState,
  }),
  step({
    id: 'existing-recovery-control',
    kind: 'control',
    controlId: null,
    setupControlIds: [],
    boundary: 'raw-http',
    action: 'request-password-recovery',
    target: 'alpha-recovery-form',
    variation: 'existing-recipient',
    response: { status: 200, bodySchemaId: 'generic-recovery', headerSetId: 'recovery-public' },
    publicState: [
      state('intended-mailbox-delivery', 'synthetic-mailbox-cardinality', { deliveryDelta: 1 }),
    ],
  }),
] as const;

const st43Controls = [
  step({
    id: 'enabled-password-control',
    kind: 'control',
    controlId: null,
    setupControlIds: [],
    boundary: 'raw-http',
    action: 'submit-password-login',
    target: 'alpha-policy-account',
    variation: 'password-enabled-valid',
    response: {
      status: 'redirect',
      bodySchemaId: 'authorization-callback',
      headerSetId: 'redirect',
    },
    publicState: loginAcceptedState,
  }),
  step({
    id: 'enabled-passwordless-control',
    kind: 'control',
    controlId: null,
    setupControlIds: [],
    boundary: 'raw-http',
    action: 'request-passwordless-login',
    target: 'alpha-policy-account',
    variation: 'passwordless-enabled-existing-recipient',
    response: { status: 200, bodySchemaId: 'generic-delivery', headerSetId: 'passwordless-public' },
    publicState: [
      state('enabled-method-delivery', 'synthetic-mailbox-cardinality', { deliveryDelta: 1 }),
    ],
  }),
] as const;

/** Exact functional black-box cases executed later through the retained harness. */
export const humanAuthFunctionalCaseRequirements: readonly HumanAuthFunctionalCaseRequirement[] =
  Object.freeze([
    Object.freeze({
      sentinelId: 'ST-42',
      profileIds: Object.freeze(['functional-enumeration']),
      prerequisites: Object.freeze([fixturePrerequisite, emailPrerequisite]),
      controls: Object.freeze(st42Controls),
      negatives: Object.freeze([
        step({
          id: 'existing-invalid-login',
          kind: 'negative',
          controlId: 'existing-valid-login-control',
          setupControlIds: [],
          boundary: 'raw-http',
          action: 'submit-password-login',
          target: 'alpha-active-account',
          variation: 'existing-invalid-password',
          response: {
            status: 200,
            bodySchemaId: 'generic-login-rejection',
            headerSetId: 'login-public',
          },
          publicState: loginRejectedState,
        }),
        step({
          id: 'absent-invalid-login',
          kind: 'negative',
          controlId: 'existing-valid-login-control',
          setupControlIds: [],
          boundary: 'raw-http',
          action: 'submit-password-login',
          target: 'alpha-active-account',
          variation: 'absent-identity-invalid-password',
          response: {
            status: 200,
            bodySchemaId: 'generic-login-rejection',
            headerSetId: 'login-public',
          },
          publicState: loginRejectedState,
        }),
        step({
          id: 'absent-recovery-request',
          kind: 'negative',
          controlId: 'existing-recovery-control',
          setupControlIds: [],
          boundary: 'raw-http',
          action: 'request-password-recovery',
          target: 'alpha-recovery-form',
          variation: 'absent-recipient',
          response: {
            status: 200,
            bodySchemaId: 'generic-recovery',
            headerSetId: 'recovery-public',
          },
          publicState: [
            state('absent-mailbox-nondelivery', 'synthetic-mailbox-cardinality', {
              deliveryDelta: 0,
            }),
          ],
        }),
      ]),
    }),
    Object.freeze({
      sentinelId: 'ST-43',
      profileIds: Object.freeze(['login-method-enforcement', 'failed-login-lockout-rate-limit']),
      prerequisites: Object.freeze([fixturePrerequisite, emailPrerequisite]),
      controls: Object.freeze(st43Controls),
      negatives: Object.freeze([
        step({
          id: 'disabled-password-login',
          kind: 'negative',
          controlId: 'enabled-password-control',
          setupControlIds: [],
          boundary: 'raw-http',
          action: 'submit-password-login',
          target: 'alpha-policy-account',
          variation: 'password-disabled-valid-credential',
          response: { status: 200, bodySchemaId: 'method-disabled', headerSetId: 'login-public' },
          publicState: loginRejectedState,
        }),
        step({
          id: 'disabled-passwordless-login',
          kind: 'negative',
          controlId: 'enabled-passwordless-control',
          setupControlIds: [],
          boundary: 'raw-http',
          action: 'request-passwordless-login',
          target: 'alpha-policy-account',
          variation: 'passwordless-disabled-existing-recipient',
          response: {
            status: 200,
            bodySchemaId: 'method-disabled',
            headerSetId: 'passwordless-public',
          },
          publicState: [
            state('disabled-method-nondelivery', 'synthetic-mailbox-cardinality', {
              deliveryDelta: 0,
            }),
          ],
        }),
        step({
          id: 'failed-login-tracking',
          kind: 'negative',
          controlId: 'enabled-password-control',
          setupControlIds: [],
          boundary: 'raw-http',
          action: 'submit-password-login',
          target: 'alpha-policy-account',
          variation: 'configured-failure-threshold-minus-one-then-final-failure',
          response: {
            status: 200,
            bodySchemaId: 'generic-login-rejection',
            headerSetId: 'login-public',
          },
          publicState: [
            state('subsequent-valid-login-locked', 'authorization-callback', {
              codePresent: false,
              submittedCredential: 'valid',
            }),
          ],
        }),
        step({
          id: 'prelocked-account-login',
          kind: 'negative',
          controlId: 'enabled-password-control',
          setupControlIds: [],
          boundary: 'raw-http',
          action: 'submit-password-login',
          target: 'alpha-policy-account',
          variation: 'locked-account-valid-password',
          response: {
            status: 200,
            bodySchemaId: 'generic-login-rejection',
            headerSetId: 'login-public',
          },
          publicState: loginRejectedState,
        }),
        step({
          id: 'equivalent-key-rate-limit',
          kind: 'negative',
          controlId: 'enabled-password-control',
          setupControlIds: [],
          boundary: 'raw-http',
          action: 'submit-password-login',
          target: 'alpha-policy-account',
          variation: 'split-configured-budget-across-equivalent-public-inputs',
          response: { status: 429, bodySchemaId: 'public-throttled', headerSetId: 'retry-after' },
          publicState: loginRejectedState,
        }),
      ]),
    }),
    Object.freeze({
      sentinelId: 'ST-44',
      profileIds: Object.freeze(['session-lifecycle']),
      prerequisites: Object.freeze([fixturePrerequisite]),
      controls: Object.freeze([
        step({
          id: 'anonymous-authentication-renewal-control',
          kind: 'control',
          controlId: null,
          setupControlIds: [],
          boundary: 'browser',
          action: 'authenticate-session',
          target: 'alpha-browser-session',
          variation: 'anonymous-to-authenticated',
          response: {
            status: 'redirect',
            bodySchemaId: 'authorization-callback',
            headerSetId: 'redirect',
          },
          publicState: [
            state('session-cookie-renewed', 'browser-cookie-identity', {
              anonymousAbsentOrAuthenticatedDiffers: true,
            }),
            state('authenticated-resource-allowed', 'protected-resource-response', {
              accessAllowed: true,
            }),
          ],
        }),
        step({
          id: 'active-session-control',
          kind: 'control',
          controlId: null,
          setupControlIds: ['anonymous-authentication-renewal-control'],
          boundary: 'browser',
          action: 'use-session',
          target: 'alpha-browser-session',
          variation: 'active-authenticated',
          response: {
            status: 'redirect',
            bodySchemaId: 'authorization-callback',
            headerSetId: 'redirect',
          },
          publicState: [
            state('active-resource-allowed', 'protected-resource-response', {
              accessAllowed: true,
            }),
          ],
        }),
        step({
          id: 'public-logout-control',
          kind: 'control',
          controlId: null,
          setupControlIds: ['active-session-control'],
          boundary: 'browser',
          action: 'logout-session',
          target: 'alpha-browser-session',
          variation: 'valid-end-session',
          response: {
            status: 'redirect',
            bodySchemaId: 'logged-out-client',
            headerSetId: 'redirect',
          },
          publicState: [
            state('client-reports-logged-out', 'spa-authentication-status', {
              authenticated: false,
            }),
          ],
        }),
        step({
          id: 'authorized-session-revoke-control',
          kind: 'control',
          controlId: null,
          setupControlIds: ['active-session-control'],
          boundary: 'raw-http',
          action: 'revoke-session',
          target: 'alpha-browser-session',
          variation: 'authorized-admin-revocation',
          response: { status: 204, bodySchemaId: 'empty', headerSetId: 'admin-public' },
          publicState: [
            state('revocation-confirmed', 'admin-api-resource-state', { sessionListed: false }),
          ],
        }),
      ]),
      negatives: Object.freeze([
        step({
          id: 'expired-session-reuse',
          kind: 'negative',
          controlId: 'active-session-control',
          setupControlIds: [],
          boundary: 'browser',
          action: 'use-session',
          target: 'alpha-browser-session',
          variation: 'expired',
          response: {
            status: 'redirect',
            bodySchemaId: 'authorization-error',
            headerSetId: 'redirect',
          },
          publicState: [
            state('expired-authorization-denied', 'authorization-callback', {
              codePresent: false,
            }),
            state('expired-session-inactive', 'admin-api-resource-state', {
              sessionListed: false,
            }),
          ],
        }),
        step({
          id: 'logged-out-session-reuse',
          kind: 'negative',
          controlId: 'active-session-control',
          setupControlIds: ['public-logout-control'],
          boundary: 'browser',
          action: 'use-session',
          target: 'alpha-browser-session',
          variation: 'logged-out',
          response: {
            status: 'redirect',
            bodySchemaId: 'authorization-error',
            headerSetId: 'redirect',
          },
          publicState: [
            state('logged-out-authorization-denied', 'authorization-callback', {
              codePresent: false,
            }),
            state('logged-out-client-anonymous', 'spa-authentication-status', {
              authenticated: false,
            }),
          ],
        }),
        step({
          id: 'revoked-session-reuse',
          kind: 'negative',
          controlId: 'active-session-control',
          setupControlIds: ['authorized-session-revoke-control'],
          boundary: 'browser',
          action: 'use-session',
          target: 'alpha-browser-session',
          variation: 'revoked',
          response: {
            status: 'redirect',
            bodySchemaId: 'authorization-error',
            headerSetId: 'redirect',
          },
          publicState: [
            state('revoked-authorization-denied', 'authorization-callback', {
              codePresent: false,
            }),
            state('revoked-session-inactive', 'admin-api-resource-state', {
              sessionListed: false,
            }),
          ],
        }),
      ]),
    }),
  ]);
