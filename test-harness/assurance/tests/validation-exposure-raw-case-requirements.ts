import type {
  RawRequestRequirement,
  ValidationExposureControl,
  ValidationExposureRawCase,
} from './validation-exposure-case-model.js';
import {
  validationExposureForbiddenFields,
  validationExposureRequiredLogFields,
  validationExposureRequirementVersion,
} from './validation-exposure-case-model.js';

const authorizationHeader = { authorization: 'Bearer {synthetic-full-authority-token}' } as const;
const jsonHeaders = { ...authorizationHeader, 'content-type': 'application/json' } as const;

function rawRequest(
  method: string,
  path: string,
  body: string | null,
  headers: Readonly<Record<string, string>> = jsonHeaders,
  bodyByteLength?: number | 'configured-limit-plus-one',
): RawRequestRequirement {
  return {
    transport: 'raw-http',
    method,
    path,
    headers,
    body,
    ...(bodyByteLength === undefined ? {} : { bodyByteLength }),
    clientNormalization: 'forbidden',
  };
}

function control(
  id: string,
  request: RawRequestRequirement,
  expectedStatus: number,
  ...requiredObservations: readonly string[]
): ValidationExposureControl {
  return {
    id,
    request,
    proxyTrust: 'not-applicable',
    expectedResult: 'accepted-control',
    expectedStatus,
    requiredObservations,
  };
}

function rawCase(
  value: Omit<ValidationExposureRawCase, 'schemaVersion' | 'requirementVersion' | 'evidenceStatus'>,
): ValidationExposureRawCase {
  return {
    schemaVersion: 1,
    requirementVersion: validationExposureRequirementVersion,
    ...value,
    evidenceStatus: 'specification-only',
  };
}

const writeControl = control(
  'control-alpha-user-update',
  rawRequest(
    'PUT',
    '/api/admin/organizations/{alphaOrgId}/users/{alphaUserId}',
    '{"name":"Assurance Control"}',
  ),
  200,
  'authorized-handler-reached',
  'alpha-user-name-updated-once',
);

const listControl = control(
  'control-alpha-user-list',
  rawRequest('GET', '/api/admin/organizations/{alphaOrgId}/users?search=Assurance', null, {
    ...authorizationHeader,
    accept: 'application/json',
  }),
  200,
  'authorized-handler-reached',
  'response-is-alpha-scoped-user-list',
);

const redirectControl = control(
  'control-authorize-exact-redirect',
  rawRequest(
    'GET',
    '/alpha/authorize?client_id={alphaClientId}&redirect_uri=https%3A%2F%2Fapp-harness.ci.portaidentity.com%2Fcallback&response_type=code&scope=openid&code_challenge={validS256Challenge}&code_challenge_method=S256',
    null,
    { accept: 'text/html' },
  ),
  303,
  'authorization-interaction-created',
  'redirect-target-is-the-exact-registered-uri',
);

const standardState = [
  'target-fingerprint-after-equals-before',
  'target-cardinality-after-equals-before',
];
const standardEffects = [
  'database-query-semantics-altered',
  'payload-executed-or-rendered',
  'global-prototype-polluted',
  'process-or-filesystem-command-executed',
  'cross-tenant-read-or-write',
  'secret-or-internal-detail-disclosed',
];
const standardRecovery = ['the-exact-positive-control-succeeds-after-the-negative-probe'];

/** Immutable raw-input cases covering injection, parser, proxy, and tenant-boundary variants. */
export const validationExposureRawCases: readonly ValidationExposureRawCase[] = [
  rawCase({
    id: 'st52-sql-query-value',
    sentinelId: 'ST-52',
    claimIds: ['CLAIM-R5-08', 'CLAIM-R5-10'],
    family: 'sql-injection',
    executionProfiles: ['operational'],
    proxyTrust: 'not-applicable',
    harnessArrangement: 'none',
    actor: 'authenticated-alpha-principal',
    asset: 'alpha-user-query-scope',
    entryPoint: 'admin-user-list-search-query',
    trustBoundary: 'raw-query-value-to-parameterized-database-query',
    abuseCase: 'synthetic quote and boolean expression alters query semantics',
    control: listControl,
    request: rawRequest(
      'GET',
      '/api/admin/organizations/{alphaOrgId}/users?search=synthetic%27%20OR%20%271%27%3D%271',
      null,
      { ...authorizationHeader, accept: 'application/json' },
    ),
    expected: {
      result: 'validation-rejected',
      status: 400,
      bodyContract: 'generic-validation-error-without-query-or-database-detail',
      headerContract: ['application-json-content-type'],
    },
    independentStateObservations: standardState,
    prohibitedSideEffects: standardEffects,
    requiredLogFields: validationExposureRequiredLogFields,
    forbiddenLogFields: validationExposureForbiddenFields,
    recoveryExpectations: standardRecovery,
    referenceIds: ['rd-05-r5.8', 'rd-05-r5.11', 'asvs-5.0.0-1.2.4', 'asvs-5.0.0-16.3.3'],
  }),
  rawCase({
    id: 'st52-header-crlf',
    sentinelId: 'ST-52',
    claimIds: ['CLAIM-R5-08'],
    family: 'header-crlf',
    executionProfiles: ['operational'],
    proxyTrust: 'not-applicable',
    harnessArrangement: 'none',
    actor: 'authenticated-alpha-principal',
    asset: 'response-header-integrity',
    entryPoint: 'raw-correlation-header',
    trustBoundary: 'raw-header-octets-to-http-parser-and-response-metadata',
    abuseCase: 'carriage-return and line-feed attempt response-header injection',
    control: listControl,
    request: rawRequest('GET', '/api/admin/organizations/{alphaOrgId}/users', null, {
      ...authorizationHeader,
      'x-request-id': 'synthetic\r\nX-Assurance-Injected: true',
    }),
    expected: {
      result: 'validation-rejected',
      status: 400,
      bodyContract: 'generic-bad-request-without-raw-header-echo',
      headerContract: ['x-assurance-injected-absent'],
    },
    independentStateObservations: standardState,
    prohibitedSideEffects: [...standardEffects, 'injected-response-header-emitted'],
    requiredLogFields: validationExposureRequiredLogFields,
    forbiddenLogFields: validationExposureForbiddenFields,
    recoveryExpectations: standardRecovery,
    referenceIds: ['rd-05-r5.8', 'rd-05-r5.11', 'asvs-5.0.0-4.2.4'],
  }),
  ...(['xss-template', 'prototype-pollution', 'command-injection'] as const).map((family) => {
    const bodies = {
      'xss-template': '{"name":"<script>globalThis.__assurance_xss=true</script>{{7*7}}"}',
      'prototype-pollution': '{"name":"Assurance","__proto__":{"assurancePolluted":true}}',
      'command-injection': '{"name":"Assurance; printf synthetic-command-marker"}',
    } as const;
    const references = {
      'xss-template': ['asvs-5.0.0-1.2.1', 'asvs-5.0.0-1.2.3'],
      'prototype-pollution': ['asvs-5.0.0-15.3.6'],
      'command-injection': ['asvs-5.0.0-1.2.5'],
    } as const;
    return rawCase({
      id: `st52-${family}`,
      sentinelId: 'ST-52',
      claimIds: ['CLAIM-R5-08', 'CLAIM-R5-10'],
      family,
      executionProfiles: ['operational'],
      proxyTrust: 'not-applicable',
      harnessArrangement: 'none',
      actor: 'authenticated-alpha-principal',
      asset: 'alpha-user-and-process-integrity',
      entryPoint: 'admin-user-update-json',
      trustBoundary: 'raw-json-string-to-validation-and-persistence',
      abuseCase: `${family} payload reaches a dynamic interpreter or unsafe object merge`,
      control: writeControl,
      request: rawRequest(
        'PUT',
        '/api/admin/organizations/{alphaOrgId}/users/{alphaUserId}',
        bodies[family],
      ),
      expected: {
        result: 'validation-rejected',
        status: 400,
        bodyContract: 'generic-validation-error-without-payload-reflection',
        headerContract: ['application-json-content-type'],
      },
      independentStateObservations: standardState,
      prohibitedSideEffects: standardEffects,
      requiredLogFields: validationExposureRequiredLogFields,
      forbiddenLogFields: validationExposureForbiddenFields,
      recoveryExpectations: standardRecovery,
      referenceIds: ['rd-05-r5.8', 'rd-05-r5.11', ...references[family]],
    });
  }),
  rawCase({
    id: 'st52-path-traversal',
    sentinelId: 'ST-52',
    claimIds: ['CLAIM-R5-08'],
    family: 'path-traversal',
    executionProfiles: ['operational'],
    proxyTrust: 'not-applicable',
    harnessArrangement: 'none',
    actor: 'authenticated-alpha-principal',
    asset: 'branding-template-path-boundary',
    entryPoint: 'admin-branding-type-path',
    trustBoundary: 'raw-encoded-path-segment-to-template-or-file-selection',
    abuseCase: 'encoded parent traversal escapes the approved branding type',
    control: control(
      'control-alpha-branding-read',
      rawRequest(
        'GET',
        '/api/admin/organizations/{alphaOrgId}/branding/login',
        null,
        authorizationHeader,
      ),
      200,
      'authorized-handler-reached',
    ),
    request: rawRequest(
      'GET',
      '/api/admin/organizations/{alphaOrgId}/branding/%2e%2e%2f%2e%2e%2fsynthetic-outside',
      null,
      authorizationHeader,
    ),
    expected: {
      result: 'validation-rejected',
      status: 400,
      bodyContract: 'generic-validation-error-without-filesystem-path',
      headerContract: ['application-json-content-type'],
    },
    independentStateObservations: standardState,
    prohibitedSideEffects: standardEffects,
    requiredLogFields: validationExposureRequiredLogFields,
    forbiddenLogFields: validationExposureForbiddenFields,
    recoveryExpectations: standardRecovery,
    referenceIds: ['rd-05-r5.8', 'rd-05-r5.11', 'asvs-5.0.0-5.3.2'],
  }),
  rawCase({
    id: 'st52-unregistered-redirect',
    sentinelId: 'ST-52',
    claimIds: ['CLAIM-R5-08'],
    family: 'redirect-manipulation',
    executionProfiles: ['operational'],
    proxyTrust: 'not-applicable',
    harnessArrangement: 'none',
    actor: 'unauthenticated-remote-attacker',
    asset: 'authorization-response-and-code',
    entryPoint: 'raw-authorization-request',
    trustBoundary: 'raw-redirect-uri-to-registered-client-redirect-policy',
    abuseCase: 'attacker origin is substituted for the exact registered redirect',
    control: redirectControl,
    request: rawRequest(
      'GET',
      '/alpha/authorize?client_id={alphaClientId}&redirect_uri=https%3A%2F%2Fattacker.invalid%2Fcallback&response_type=code&scope=openid&code_challenge={validS256Challenge}&code_challenge_method=S256',
      null,
      { accept: 'text/html' },
    ),
    expected: {
      result: 'validation-rejected',
      status: 400,
      bodyContract: 'generic-invalid-authorization-request',
      headerContract: ['location-header-absent'],
    },
    independentStateObservations: ['authorization-code-count-after-equals-before'],
    prohibitedSideEffects: [
      'authorization-code-issued',
      'attacker-redirect-followed',
      'internal-detail-disclosed',
    ],
    requiredLogFields: validationExposureRequiredLogFields,
    forbiddenLogFields: validationExposureForbiddenFields,
    recoveryExpectations: ['the-exact-registered-redirect-control-remains-valid'],
    referenceIds: ['rd-05-r5.8', 'rd-05-r5.11', 'asvs-5.0.0-3.7.2'],
  }),
  rawCase({
    id: 'st52-cross-tenant-slug-and-id',
    sentinelId: 'ST-52',
    claimIds: ['CLAIM-R5-08'],
    family: 'slug-tenant-substitution',
    executionProfiles: ['operational'],
    proxyTrust: 'not-applicable',
    harnessArrangement: 'none',
    actor: 'authenticated-alpha-principal',
    asset: 'bravo-user',
    entryPoint: 'admin-user-update-path',
    trustBoundary: 'alpha-organization-path-to-bravo-owned-user-id',
    abuseCase: 'bravo user identifier is submitted beneath the alpha organization path',
    control: writeControl,
    request: rawRequest(
      'PUT',
      '/api/admin/organizations/{alphaOrgId}/users/{bravoUserId}',
      '{"name":"Cross Tenant Attempt"}',
    ),
    expected: {
      result: 'not-found',
      status: 404,
      bodyContract: 'generic-resource-not-found-without-tenant-existence-disclosure',
      headerContract: ['application-json-content-type'],
    },
    independentStateObservations: [
      'bravo-target-fingerprint-after-equals-before',
      'bravo-user-count-after-equals-before',
    ],
    prohibitedSideEffects: [
      'bravo-user-read-or-write',
      'bravo-tenant-existence-disclosed',
      'audit-attributed-to-wrong-tenant',
    ],
    requiredLogFields: validationExposureRequiredLogFields,
    forbiddenLogFields: validationExposureForbiddenFields,
    recoveryExpectations: ['the-same-alpha-user-update-control-remains-authorized'],
    referenceIds: ['rd-05-r5.8', 'rd-05-r5.11', 'asvs-5.0.0-2.2.2'],
  }),
  ...(['forwarded-host', 'forwarded-proto', 'forwarded-client-ip'] as const).map((family) => {
    const trustedHeaders = {
      'forwarded-host': { 'x-forwarded-host': 'porta-harness.ci.portaidentity.com' },
      'forwarded-proto': { 'x-forwarded-proto': 'https' },
      'forwarded-client-ip': { 'x-forwarded-for': '192.0.2.10' },
    } as const;
    const attackerHeaders = {
      'forwarded-host': { 'x-forwarded-host': 'attacker.invalid' },
      'forwarded-proto': { 'x-forwarded-proto': 'http' },
      'forwarded-client-ip': { 'x-forwarded-for': '198.51.100.77' },
    } as const;
    return rawCase({
      id: `st53-untrusted-${family}`,
      sentinelId: 'ST-53',
      claimIds: ['CLAIM-R5-08', 'CLAIM-R5-10'],
      family,
      executionProfiles: ['operational', 'production-security'],
      proxyTrust: 'untrusted',
      harnessArrangement: 'none',
      actor: 'untrusted-direct-client',
      asset: 'public-origin-secure-cookie-and-rate-limit-identity',
      entryPoint: 'raw-forwarding-header',
      trustBoundary: 'direct-client-controlled-forwarding-header-to-request-context',
      abuseCase: `${family} attempts to override trusted request context`,
      control: {
        ...control(
          `control-trusted-${family}`,
          rawRequest('GET', '/health', null, {
            ...trustedHeaders[family],
            accept: 'application/json',
          }),
          200,
          'request-received-through-approved-proxy',
          `${family}-affects-only-the-approved-context-field`,
        ),
        proxyTrust: 'trusted',
      },
      request: rawRequest('GET', '/health', null, {
        ...attackerHeaders[family],
        accept: 'application/json',
      }),
      expected: {
        result: family === 'forwarded-client-ip' ? 'accepted-control' : 'validation-rejected',
        status: family === 'forwarded-client-ip' ? 200 : 400,
        bodyContract:
          family === 'forwarded-client-ip'
            ? 'normal-health-body-with-direct-peer-rate-limit-identity'
            : 'generic-bad-request-without-attacker-origin',
        headerContract: ['attacker-forwarded-value-not-reflected'],
      },
      independentStateObservations: [
        'configured-public-origin-unchanged',
        'cookie-policy-unchanged',
        'rate-limit-key-uses-direct-peer-not-spoofed-value',
      ],
      prohibitedSideEffects: [
        'attacker-origin-used',
        'secure-cookie-policy-weakened',
        'rate-limit-budget-split-by-spoofed-ip',
      ],
      requiredLogFields: validationExposureRequiredLogFields,
      forbiddenLogFields: validationExposureForbiddenFields,
      recoveryExpectations: ['the-approved-proxy-control-remains-effective'],
      referenceIds: ['rd-05-r5.8', 'rd-05-r5.11', 'asvs-5.0.0-4.1.3', 'asvs-5.0.0-15.3.4'],
    });
  }),
  rawCase({
    id: 'st54-unsupported-method',
    sentinelId: 'ST-54',
    claimIds: ['CLAIM-R5-08'],
    family: 'unsupported-method',
    executionProfiles: ['operational'],
    proxyTrust: 'not-applicable',
    harnessArrangement: 'none',
    actor: 'authenticated-alpha-principal',
    asset: 'route-method-and-alpha-user-state',
    entryPoint: 'admin-user-update-route',
    trustBoundary: 'raw-method-token-to-route-dispatch',
    abuseCase: 'unsupported method attempts to reach a state-changing handler',
    control: writeControl,
    request: rawRequest(
      'TRACE',
      '/api/admin/organizations/{alphaOrgId}/users/{alphaUserId}',
      null,
      authorizationHeader,
    ),
    expected: {
      result: 'method-not-allowed',
      status: 405,
      bodyContract: 'stable-method-not-allowed-without-route-internals',
      headerContract: ['allow-header-lists-only-approved-methods'],
    },
    independentStateObservations: standardState,
    prohibitedSideEffects: [
      'user-mutated',
      'unsupported-handler-dispatched',
      'internal-route-detail-disclosed',
    ],
    requiredLogFields: validationExposureRequiredLogFields,
    forbiddenLogFields: validationExposureForbiddenFields,
    recoveryExpectations: standardRecovery,
    referenceIds: ['rd-05-r5.8', 'rd-05-r5.11', 'asvs-5.0.0-4.1.4'],
  }),
  rawCase({
    id: 'st54-malformed-json',
    sentinelId: 'ST-54',
    claimIds: ['CLAIM-R5-08'],
    family: 'malformed-json',
    executionProfiles: ['operational'],
    proxyTrust: 'not-applicable',
    harnessArrangement: 'none',
    actor: 'authenticated-alpha-principal',
    asset: 'request-parser-and-alpha-user-state',
    entryPoint: 'admin-user-update-json',
    trustBoundary: 'incomplete-json-octets-to-body-parser',
    abuseCase: 'unterminated object triggers parser failure',
    control: writeControl,
    request: rawRequest(
      'PUT',
      '/api/admin/organizations/{alphaOrgId}/users/{alphaUserId}',
      '{"name":',
    ),
    expected: {
      result: 'validation-rejected',
      status: 400,
      bodyContract: 'generic-invalid-json-without-parser-message-or-stack',
      headerContract: ['application-json-content-type'],
    },
    independentStateObservations: standardState,
    prohibitedSideEffects: ['user-mutated', 'parser-stack-disclosed', 'partial-body-retained'],
    requiredLogFields: validationExposureRequiredLogFields,
    forbiddenLogFields: validationExposureForbiddenFields,
    recoveryExpectations: standardRecovery,
    referenceIds: ['rd-05-r5.8', 'rd-05-r5.11', 'asvs-5.0.0-1.5.3', 'asvs-5.0.0-16.5.1'],
  }),
  rawCase({
    id: 'st54-oversized-json',
    sentinelId: 'ST-54',
    claimIds: ['CLAIM-R5-08'],
    family: 'oversized-input',
    executionProfiles: ['operational'],
    proxyTrust: 'not-applicable',
    harnessArrangement: 'none',
    actor: 'authenticated-alpha-principal',
    asset: 'bounded-parser-and-alpha-user-state',
    entryPoint: 'admin-user-update-json',
    trustBoundary: 'configured-body-limit-plus-one-byte-to-body-parser',
    abuseCase: 'request exceeds the configured byte limit by exactly one byte',
    control: writeControl,
    request: rawRequest(
      'PUT',
      '/api/admin/organizations/{alphaOrgId}/users/{alphaUserId}',
      '{generated-json-body-at-configured-limit-plus-one-byte}',
      jsonHeaders,
      'configured-limit-plus-one',
    ),
    expected: {
      result: 'payload-too-large',
      status: 413,
      bodyContract: 'generic-payload-too-large-without-config-or-parser-detail',
      headerContract: ['connection-remains-bounded'],
    },
    independentStateObservations: standardState,
    prohibitedSideEffects: [
      'user-mutated',
      'unbounded-body-retained',
      'configured-limit-value-disclosed',
    ],
    requiredLogFields: validationExposureRequiredLogFields,
    forbiddenLogFields: validationExposureForbiddenFields,
    recoveryExpectations: standardRecovery,
    referenceIds: ['rd-05-r5.8', 'rd-05-r5.11', 'asvs-5.0.0-4.2.5'],
  }),
  rawCase({
    id: 'st54-double-encoded-tenant-path',
    sentinelId: 'ST-54',
    claimIds: ['CLAIM-R5-08'],
    family: 'encoding-casing',
    executionProfiles: ['operational'],
    proxyTrust: 'not-applicable',
    harnessArrangement: 'none',
    actor: 'authenticated-alpha-principal',
    asset: 'tenant-path-canonicalization',
    entryPoint: 'admin-organization-path',
    trustBoundary: 'double-encoded-mixed-case-path-to-tenant-resolution',
    abuseCase: 'double encoding and case variation attempt alternate tenant resolution',
    control: listControl,
    request: rawRequest(
      'GET',
      '/api/admin/organizations/%2562%2572%2561%2576%256F/users',
      null,
      authorizationHeader,
    ),
    expected: {
      result: 'not-found',
      status: 404,
      bodyContract: 'generic-resource-not-found-after-single-canonical-decoding',
      headerContract: ['application-json-content-type'],
    },
    independentStateObservations: ['alpha-and-bravo-target-fingerprints-after-equal-before'],
    prohibitedSideEffects: [
      'alternate-tenant-resolved',
      'cross-tenant-user-list-returned',
      'internal-normalization-detail-disclosed',
    ],
    requiredLogFields: validationExposureRequiredLogFields,
    forbiddenLogFields: validationExposureForbiddenFields,
    recoveryExpectations: standardRecovery,
    referenceIds: ['rd-05-r5.8', 'rd-05-r5.11', 'asvs-5.0.0-1.1.1', 'asvs-5.0.0-1.5.3'],
  }),
];
