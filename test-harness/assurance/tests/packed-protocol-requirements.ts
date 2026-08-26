/** Exact locally packed public surfaces required by the protocol adjunct. */
export const packedProtocolSurfaces = Object.freeze({
  cli: Object.freeze({
    entry: 'bin:porta',
    operation: 'authorization-code-pkce-login',
    interaction: 'browser-assisted-manual-callback',
  }),
  sdk: Object.freeze({
    entry: '@portaidentity/sdk/node',
    operation: 'cli-credential-refresh-token',
    observer: 'independent-raw-http',
  }),
});

/** Exact public protocol facts the CLI login journey must establish. */
export const packedCliProtocolRequirements = Object.freeze({
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
});

/** Exact public protocol facts the SDK refresh journey must establish. */
export const packedSdkProtocolRequirements = Object.freeze({
  sdkEntry: '@portaidentity/sdk/node',
  credentialsFingerprintUnchanged: true,
  refreshedAccessTokenChanged: true,
  refreshedAccessTokenAcceptedByRawObserver: true,
  consumedRefreshRetryStatus: 400,
  consumedRefreshRetryError: 'invalid_grant',
  outputRedacted: true,
});
