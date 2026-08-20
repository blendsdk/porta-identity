import assert from 'node:assert/strict';
import { isIP } from 'node:net';
import test from 'node:test';

import { humanAuthCrossSiteRequirement } from './human-auth-cross-site-requirements.js';

import type { HumanAuthCrossSiteContract } from './human-auth-cross-site-contract.js';

function browserSite(url: string): string {
  const host = new URL(url).hostname;
  if (isIP(host) !== 0) return host;
  const labels = host.split('.');
  return labels.slice(-2).join('.');
}

function isCrossSiteContract(value: unknown): value is HumanAuthCrossSiteContract {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'observeBoundary') === 'function'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

test('owns one HTTPS literal-loopback attacker origin on the existing SPA port', () => {
  const { topology } = humanAuthCrossSiteRequirement;
  const attacker = new URL(topology.attackerUrl);
  const spa = new URL(topology.spaUrl);

  assert.equal(attacker.protocol, 'https:');
  assert.equal(attacker.hostname, '127.0.0.1');
  assert.equal(isIP(attacker.hostname), 4);
  assert.equal(attacker.port, spa.port);
  assert.equal(topology.owner, 'endpoint-manifest');
  assert.equal(topology.attackerSharesSpaPort, true);
  assert.notEqual(attacker.origin, spa.origin);
  assert.notEqual(browserSite(attacker.href), browserSite(spa.href));
  assert.deepEqual(humanAuthCrossSiteRequirement.certificate.requiredIpSans, ['127.0.0.1']);
});

test('fails closed before startup for non-loopback same-site alias and wrong-port variations', () => {
  const cases = humanAuthCrossSiteRequirement.preflightCases;
  assert.deepEqual(
    cases.map((entry) => [entry.id, entry.expected, entry.rejection]),
    [
      ['valid-literal-loopback-distinct-site', 'valid', null],
      ['reject-non-loopback-ip', 'invalid', 'attacker-url-is-not-ipv4-loopback'],
      ['reject-loopback-dns-alias', 'invalid', 'attacker-url-is-not-literal-ipv4-loopback'],
      ['reject-same-site-host', 'invalid', 'attacker-url-is-not-distinct-browser-site'],
      ['reject-wrong-spa-port', 'invalid', 'attacker-url-does-not-own-spa-port'],
    ],
  );
});

test('requires production cookie metadata and an independent CSRF nonmutation oracle', () => {
  const requirement = humanAuthCrossSiteRequirement;
  assert.equal(requirement.profile, 'production-security');
  assert.deepEqual(requirement.cookie, {
    observationSource: 'browser-cookie-metadata',
    target: {
      role: 'authenticated-session',
      name: '_session',
      domain: 'porta-harness.ci.portaidentity.com',
      path: '/',
    },
    required: { secure: true, httpOnly: true, sameSite: 'Lax', hostOnly: true },
  });
  assert.deepEqual(requirement.project, {
    name: 'security',
    profile: 'production-security',
    skipPolicy: 'forbidden',
  });
  assert.deepEqual(requirement.csrf, {
    control: {
      originContext: 'same-origin',
      csrfProof: 'valid',
      expectedResult: 'allowed',
      expectedMutationDelta: 1,
    },
    probes: [
      {
        originContext: 'cross-origin-same-site',
        csrfProof: 'missing',
        expectedResult: 'forbidden',
        expectedMutationDelta: 0,
      },
      {
        originContext: 'cross-origin-same-site',
        csrfProof: 'wrong',
        expectedResult: 'forbidden',
        expectedMutationDelta: 0,
      },
      {
        originContext: 'cross-site-loopback-ip',
        csrfProof: 'missing',
        expectedResult: 'forbidden',
        expectedMutationDelta: 0,
      },
    ],
    independentObservation: 'target-fingerprint-before-and-after',
  });
});

test('requires retained lifecycle topology before the production browser boundary', async () => {
  const adapterModulePath: string = './human-auth-cross-site-adapter.js';
  let loaded: unknown;
  try {
    loaded = await import(adapterModulePath);
  } catch {
    assert.fail('HUMAN_AUTH_CROSS_SITE_BOUNDARY_CAPABILITY_MISSING');
  }
  if (!isRecord(loaded)) {
    assert.fail('HUMAN_AUTH_CROSS_SITE_BOUNDARY_CAPABILITY_MISSING');
  }
  const createContract = Reflect.get(loaded, 'createHumanAuthCrossSiteContract');
  if (typeof createContract !== 'function') {
    assert.fail('HUMAN_AUTH_CROSS_SITE_BOUNDARY_CAPABILITY_MISSING');
  }
  const contract: unknown = Reflect.apply(createContract, undefined, []);
  if (!isCrossSiteContract(contract)) {
    assert.fail('HUMAN_AUTH_CROSS_SITE_BOUNDARY_CAPABILITY_MISSING');
  }

  const observation = await contract.observeBoundary(humanAuthCrossSiteRequirement);
  const attacker = new URL(observation.manifest.attackerUrl);
  const spa = new URL(observation.manifest.spaUrl);
  assert.equal(attacker.protocol, 'https:');
  assert.equal(attacker.hostname, '127.0.0.1');
  assert.notEqual(browserSite(attacker.href), browserSite(spa.href));
  assert.equal(observation.manifest.attackerPort, observation.manifest.spaPort);
  assert.equal(observation.environmentAttackerUrl, observation.manifest.attackerUrl);
  assert.ok(observation.certificateIpSans.includes('127.0.0.1'));

  for (const requirement of humanAuthCrossSiteRequirement.preflightCases) {
    const preflight = observation.preflights.find((entry) => entry.id === requirement.id);
    assert.ok(preflight, requirement.id);
    assert.equal(preflight.accepted, requirement.expected === 'valid', requirement.id);
    if (requirement.expected === 'invalid') {
      assert.equal(preflight.servicesStarted, false, requirement.id);
      assert.equal(preflight.browserStarted, false, requirement.id);
      assert.equal(preflight.rejection, requirement.rejection, requirement.id);
    }
  }
});
