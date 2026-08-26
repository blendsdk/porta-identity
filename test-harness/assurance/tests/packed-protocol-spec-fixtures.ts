/** Mutable CLI fixture shape used only to exercise immutable evidence rejection. */
interface MutablePackedProtocolCliFixture {
  exitCode: number;
  temporaryHomeMode: number;
  credentialsMode: number;
  temporaryHomeRemoved: boolean;
  callerCredentialUnchanged: boolean;
  browserCompleted: boolean;
  responseType: string;
  codeChallengeMethod: string;
  stateRoundTrip: boolean;
  requestedOfflineAccess: boolean;
  promptedForLoginAndConsent: boolean;
  accessTokenOpaque: boolean;
  refreshTokenPresent: boolean;
  idTokenIndependentlyVerified: boolean;
  idTokenAudienceExact: boolean;
  idTokenSubjectExact: boolean;
  accessTokenAcceptedByRawObserver: boolean;
  outputRedacted: boolean;
}

/** Mutable SDK fixture shape used only to exercise immutable evidence rejection. */
interface MutablePackedProtocolSdkFixture {
  sdkEntry: string;
  credentialsFingerprintUnchanged: boolean;
  refreshedAccessTokenChanged: boolean;
  refreshedAccessTokenAcceptedByRawObserver: boolean;
  consumedRefreshRetryStatus: number;
  consumedRefreshRetryError: string;
  outputRedacted: boolean;
}

/** Complete mutable fixture shape with no secret-bearing values. */
interface MutablePackedProtocolEvidenceFixture {
  version: number;
  sourceRevision: string;
  serverImageDigest: string;
  fixtureIdentity: string;
  archives: { sdk: string; cli: string };
  resolution: { sdkDistOnly: boolean; cliDistOnly: boolean; cliUsesPackedSdk: boolean };
  cliLogin: MutablePackedProtocolCliFixture;
  sdkRefresh: MutablePackedProtocolSdkFixture;
  primaryTreeUnchanged: boolean;
  ownedResidue: string[];
}

/** Returns complete non-secret packed protocol evidence for immutable validation cases. */
export function completePackedProtocolEvidence(): MutablePackedProtocolEvidenceFixture {
  return {
    version: 1,
    sourceRevision: 'a'.repeat(40),
    serverImageDigest: `sha256:${'b'.repeat(64)}`,
    fixtureIdentity: `sha256:${'c'.repeat(64)}`,
    archives: { sdk: 'd'.repeat(64), cli: 'e'.repeat(64) },
    resolution: { sdkDistOnly: true, cliDistOnly: true, cliUsesPackedSdk: true },
    cliLogin: {
      exitCode: 0,
      temporaryHomeMode: 0o700,
      credentialsMode: 0o600,
      temporaryHomeRemoved: true,
      callerCredentialUnchanged: true,
      browserCompleted: true,
      responseType: 'code',
      codeChallengeMethod: 'S256',
      stateRoundTrip: true,
      requestedOfflineAccess: true,
      promptedForLoginAndConsent: true,
      accessTokenOpaque: true,
      refreshTokenPresent: true,
      idTokenIndependentlyVerified: true,
      idTokenAudienceExact: true,
      idTokenSubjectExact: true,
      accessTokenAcceptedByRawObserver: true,
      outputRedacted: true,
    },
    sdkRefresh: {
      sdkEntry: '@portaidentity/sdk/node',
      credentialsFingerprintUnchanged: true,
      refreshedAccessTokenChanged: true,
      refreshedAccessTokenAcceptedByRawObserver: true,
      consumedRefreshRetryStatus: 400,
      consumedRefreshRetryError: 'invalid_grant',
      outputRedacted: true,
    },
    primaryTreeUnchanged: true,
    ownedResidue: [],
  };
}
