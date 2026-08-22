/** A complete risk-slice profile used to prove field preservation and completeness checks. */
export const completeSliceProfile = {
  id: 'protocol-token',
  actors: ['public-client', 'resource-owner', 'attacker'],
  actions: ['authorize', 'exchange-code', 'replay-code'],
  resources: ['authorization-code', 'access-token'],
  results: {
    allowed: ['authorization-code-issued'],
    unauthenticated: ['login-required'],
    forbidden: ['invalid-grant'],
    notFound: ['client-not-found'],
  },
  entryPoints: ['oidc-authorization-endpoint', 'oidc-token-endpoint'],
  trustBoundaries: ['browser-to-provider', 'client-to-provider'],
  rejectionClasses: ['invalid-client', 'invalid-grant'],
  abuseClasses: ['code-replay', 'cross-client-code-redemption'],
  prohibitedSideEffects: ['token-issued-after-rejected-exchange'],
  privacySafeLogs: ['security-event-with-synthetic-identifiers'],
  recoveryExpectations: ['subsequent-valid-exchange-succeeds'],
};

/** A complete critical claim with independent positive and negative sentinels. */
export const completeClaim = {
  id: 'CLAIM-R1-01',
  slice: 'protocol-token',
  risk: 'critical',
  owner: 'identity-security',
  sources: [
    {
      authority: 'OAuth 2.0 Security Best Current Practice',
      version: 'RFC 9700',
      section: '2.1.1',
    },
  ],
  threat: 'An authorization code is redeemed by a different client.',
  oracle: {
    sourceKind: 'published-standard',
    observation: 'Redeem a code using a client other than the one that initiated authorization.',
    expected: { status: 400, error: 'invalid_grant' },
  },
  sentinels: [
    {
      test: 'test-harness/assurance/tests/protocol.spec.test.ts',
      case: 'rejects cross-client authorization-code redemption',
      classification: 'negative',
      runner: 'node',
      trusted: true,
    },
    {
      test: 'test-harness/assurance/tests/protocol.spec.test.ts',
      case: 'redeems an authorization code for its initiating client',
      classification: 'positive',
      runner: 'node',
      trusted: true,
    },
  ],
  status: 'incomplete',
  evidence: {
    buildIdentity: 'commit:0123456789abcdef',
    fixtureIdentity: 'fixture:alpha-v1',
    runtimeProfile: 'production-security',
    commands: ['yarn verify'],
    results: [{ command: 'yarn verify', status: 'passed', runtimeProfile: 'production-security' }],
    faultIds: ['protocol-client-binding'],
    killedFaultIds: ['protocol-client-binding'],
    coverageReference: 'coverage/server.json',
    recordedAt: '2026-08-10T10:00:00.000Z',
    current: true,
  },
  gaps: [],
  reopenWhen: ['oidc-provider dependency changes', 'token endpoint behavior changes'],
  profile: 'production-security',
  sliceProfile: 'protocol-token',
};

/** Registered tests available to claim-reference validation cases. */
export const knownTests = [
  {
    path: 'test-harness/assurance/tests/protocol.spec.test.ts',
    runner: 'node',
    cases: [
      { name: 'rejects cross-client authorization-code redemption', trusted: true },
      { name: 'redeems an authorization code for its initiating client', trusted: true },
    ],
  },
];
