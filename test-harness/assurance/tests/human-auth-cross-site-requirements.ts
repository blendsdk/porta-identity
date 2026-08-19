import type { HumanAuthCrossSiteRequest } from './human-auth-cross-site-contract.js';

const spaPort = 41_001;

/** Immutable public-boundary request independent of current Porta behavior. */
export const humanAuthCrossSiteRequirement: HumanAuthCrossSiteRequest = Object.freeze({
  sentinelId: 'ST-45',
  profile: 'production-security',
  topology: Object.freeze({
    owner: 'endpoint-manifest',
    portaUrl: 'https://porta-harness.ci.portaidentity.com:41000',
    spaUrl: `https://app-harness.ci.portaidentity.com:${spaPort}`,
    attackerUrl: `https://127.0.0.1:${spaPort}`,
    attackerSharesSpaPort: true,
    attackerHostKind: 'literal-ipv4-loopback',
    browserSiteRelation: 'distinct-site',
  }),
  project: Object.freeze({
    name: 'security',
    profile: 'production-security',
    skipPolicy: 'forbidden',
  }),
  certificate: Object.freeze({ requiredIpSans: ['127.0.0.1'] as const }),
  preflightCases: Object.freeze([
    Object.freeze({
      id: 'valid-literal-loopback-distinct-site',
      attackerUrl: `https://127.0.0.1:${spaPort}`,
      expected: 'valid' as const,
      rejection: null,
    }),
    Object.freeze({
      id: 'reject-non-loopback-ip',
      attackerUrl: `https://192.0.2.1:${spaPort}`,
      expected: 'invalid' as const,
      rejection: 'attacker-url-is-not-ipv4-loopback',
    }),
    Object.freeze({
      id: 'reject-loopback-dns-alias',
      attackerUrl: `https://localhost:${spaPort}`,
      expected: 'invalid' as const,
      rejection: 'attacker-url-is-not-literal-ipv4-loopback',
    }),
    Object.freeze({
      id: 'reject-same-site-host',
      attackerUrl: `https://attacker-harness.ci.portaidentity.com:${spaPort}`,
      expected: 'invalid' as const,
      rejection: 'attacker-url-is-not-distinct-browser-site',
    }),
    Object.freeze({
      id: 'reject-wrong-spa-port',
      attackerUrl: `https://127.0.0.1:${spaPort + 1}`,
      expected: 'invalid' as const,
      rejection: 'attacker-url-does-not-own-spa-port',
    }),
  ]),
  cookie: Object.freeze({
    observationSource: 'browser-cookie-metadata',
    target: Object.freeze({
      role: 'authenticated-session',
      name: '_session',
      domain: 'porta-harness.ci.portaidentity.com',
      path: '/',
    }),
    required: Object.freeze({
      secure: true,
      httpOnly: true,
      sameSite: 'Lax' as const,
      hostOnly: true,
    }),
  }),
  csrf: Object.freeze({
    control: Object.freeze({
      originContext: 'same-origin',
      csrfProof: 'valid',
      expectedResult: 'allowed',
      expectedMutationDelta: 1,
    }),
    probe: Object.freeze({
      originContext: 'cross-site-loopback-ip',
      csrfProof: 'missing',
      expectedResult: 'forbidden',
      expectedMutationDelta: 0,
    }),
    independentObservation: 'target-fingerprint-before-and-after',
  }),
});
