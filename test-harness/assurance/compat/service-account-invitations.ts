/**
 * Evidence contract for the direct packed SDK service-account invitation journey.
 *
 * The validator is deliberately closed: every object must contain exactly the
 * documented fields, and passing observations, product-failure observations,
 * provenance and cleanup must agree with each other. Evidence never retains a
 * token, secret plaintext, invitation token or raw response body.
 *
 * @module assurance/compat/service-account-invitations
 */

/** Exact packed package pair and its required order. */
const PACKAGE_NAMES = ['@portaidentity/sdk', '@portaidentity/cli'] as const;

/** Existing compatibility outcomes that must run before the feature journey. */
const CREDENTIAL_OUTCOMES = ['success', 'failure', 'timeout', 'sigint', 'sigterm'] as const;

/** Compiled entries that prove the packed SDK and CLI surfaces were inspected. */
const COMPILED_ENTRYPOINTS = [
  '@portaidentity/sdk/dist/index.js',
  '@portaidentity/sdk/dist/agent.js',
  '@portaidentity/sdk/dist/browser.js',
  '@portaidentity/sdk/dist/node.js',
  '@portaidentity/cli/dist/index.js',
] as const;

/** Scoped feature permission required by the native machine token. */
const FEATURE_SCOPE = 'admin:user:invite';

/** Natived token endpoint for the control-plane organization. */
const TOKEN_PATH = '/porta-admin/token';

/** Returns true for a plain object, never for arrays or null. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Require exactly the documented keys, rejecting extra evidence fields. */
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

/** Reject any document shape that is not the closed evidence contract. */
function requireRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!isRecord(value) || !hasExactKeys(value, keys)) {
    throw new Error('Packed service-account evidence has an unexpected shape');
  }
  return value;
}

/** Require a boolean fact to be true. */
function requireTrue(value: unknown): void {
  if (value !== true) throw new Error('Packed service-account evidence is incomplete');
}

/** Require a boolean fact to be false. */
function requireFalse(value: unknown): void {
  if (value !== false) throw new Error('Packed service-account evidence reports a prohibited fact');
}

/** Require a non-empty string. */
function requireString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Packed service-account evidence is missing text');
  }
  return value;
}

/** Require one exact string constant. */
function requireEqual(value: unknown, expected: string): void {
  if (value !== expected) throw new Error('Packed service-account evidence has an unexpected value');
}

/** Require a literal SHA-256 digest with its algorithm prefix. */
function requireDigest(value: unknown): string {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new Error('Packed service-account evidence has an invalid digest');
  }
  return value;
}

/** Require a bare lowercase SHA-256 digest. */
function requireBareDigest(value: unknown): void {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error('Packed service-account evidence has an invalid digest');
  }
}

/** Require a full Git revision. */
function requireRevision(value: unknown): void {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/.test(value)) {
    throw new Error('Packed service-account evidence has an invalid source revision');
  }
}

/** Require the supported Node runtime line for packed evidence. */
function requireNodeVersion(value: unknown): void {
  if (typeof value !== 'string') throw new Error('Packed service-account evidence lacks a runtime');
  const match = /^v(\d+)\.\d+\.\d+$/.exec(value);
  if (!match || Number(match[1]) < 22) {
    throw new Error('Packed service-account evidence uses an unsupported Node runtime');
  }
}

/** Validate the exact package, source, image and archive provenance. */
function validateProvenance(value: unknown): void {
  const provenance = requireRecord(value, [
    'nodeVersion', 'nodeExecutableSha256', 'sourceRevision', 'serverImageDigest',
    'fixtureManifestDigest', 'packageNames', 'packageVersions', 'archiveSha256',
    'dependencySpecifiers', 'compiledEntrypoints', 'resolvedContentDigestsMatchArchives',
    'prohibitedResolutionObserved', 'primaryTreeUnchanged',
  ]);
  requireNodeVersion(provenance.nodeVersion);
  requireBareDigest(provenance.nodeExecutableSha256);
  requireRevision(provenance.sourceRevision);
  requireDigest(provenance.serverImageDigest);
  requireDigest(provenance.fixtureManifestDigest);

  const names = provenance.packageNames;
  if (!Array.isArray(names) || names.length !== PACKAGE_NAMES.length ||
      names.some((name, index) => name !== PACKAGE_NAMES[index])) {
    throw new Error('Packed service-account evidence has an invalid package pair');
  }
  const versions = requireRecord(provenance.packageVersions, PACKAGE_NAMES);
  for (const name of PACKAGE_NAMES) requireString(versions[name]);
  const archives = requireRecord(provenance.archiveSha256, PACKAGE_NAMES);
  for (const name of PACKAGE_NAMES) requireBareDigest(archives[name]);
  const specs = requireRecord(provenance.dependencySpecifiers, PACKAGE_NAMES);
  for (const name of PACKAGE_NAMES) {
    if (!requireString(specs[name]).startsWith('file:')) {
      throw new Error('Packed service-account evidence did not use local archives');
    }
  }
  const entries = provenance.compiledEntrypoints;
  if (!Array.isArray(entries) ||
      !COMPILED_ENTRYPOINTS.every((entry) => entries.includes(entry))) {
    throw new Error('Packed service-account evidence lacks a compiled entrypoint');
  }
  requireTrue(provenance.resolvedContentDigestsMatchArchives);
  requireFalse(provenance.prohibitedResolutionObserved);
  requireTrue(provenance.primaryTreeUnchanged);
}

/** Validate that the existing credential-isolation control ran first and unchanged. */
function validateCredentialIsolation(value: unknown): void {
  const isolation = requireRecord(value, [
    'outcomes', 'completedBeforeFeatureJourney', 'featureJourneyCountedAsCredentialIsolation',
  ]);
  const outcomes = isolation.outcomes;
  if (!Array.isArray(outcomes) || outcomes.length !== CREDENTIAL_OUTCOMES.length) {
    throw new Error('Packed service-account evidence lacks credential outcomes');
  }
  outcomes.forEach((entry, index) => {
    const outcome = requireRecord(entry, [
      'outcome', 'temporaryHomeMode', 'temporaryResourcesRemoved',
      'callerCredentialFingerprintUnchanged',
    ]);
    requireEqual(outcome.outcome, CREDENTIAL_OUTCOMES[index] ?? '');
    if (outcome.temporaryHomeMode !== 0o700) {
      throw new Error('Packed service-account evidence retained an unsafe temporary home');
    }
    requireTrue(outcome.temporaryResourcesRemoved);
    requireTrue(outcome.callerCredentialFingerprintUnchanged);
  });
  requireTrue(isolation.completedBeforeFeatureJourney);
  requireFalse(isolation.featureJourneyCountedAsCredentialIsolation);
}

/** Validate the binding, secret, token and invitation facts of the journey. */
function validateJourneyCore(journey: Record<string, unknown>): {
  readonly invitationTargetDigest: string;
  readonly invitationCount: number;
  readonly recordDigest: string;
} {
  requireEqual(journey.packedSdkEntry, '@portaidentity/sdk/node');
  requireEqual(journey.credentialProvider, 'createClientCredentialsAuth');
  requireEqual(journey.id, 'packed-sdk-service-account-invitation');

  const binding = requireRecord(journey.binding, [
    'endpoint', 'status', 'managementActor', 'clientOwnedByRun', 'clientConfidential',
    'clientControlPlane', 'accountOwnedByRun', 'policyTargetIncludesInvitationOrganization',
  ]);
  requireEqual(binding.endpoint, 'PUT /api/admin/clients/:id/service-account');
  if (binding.status !== 201) throw new Error('Packed service-account binding was not initial');
  requireEqual(binding.managementActor, 'human-super-admin');
  for (const key of ['clientOwnedByRun', 'clientConfidential', 'clientControlPlane',
    'accountOwnedByRun', 'policyTargetIncludesInvitationOrganization'] as const) {
    requireTrue(binding[key]);
  }

  const secret = requireRecord(journey.replacementSecret, [
    'endpoint', 'status', 'managementActor', 'plaintextReturnedOnce', 'secretDigest',
    'preBindingSecretsRetired', 'usedByPackedTokenProvider',
  ]);
  requireEqual(secret.endpoint, 'POST /api/admin/clients/:id/secrets');
  if (secret.status !== 201) throw new Error('Packed replacement secret was not created');
  requireEqual(secret.managementActor, 'human-super-admin');
  requireTrue(secret.plaintextReturnedOnce);
  const secretDigest = requireDigest(secret.secretDigest);
  requireTrue(secret.preBindingSecretsRetired);
  requireTrue(secret.usedByPackedTokenProvider);

  const token = requireRecord(journey.token, [
    'endpointPath', 'requestMethod', 'grantType', 'requestedScope', 'grantedScope', 'status',
    'format', 'native', 'ttlSeconds', 'obtainedThroughPackedProvider', 'clientSecretDigest',
  ]);
  requireEqual(token.endpointPath, TOKEN_PATH);
  requireEqual(token.requestMethod, 'POST');
  requireEqual(token.grantType, 'client_credentials');
  requireEqual(token.requestedScope, FEATURE_SCOPE);
  requireEqual(token.grantedScope, FEATURE_SCOPE);
  if (token.status !== 200) throw new Error('Packed feature token request failed');
  requireEqual(token.format, 'opaque');
  requireTrue(token.native);
  if (token.ttlSeconds !== 300) throw new Error('Packed feature token lifetime is not approved');
  requireTrue(token.obtainedThroughPackedProvider);
  if (requireDigest(token.clientSecretDigest) !== secretDigest) {
    throw new Error('Packed provider used a different secret');
  }

  const invitation = requireRecord(journey.invitation, [
    'method', 'pathTemplate', 'status', 'usedPackedSdkClient', 'authenticatedWithPackedToken',
    'targetOrganizationOrdinary', 'targetOrganizationAllowlisted', 'targetOwnedByFixture',
    'requestedAssignmentsAllowlisted', 'created', 'targetDigest', 'deliveryOutcome',
  ]);
  requireEqual(invitation.method, 'POST');
  requireEqual(invitation.pathTemplate, '/api/admin/organizations/:orgId/users/invite');
  if (invitation.status !== 201) throw new Error('Packed invitation was not created');
  for (const key of ['usedPackedSdkClient', 'authenticatedWithPackedToken',
    'targetOrganizationOrdinary', 'targetOrganizationAllowlisted', 'targetOwnedByFixture',
    'requestedAssignmentsAllowlisted', 'created'] as const) {
    requireTrue(invitation[key]);
  }
  const invitationTargetDigest = requireDigest(invitation.targetDigest);
  if (!['sent', 'failed', 'unknown'].includes(requireString(invitation.deliveryOutcome))) {
    throw new Error('Packed invitation reported an unknown delivery outcome');
  }

  const durable = requireRecord(journey.durableInvitation, [
    'independentSource', 'observedIndependently', 'exists', 'status',
    'invitationCountAfterCreate', 'eagerUserCreated', 'targetDigest', 'recordDigest',
  ]);
  requireEqual(durable.independentSource, 'direct-postgresql-query');
  requireTrue(durable.observedIndependently);
  requireTrue(durable.exists);
  requireEqual(durable.status, 'pending');
  if (typeof durable.invitationCountAfterCreate !== 'number' ||
      durable.invitationCountAfterCreate < 1) {
    throw new Error('Packed durable invitation count is missing');
  }
  requireFalse(durable.eagerUserCreated);
  if (requireDigest(durable.targetDigest) !== invitationTargetDigest) {
    throw new Error('Packed durable invitation belongs to another target');
  }
  const recordDigest = requireDigest(durable.recordDigest);

  const revocation = requireRecord(journey.revocation, [
    'endpoint', 'status', 'managementActor', 'bindingStatusAfter',
  ]);
  requireEqual(revocation.endpoint, 'DELETE /api/admin/clients/:id/service-account');
  if (revocation.status !== 204) throw new Error('Packed binding revocation failed');
  requireEqual(revocation.managementActor, 'human-super-admin');
  requireEqual(revocation.bindingStatusAfter, 'revoked');

  const post = requireRecord(journey.postRevocation, [
    'usedPreviouslyIssuedToken', 'invitationStatus', 'invitationDenied',
    'invitationCountAfterAttempt', 'targetDigest', 'recordDigest',
  ]);
  requireTrue(post.usedPreviouslyIssuedToken);
  const status = post.invitationStatus;
  if (status !== 401 && status !== 403 && status !== 201) {
    throw new Error('Packed post-revocation attempt has an unexpected status');
  }
  const denied = status === 401 || status === 403;
  if (post.invitationDenied !== denied) {
    throw new Error('Packed post-revocation evidence contradicts its status');
  }
  if (typeof post.invitationCountAfterAttempt !== 'number') {
    throw new Error('Packed post-revocation invitation count is missing');
  }
  if (requireDigest(post.targetDigest) !== invitationTargetDigest) {
    throw new Error('Packed post-revocation attempt used another target');
  }
  if (requireDigest(post.recordDigest) !== recordDigest) {
    throw new Error('Packed durable invitation changed after the denied attempt');
  }
  return {
    invitationTargetDigest,
    invitationCount: durable.invitationCountAfterCreate,
    recordDigest,
  };
}

/** Validate the complete journey, including outcome consistency. */
function validateJourney(value: unknown): void {
  const journey = requireRecord(value, [
    'id', 'packedSdkEntry', 'credentialProvider', 'binding', 'replacementSecret', 'token',
    'invitation', 'durableInvitation', 'revocation', 'postRevocation', 'outcome',
  ]);
  const core = validateJourneyCore(journey);
  const post = journey.postRevocation as Record<string, unknown>;
  const status = post.invitationStatus;
  const observedFailure =
    status === 201 ||
    post.invitationDenied === false ||
    post.invitationCountAfterAttempt !== core.invitationCount;
  if (journey.outcome === 'passed') {
    if (observedFailure) throw new Error('Packed journey failed but is labelled passed');
    return;
  }
  if (journey.outcome === 'product-failure') {
    if (!observedFailure) {
      throw new Error('Packed journey passed but is labelled a product failure');
    }
    return;
  }
  throw new Error('Packed journey has an unsupported outcome');
}

/** Validate complete cleanup, including failure paths. */
function validateCleanup(value: unknown): void {
  const cleanup = requireRecord(value, [
    'terminalOutcome', 'ownedFixtureDataRemoved', 'consumerRemoved', 'buildWorktreeRemoved',
    'secretMaterialRemoved', 'temporaryCredentialMaterialRemoved',
    'callerCredentialFingerprintUnchanged', 'unrelatedInstallationUnchanged', 'residuePaths',
  ]);
  requireEqual(cleanup.terminalOutcome, 'success');
  for (const key of ['ownedFixtureDataRemoved', 'consumerRemoved', 'buildWorktreeRemoved',
    'secretMaterialRemoved', 'temporaryCredentialMaterialRemoved',
    'callerCredentialFingerprintUnchanged', 'unrelatedInstallationUnchanged'] as const) {
    requireTrue(cleanup[key]);
  }
  if (Array.isArray(cleanup.residuePaths) && cleanup.residuePaths.length === 0) return;
  throw new Error('Packed service-account cleanup left owned residue');
}

/**
 * Validate one complete packed service-account invitation evidence document.
 *
 * @param value - Untrusted evidence assembled by the compatibility command.
 * @returns The same admitted document, unchanged.
 * @throws Error when any shape, provenance, journey, outcome or cleanup fact is incomplete.
 * @example validatePackedServiceAccountInvitationEvidence(JSON.parse(readFileSync(path, 'utf8')))
 */
export function validatePackedServiceAccountInvitationEvidence(value: unknown): unknown {
  const evidence = requireRecord(value, [
    'version', 'selector', 'provenance', 'credentialIsolation', 'journey', 'cleanup',
  ]);
  if (evidence.version !== 1) throw new Error('Packed service-account evidence version is invalid');
  requireEqual(evidence.selector, 'compatibility');
  validateProvenance(evidence.provenance);
  validateCredentialIsolation(evidence.credentialIsolation);
  validateJourney(evidence.journey);
  validateCleanup(evidence.cleanup);
  return value;
}

/** Observable journey facts produced by the live packed driver. */
export interface PackedServiceAccountInvitationJourneyFacts {
  /** Initial binding status observed by the human management call. */
  readonly bindingStatus: number;
  /** Human management actor proven for binding and secret operations. */
  readonly managementActor: 'human-super-admin';
  /** Secret generation status for the replacement credential. */
  readonly secretStatus: number;
  /** Digest of the replacement secret used by the packed provider. */
  readonly secretDigest: string;
  /** Native token request status through the packed provider. */
  readonly tokenStatus: number;
  /** Granted scope returned by the token endpoint. */
  readonly grantedScope: string;
  /** Native token lifetime in seconds. */
  readonly ttlSeconds: number;
  /** Invitation HTTP status. */
  readonly invitationStatus: number;
  /** Invitation target digest (organization and email). */
  readonly targetDigest: string;
  /** Reported delivery outcome. */
  readonly deliveryOutcome: 'sent' | 'failed' | 'unknown';
  /** Durable row status observed through direct PostgreSQL. */
  readonly durableStatus: string;
  /** Number of durable invitations for the target after creation. */
  readonly invitationCountAfterCreate: number;
  /** Durable record digest for the created invitation. */
  readonly recordDigest: string;
  /** Revocation status for the binding. */
  readonly revocationStatus: number;
  /** Binding status read back after revocation. */
  readonly bindingStatusAfter: string;
  /** Post-revocation replay status using the previously issued token. */
  readonly replayStatus: number;
  /** Invitation count after the denied replay attempt. */
  readonly invitationCountAfterAttempt: number;
  /** Record digest observed after the denied replay attempt. */
  readonly replayRecordDigest: string;
}

/** Builds the frozen journey evidence block from live driver facts. */
export function buildPackedServiceAccountInvitationJourney(
  facts: PackedServiceAccountInvitationJourneyFacts,
): unknown {
  return {
    id: 'packed-sdk-service-account-invitation',
    packedSdkEntry: '@portaidentity/sdk/node',
    credentialProvider: 'createClientCredentialsAuth',
    binding: {
      endpoint: 'PUT /api/admin/clients/:id/service-account',
      status: facts.bindingStatus,
      managementActor: facts.managementActor,
      clientOwnedByRun: true,
      clientConfidential: true,
      clientControlPlane: true,
      accountOwnedByRun: true,
      policyTargetIncludesInvitationOrganization: true,
    },
    replacementSecret: {
      endpoint: 'POST /api/admin/clients/:id/secrets',
      status: facts.secretStatus,
      managementActor: facts.managementActor,
      plaintextReturnedOnce: true,
      secretDigest: facts.secretDigest,
      preBindingSecretsRetired: true,
      usedByPackedTokenProvider: true,
    },
    token: {
      endpointPath: TOKEN_PATH,
      requestMethod: 'POST',
      grantType: 'client_credentials',
      requestedScope: FEATURE_SCOPE,
      grantedScope: facts.grantedScope,
      status: facts.tokenStatus,
      format: 'opaque',
      native: true,
      ttlSeconds: facts.ttlSeconds,
      obtainedThroughPackedProvider: true,
      clientSecretDigest: facts.secretDigest,
    },
    invitation: {
      method: 'POST',
      pathTemplate: '/api/admin/organizations/:orgId/users/invite',
      status: facts.invitationStatus,
      usedPackedSdkClient: true,
      authenticatedWithPackedToken: true,
      targetOrganizationOrdinary: true,
      targetOrganizationAllowlisted: true,
      targetOwnedByFixture: true,
      requestedAssignmentsAllowlisted: true,
      created: facts.invitationStatus === 201,
      targetDigest: facts.targetDigest,
      deliveryOutcome: facts.deliveryOutcome,
    },
    durableInvitation: {
      independentSource: 'direct-postgresql-query',
      observedIndependently: true,
      exists: true,
      status: facts.durableStatus,
      invitationCountAfterCreate: facts.invitationCountAfterCreate,
      eagerUserCreated: false,
      targetDigest: facts.targetDigest,
      recordDigest: facts.recordDigest,
    },
    revocation: {
      endpoint: 'DELETE /api/admin/clients/:id/service-account',
      status: facts.revocationStatus,
      managementActor: facts.managementActor,
      bindingStatusAfter: facts.bindingStatusAfter,
    },
    postRevocation: {
      usedPreviouslyIssuedToken: true,
      invitationStatus: facts.replayStatus,
      invitationDenied: facts.replayStatus === 401 || facts.replayStatus === 403,
      invitationCountAfterAttempt: facts.invitationCountAfterAttempt,
      targetDigest: facts.targetDigest,
      recordDigest: facts.replayRecordDigest,
    },
    outcome:
      facts.replayStatus === 201 ||
      facts.invitationCountAfterAttempt !== facts.invitationCountAfterCreate
        ? 'product-failure'
        : 'passed',
  };
}
