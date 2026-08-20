import type {
  RawRequestRequirement,
  ValidationExposureControl,
  ValidationExposureExecutionProfile,
  ValidationExposureRawCase,
} from './validation-exposure-case-model.js';
import {
  validationExposureForbiddenFields,
  validationExposureRequiredLogFields,
  validationExposureRequirementVersion,
} from './validation-exposure-case-model.js';

function request(
  method: string,
  path: string,
  headers: Readonly<Record<string, string>>,
  body: string | null = null,
): RawRequestRequirement {
  return {
    transport: 'raw-http',
    method,
    path,
    headers,
    body,
    clientNormalization: 'forbidden',
  };
}

function control(
  id: string,
  raw: RawRequestRequirement,
  status: number,
  ...observations: readonly string[]
): ValidationExposureControl {
  return {
    id,
    request: raw,
    proxyTrust: 'not-applicable',
    expectedResult: 'accepted-control',
    expectedStatus: status,
    requiredObservations: observations,
  };
}

function productionCase(
  value: Omit<ValidationExposureRawCase, 'schemaVersion' | 'requirementVersion' | 'evidenceStatus'>,
): ValidationExposureRawCase {
  return {
    schemaVersion: 1,
    requirementVersion: validationExposureRequirementVersion,
    ...value,
    evidenceStatus: 'specification-only',
  };
}

const allowedOrigin = 'https://app-harness.ci.portaidentity.com';
const attackerOrigin = 'https://attacker.invalid';
const publicHeaders = { accept: 'application/json' } as const;
const authorizedAdminHeaders = {
  ...publicHeaders,
  authorization: 'Bearer {synthetic-full-authority-token}',
} as const;
const corsControl = control(
  'control-configured-cors-origin',
  request('GET', '/api/admin/organizations', {
    ...authorizedAdminHeaders,
    origin: allowedOrigin,
  }),
  200,
  'access-control-allow-origin-exactly-echoes-the-configured-origin',
  'vary-includes-origin',
);
const productionControl = control(
  'control-production-https-health',
  request('GET', 'https://porta-harness.ci.portaidentity.com/health', publicHeaders),
  200,
  'request-completes-over-tls',
  'response-uses-production-security-profile',
);
const preflightControl = control(
  'control-configured-cors-preflight',
  request('OPTIONS', '/api/admin/organizations/{alphaOrgId}/users', {
    origin: allowedOrigin,
    'access-control-request-method': 'POST',
    'access-control-request-headers': 'content-type',
  }),
  204,
  'configured-preflight-reached',
  'configured-method-and-header-admitted',
);

const standardProductionLogFields = validationExposureRequiredLogFields;

/** Immutable production-security and dependency-exposure cases. */
export const validationExposureProductionCases: readonly ValidationExposureRawCase[] = [
  productionCase({
    id: 'st55-unconfigured-cors-origin',
    sentinelId: 'ST-55',
    claimIds: ['CLAIM-R5-08', 'CLAIM-R5-10'],
    family: 'cors-policy',
    executionProfiles: ['production-security'],
    proxyTrust: 'not-applicable',
    harnessArrangement: 'none',
    actor: 'unauthenticated-remote-attacker',
    asset: 'authenticated-cross-origin-response',
    entryPoint: 'production-cors-simple-request',
    trustBoundary: 'untrusted-browser-origin-to-configured-origin-allowlist',
    abuseCase: 'unconfigured browser origin attempts to read a public response',
    control: corsControl,
    request: request('GET', '/api/admin/organizations', {
      ...authorizedAdminHeaders,
      origin: attackerOrigin,
    }),
    expected: {
      result: 'cors-denied',
      status: 200,
      bodyContract: 'ordinary-endpoint-body-without-origin-dependent-detail',
      headerContract: [
        'access-control-allow-origin-absent',
        'access-control-allow-credentials-absent',
      ],
    },
    independentStateObservations: ['server-state-fingerprint-after-equals-before'],
    prohibitedSideEffects: ['attacker-origin-allowed', 'credentials-authorized-cross-origin'],
    requiredLogFields: standardProductionLogFields,
    forbiddenLogFields: validationExposureForbiddenFields,
    recoveryExpectations: ['the-configured-origin-control-remains-allowed'],
    referenceIds: ['rd-05-r5.8', 'rd-05-r5.10', 'asvs-5.0.0-3.4.2'],
  }),
  productionCase({
    id: 'st55-unconfigured-cors-method-and-header',
    sentinelId: 'ST-55',
    claimIds: ['CLAIM-R5-08', 'CLAIM-R5-10'],
    family: 'cors-policy',
    executionProfiles: ['production-security'],
    proxyTrust: 'not-applicable',
    harnessArrangement: 'none',
    actor: 'unauthenticated-remote-attacker',
    asset: 'state-changing-cross-origin-boundary',
    entryPoint: 'production-cors-preflight',
    trustBoundary: 'untrusted-preflight-method-and-headers-to-configured-cors-policy',
    abuseCase: 'unconfigured method and header attempt preflight admission',
    control: preflightControl,
    request: request('OPTIONS', '/api/admin/organizations/{alphaOrgId}/users', {
      origin: allowedOrigin,
      'access-control-request-method': 'TRACE',
      'access-control-request-headers': 'x-assurance-unconfigured',
    }),
    expected: {
      result: 'cors-denied',
      status: 204,
      bodyContract: 'empty-preflight-body',
      headerContract: [
        'access-control-allow-origin-exactly-echoes-the-configured-origin',
        'access-control-allow-methods-does-not-contain-trace',
        'access-control-allow-headers-does-not-contain-x-assurance-unconfigured',
      ],
    },
    independentStateObservations: ['target-cardinality-after-equals-before'],
    prohibitedSideEffects: [
      'unconfigured-method-admitted',
      'unconfigured-header-admitted',
      'target-mutated',
    ],
    requiredLogFields: standardProductionLogFields,
    forbiddenLogFields: validationExposureForbiddenFields,
    recoveryExpectations: ['the-configured-origin-control-remains-allowed'],
    referenceIds: ['rd-05-r5.8', 'rd-05-r5.10', 'asvs-5.0.0-3.4.2'],
  }),
  productionCase({
    id: 'st55-production-response-policy',
    sentinelId: 'ST-55',
    claimIds: ['CLAIM-R5-08', 'CLAIM-R5-10'],
    family: 'https-cookie-security-headers',
    executionProfiles: ['production-security'],
    proxyTrust: 'not-applicable',
    harnessArrangement: 'none',
    actor: 'unauthenticated-remote-attacker',
    asset: 'browser-transport-content-and-framing-policy',
    entryPoint: 'production-https-response',
    trustBoundary: 'production-origin-response-to-browser-security-enforcement',
    abuseCase: 'missing or weakened production response policy enables downgrade or active content',
    control: productionControl,
    request: productionControl.request,
    expected: {
      result: 'accepted-control',
      status: 200,
      bodyContract: 'stable-health-response-without-product-version',
      headerContract: [
        'strict-transport-security:max-age=31536000; includeSubDomains',
        "content-security-policy:default-src 'none'",
        'x-content-type-options:nosniff',
        'referrer-policy:strict-origin-when-cross-origin',
        'server-version-header-absent',
      ],
    },
    independentStateObservations: [
      'request-completed-on-https-origin',
      'no-production-config-mutated',
    ],
    prohibitedSideEffects: [
      'plaintext-session-created',
      'response-policy-weakened',
      'product-version-disclosed',
    ],
    requiredLogFields: standardProductionLogFields,
    forbiddenLogFields: validationExposureForbiddenFields,
    recoveryExpectations: ['a-second-https-control-has-the-identical-security-header-set'],
    referenceIds: [
      'rd-05-r5.8',
      'rd-05-r5.10',
      'asvs-5.0.0-3.4.1',
      'asvs-5.0.0-3.4.3',
      'asvs-5.0.0-3.4.4',
      'asvs-5.0.0-3.4.5',
      'asvs-5.0.0-3.4.6',
      'asvs-5.0.0-4.1.1',
    ],
  }),
  productionCase({
    id: 'st55-production-html-csp-policy',
    sentinelId: 'ST-55',
    claimIds: ['CLAIM-R5-08', 'CLAIM-R5-10'],
    family: 'https-cookie-security-headers',
    executionProfiles: ['production-security'],
    proxyTrust: 'not-applicable',
    harnessArrangement: 'real-oidc-interaction',
    actor: 'unauthenticated-remote-attacker',
    asset: 'browser-interaction-content-and-framing-policy',
    entryPoint: 'production-html-interaction-response',
    trustBoundary: 'production-html-response-to-browser-security-enforcement',
    abuseCase: 'an interaction page weakens active-content or framing restrictions',
    control: control(
      'control-production-html-interaction',
      request('GET', 'https://porta-harness.ci.portaidentity.com/interaction/{realInteractionId}', {
        accept: 'text/html',
      }),
      200,
      'real-authorization-interaction-created-first',
      'response-content-type-is-html',
    ),
    request: request(
      'GET',
      'https://porta-harness.ci.portaidentity.com/interaction/{realInteractionId}',
      { accept: 'text/html' },
    ),
    expected: {
      result: 'accepted-control',
      status: 200,
      bodyContract: 'real-login-interaction-without-secret-or-product-version',
      headerContract: [
        "content-security-policy-includes:default-src 'none'",
        "content-security-policy-includes:frame-ancestors 'none'",
        'x-frame-options:DENY',
        'server-version-header-absent',
      ],
    },
    independentStateObservations: [
      'interaction-identity-remains-bound-to-the-created-authorization-request',
      'no-production-config-mutated',
    ],
    prohibitedSideEffects: [
      'response-policy-weakened',
      'interaction-secret-disclosed',
      'product-version-disclosed',
    ],
    requiredLogFields: standardProductionLogFields,
    forbiddenLogFields: validationExposureForbiddenFields,
    recoveryExpectations: ['a-second-read-of-the-same-interaction-retains-the-header-policy'],
    referenceIds: ['rd-05-r5.8', 'rd-05-r5.10', 'asvs-5.0.0-3.4.3', 'asvs-5.0.0-3.4.5'],
  }),
  productionCase({
    id: 'st55-production-session-cookie-policy',
    sentinelId: 'ST-55',
    claimIds: ['CLAIM-R5-08', 'CLAIM-R5-10'],
    family: 'https-cookie-security-headers',
    executionProfiles: ['production-security'],
    proxyTrust: 'not-applicable',
    harnessArrangement: 'none',
    actor: 'synthetic-browser-principal',
    asset: 'production-session-cookie',
    entryPoint: 'production-authentication-session-transition',
    trustBoundary: 'authenticated-server-session-to-browser-cookie-jar',
    abuseCase: 'session cookie is issued with a transport, script, site, or sibling-host weakness',
    control: control(
      'control-production-authentication',
      request(
        'POST',
        'https://porta-harness.ci.portaidentity.com/interaction/{uid}/login',
        {
          'content-type': 'application/x-www-form-urlencoded',
        },
        'login={syntheticLogin}&password={syntheticPassword}',
      ),
      303,
      'authenticated-session-created',
    ),
    request: request(
      'POST',
      'https://porta-harness.ci.portaidentity.com/interaction/{uid}/login',
      { 'content-type': 'application/x-www-form-urlencoded' },
      'login={syntheticLogin}&password={syntheticPassword}',
    ),
    expected: {
      result: 'accepted-control',
      status: 303,
      bodyContract: 'empty-redirect-response-without-session-identifier',
      headerContract: [
        'set-cookie-secure',
        'set-cookie-httponly',
        'set-cookie-samesite-declared-production-policy',
        'set-cookie-host-only-without-domain',
      ],
    },
    independentStateObservations: [
      'browser-cookie-metadata-read-independently',
      'session-record-count-is-one',
    ],
    prohibitedSideEffects: [
      'session-cookie-in-response-body',
      'domain-cookie-issued',
      'insecure-cookie-issued',
    ],
    requiredLogFields: standardProductionLogFields,
    forbiddenLogFields: validationExposureForbiddenFields,
    recoveryExpectations: ['logout-invalidates-the-observed-session-cookie'],
    referenceIds: ['rd-05-r5.8', 'rd-05-r5.10', 'asvs-5.0.0-3.4.1'],
  }),
  ...(['operational', 'production-security'] as const).flatMap((executionProfile) =>
    (
      [
        {
          family: 'database-error-exposure',
          arrangement: 'owned-database-unavailable',
          path: '/ready',
          method: 'GET',
          body: null,
          healthyStatus: 200,
          failedStatus: 503,
          result: 'dependency-unavailable',
        },
        {
          family: 'cache-error-exposure',
          arrangement: 'owned-cache-unavailable',
          path: '/alpha/authorize?client_id={alphaClientId}&redirect_uri={registeredRedirect}&response_type=code&scope=openid&code_challenge={validS256Challenge}&code_challenge_method=S256',
          method: 'GET',
          body: null,
          healthyStatus: 303,
          failedStatus: 503,
          result: 'dependency-unavailable',
        },
        {
          family: 'mail-error-exposure',
          arrangement: 'owned-mail-unavailable-with-acquired-csrf-browser',
          path: '/alpha/auth/forgot-password',
          method: 'POST',
          body: 'email={syntheticAlphaEmail}&_csrf={acquiredCsrf}',
          healthyStatus: 200,
          failedStatus: 200,
          result: 'accepted-generic-response',
        },
      ] as const
    ).map((dependency) =>
      productionCase({
        id: `st56-${executionProfile}-${dependency.family}`,
        sentinelId: 'ST-56',
        claimIds: ['CLAIM-R5-02', 'CLAIM-R5-08', 'CLAIM-R5-10'],
        family: dependency.family,
        executionProfiles: [executionProfile] as readonly ValidationExposureExecutionProfile[],
        proxyTrust: 'not-applicable',
        harnessArrangement: dependency.arrangement,
        actor: 'unauthenticated-remote-attacker',
        asset: 'public-error-log-and-dependency-topology-confidentiality',
        entryPoint: `${dependency.family}-public-handler`,
        trustBoundary: 'owned-dependency-failure-to-public-response-and-retained-evidence',
        abuseCase: 'induced dependency failure attempts to disclose internal implementation detail',
        control: control(
          `control-${executionProfile}-${dependency.family}-healthy`,
          request(dependency.method, dependency.path, publicHeaders, dependency.body),
          dependency.healthyStatus,
          'same-handler-reached-with-healthy-owned-dependency',
        ),
        request: request(dependency.method, dependency.path, publicHeaders, dependency.body),
        expected: {
          result: dependency.result,
          status: dependency.failedStatus,
          bodyContract: 'generic-stable-response-without-dependency-or-product-detail',
          headerContract: ['server-version-header-absent', 'internal-debug-headers-absent'],
        },
        independentStateObservations: [
          'protected-state-fingerprint-after-equals-before',
          'no-partial-durable-effect',
        ],
        prohibitedSideEffects: [
          'stack-trace-disclosed',
          'sql-text-disclosed',
          'filesystem-path-disclosed',
          'infrastructure-address-disclosed',
          'secret-or-token-disclosed',
          'package-or-product-version-disclosed',
          'sensitive-dependency-error-retained-in-evidence',
        ],
        requiredLogFields: [
          ...validationExposureRequiredLogFields,
          'dependency-class',
          'recovery-outcome',
        ],
        forbiddenLogFields: validationExposureForbiddenFields,
        recoveryExpectations: [
          'owned-dependency-restored',
          'same-handler-control-succeeds-after-restoration',
          'target-fingerprint-confirms-no-partial-write',
        ],
        referenceIds: [
          'rd-05-r5.2',
          'rd-05-r5.8',
          'rd-05-r5.10',
          'asvs-5.0.0-16.3.3',
          'asvs-5.0.0-16.5.1',
        ],
      }),
    ),
  ),
];
