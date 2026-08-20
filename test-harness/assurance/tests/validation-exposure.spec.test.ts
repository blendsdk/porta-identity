import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validationExposureCatalogVersion,
  validationExposureForbiddenFields,
  validationExposureRequiredLogFields,
  validationExposureRequirementVersion,
  type ValidationExposureFamily,
  type ValidationExposureSentinelId,
} from './validation-exposure-case-model.js';
import { validationExposureProductionCases } from './validation-exposure-production-case-requirements.js';
import { validationExposureRawCases } from './validation-exposure-raw-case-requirements.js';
import {
  validationExposureReferences,
  validationExposureSliceProfiles,
} from './validation-exposure-slice-requirements.js';

const exactSentinels: readonly ValidationExposureSentinelId[] = [
  'ST-52',
  'ST-53',
  'ST-54',
  'ST-55',
  'ST-56',
];

const exactFamilies: readonly ValidationExposureFamily[] = [
  'sql-injection',
  'header-crlf',
  'xss-template',
  'prototype-pollution',
  'command-injection',
  'path-traversal',
  'redirect-manipulation',
  'slug-tenant-substitution',
  'forwarded-host',
  'forwarded-proto',
  'forwarded-client-ip',
  'unsupported-method',
  'malformed-json',
  'oversized-input',
  'encoding-casing',
  'cors-policy',
  'https-cookie-security-headers',
  'database-error-exposure',
  'cache-error-exposure',
  'mail-error-exposure',
];

const allCases = [...validationExposureRawCases, ...validationExposureProductionCases];

test('defines one versioned complete profile for every validation and exposure sentinel', () => {
  assert.equal(validationExposureCatalogVersion, 1);
  assert.equal(validationExposureRequirementVersion, '2026-08-20');
  assert.deepEqual(
    validationExposureSliceProfiles.map((profile) => profile.sentinelId),
    exactSentinels,
  );

  for (const profile of validationExposureSliceProfiles) {
    assert.equal(profile.schemaVersion, 1, profile.sentinelId);
    assert.equal(profile.profileVersion, validationExposureRequirementVersion, profile.sentinelId);
    for (const [field, values] of Object.entries(profile)) {
      if (Array.isArray(values)) {
        assert.ok(values.length > 0, `${profile.sentinelId}: ${field}`);
        assert.ok(
          values.every((value) => typeof value === 'string' && value.length > 0),
          `${profile.sentinelId}: ${field} contains an empty value`,
        );
      }
    }
  }
});

test('covers the exact raw attack families without orphan cases or sources', () => {
  assert.deepEqual(
    [...new Set(allCases.map((entry) => entry.family))].sort(),
    [...exactFamilies].sort(),
  );
  assert.equal(new Set(allCases.map((entry) => entry.id)).size, allCases.length);

  const sentinels = new Set(exactSentinels);
  const references = new Set(validationExposureReferences.map((reference) => reference.id));
  for (const entry of allCases) {
    assert.ok(sentinels.has(entry.sentinelId), `${entry.id}: orphan sentinel`);
    assert.ok(entry.referenceIds.length > 0, `${entry.id}: references`);
    assert.ok(
      entry.referenceIds.every((id) => references.has(id)),
      `${entry.id}: orphan reference`,
    );
  }
  for (const profile of validationExposureSliceProfiles) {
    assert.ok(allCases.some((entry) => entry.sentinelId === profile.sentinelId));
    assert.ok(
      profile.referenceIds.every((id) => references.has(id)),
      `${profile.sentinelId}: orphan profile reference`,
    );
  }
});

test('keeps every malicious input as raw request data behind a reachable control', () => {
  for (const entry of allCases) {
    assert.equal(entry.schemaVersion, 1, entry.id);
    assert.equal(entry.requirementVersion, validationExposureRequirementVersion, entry.id);
    assert.equal(entry.evidenceStatus, 'specification-only', entry.id);
    assert.equal(entry.request.transport, 'raw-http', entry.id);
    assert.equal(entry.request.clientNormalization, 'forbidden', entry.id);
    assert.ok(entry.request.method.length > 0, `${entry.id}: method`);
    assert.ok(entry.request.path.length > 0, `${entry.id}: path`);
    assert.equal(entry.control.request.transport, 'raw-http', entry.id);
    assert.equal(entry.control.request.clientNormalization, 'forbidden', entry.id);
    assert.ok(entry.control.proxyTrust.length > 0, `${entry.id}: control proxy profile`);
    assert.equal(entry.control.expectedResult, 'accepted-control', entry.id);
    assert.ok(
      entry.control.requiredObservations.includes('authorized-handler-reached') ||
        entry.control.requiredObservations.some((value) =>
          /reached|created|tls|origin|proxy|session/.test(value),
        ),
      `${entry.id}: control must prove reachability`,
    );
    assert.ok(entry.entryPoint.length > 0, `${entry.id}: semantic handler`);
    assert.ok(entry.expected.status >= 200 && entry.expected.status <= 599, entry.id);
    assert.ok(entry.expected.bodyContract.length > 0, `${entry.id}: body contract`);
    assert.ok(entry.expected.headerContract.length > 0, `${entry.id}: header contract`);
  }
});

test('requires independent non-effects, privacy-safe logs, and recovery for every probe', () => {
  for (const entry of allCases) {
    assert.ok(entry.independentStateObservations.length > 0, `${entry.id}: independent state`);
    assert.ok(entry.prohibitedSideEffects.length > 0, `${entry.id}: prohibited effects`);
    assert.ok(entry.recoveryExpectations.length > 0, `${entry.id}: recovery`);
    assert.ok(
      validationExposureRequiredLogFields.every((field) => entry.requiredLogFields.includes(field)),
      `${entry.id}: required log fields`,
    );
    assert.ok(
      validationExposureForbiddenFields.every((field) => entry.forbiddenLogFields.includes(field)),
      `${entry.id}: forbidden log fields`,
    );
  }
});

test('freezes tenant, proxy, parser, and production-security outcomes exactly', () => {
  const byId = new Map(allCases.map((entry) => [entry.id, entry] as const));

  assert.deepEqual(byId.get('st52-cross-tenant-slug-and-id')?.expected, {
    result: 'not-found',
    status: 404,
    bodyContract: 'generic-resource-not-found-without-tenant-existence-disclosure',
    headerContract: ['application-json-content-type'],
  });
  assert.equal(byId.get('st54-unsupported-method')?.expected.status, 405);
  assert.equal(byId.get('st54-malformed-json')?.expected.status, 400);
  assert.equal(byId.get('st54-oversized-json')?.expected.status, 413);
  assert.equal(
    byId.get('st54-oversized-json')?.request.bodyByteLength,
    'configured-limit-plus-one',
  );

  const proxyCases = allCases.filter((entry) => entry.sentinelId === 'ST-53');
  assert.equal(proxyCases.length, 3);
  assert.ok(proxyCases.every((entry) => entry.proxyTrust === 'untrusted'));
  assert.ok(proxyCases.every((entry) => entry.control.proxyTrust === 'trusted'));
  assert.ok(
    proxyCases.every((entry) =>
      entry.control.requiredObservations.includes('request-received-through-approved-proxy'),
    ),
  );

  const productionCases = allCases.filter((entry) => entry.sentinelId === 'ST-55');
  assert.ok(
    productionCases.every(
      (entry) =>
        entry.executionProfiles.length === 1 &&
        entry.executionProfiles[0] === 'production-security',
    ),
  );
  const responsePolicy = byId.get('st55-production-response-policy');
  assert.ok(responsePolicy);
  assert.ok(
    [
      'strict-transport-security:max-age=31536000; includeSubDomains',
      "content-security-policy:default-src 'none'",
      'x-content-type-options:nosniff',
      'referrer-policy:strict-origin-when-cross-origin',
      'server-version-header-absent',
    ].every((header) => responsePolicy.expected.headerContract.includes(header)),
  );

  const htmlPolicy = byId.get('st55-production-html-csp-policy');
  assert.ok(htmlPolicy);
  assert.equal(htmlPolicy.harnessArrangement, 'real-oidc-interaction');
  assert.ok(
    [
      "content-security-policy-includes:default-src 'none'",
      "content-security-policy-includes:frame-ancestors 'none'",
      'x-frame-options:DENY',
      'server-version-header-absent',
    ].every((header) => htmlPolicy.expected.headerContract.includes(header)),
  );

  const corsSimple = byId.get('st55-unconfigured-cors-origin');
  assert.equal(corsSimple?.request.path, '/api/admin/organizations');
  assert.equal(corsSimple?.control.request.path, '/api/admin/organizations');

  const corsPreflight = byId.get('st55-unconfigured-cors-method-and-header');
  assert.equal(corsPreflight?.request.headers.origin, 'https://app-harness.ci.portaidentity.com');
  assert.equal(corsPreflight?.request.headers['access-control-request-method'], 'TRACE');
  assert.ok(
    corsPreflight?.expected.headerContract.includes(
      'access-control-allow-methods-does-not-contain-trace',
    ),
  );
});

test('requires safe database, cache, and mail failures in both harness profiles', () => {
  const dependencyCases = allCases.filter((entry) => entry.sentinelId === 'ST-56');
  assert.equal(dependencyCases.length, 6);
  for (const profile of ['operational', 'production-security'] as const) {
    const forProfile = dependencyCases.filter((entry) => entry.executionProfiles.includes(profile));
    assert.deepEqual(forProfile.map((entry) => entry.family).sort(), [
      'cache-error-exposure',
      'database-error-exposure',
      'mail-error-exposure',
    ]);
  }

  const exactExposureEffects = [
    'stack-trace-disclosed',
    'sql-text-disclosed',
    'filesystem-path-disclosed',
    'infrastructure-address-disclosed',
    'secret-or-token-disclosed',
    'package-or-product-version-disclosed',
    'sensitive-dependency-error-retained-in-evidence',
  ];
  for (const entry of dependencyCases) {
    assert.notEqual(entry.harnessArrangement, 'none', entry.id);
    assert.ok(
      exactExposureEffects.every((effect) => entry.prohibitedSideEffects.includes(effect)),
      entry.id,
    );
    assert.ok(entry.requiredLogFields.includes('dependency-class'), entry.id);
    assert.ok(entry.requiredLogFields.includes('recovery-outcome'), entry.id);
    assert.deepEqual(entry.recoveryExpectations, [
      'owned-dependency-restored',
      'same-handler-control-succeeds-after-restoration',
      'target-fingerprint-confirms-no-partial-write',
    ]);
  }

  const mailCases = dependencyCases.filter((entry) => entry.family === 'mail-error-exposure');
  assert.equal(mailCases.length, 2);
  for (const entry of mailCases) {
    assert.equal(entry.harnessArrangement, 'owned-mail-unavailable-with-acquired-csrf-browser');
    assert.equal(entry.request.body, 'email={syntheticAlphaEmail}&_csrf={acquiredCsrf}');
    assert.equal(entry.control.expectedStatus, 200);
    assert.equal(entry.expected.status, 200);
  }
});

test('uses only version-qualified sources and makes no broad certification claim', () => {
  assert.ok(
    validationExposureReferences.every(
      (reference) => reference.version.length > 0 && reference.sectionOrControl.length > 0,
    ),
  );
  const asvsReferences = validationExposureReferences.filter(
    (reference) => reference.authority === 'OWASP ASVS',
  );
  assert.ok(asvsReferences.length > 0);
  assert.ok(asvsReferences.every((reference) => reference.version === '5.0.0'));
  assert.ok(
    asvsReferences.every((reference) => /^\d+\.\d+\.\d+$/.test(reference.sectionOrControl)),
  );
  assert.doesNotMatch(JSON.stringify(allCases), /certified|certification|fully compliant/i);
});
