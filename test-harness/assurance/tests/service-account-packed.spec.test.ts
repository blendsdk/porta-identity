import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isPackedCompatibilitySelector,
  packedCompatibilitySelectors,
} from '../compat/command.js';
import { validatePackedServiceAccountInvitationEvidence } from '../compat/service-account-invitations.js';

/**
 * Independent oracle for the direct packed SDK service-account invitation journey.
 *
 * The journey runs inside the existing `compatibility` selector after the credential-isolation
 * outcomes. It must prove an owned bound confidential control-plane client, a replacement secret,
 * a native feature token obtained through the packed SDK credential provider, one allowlisted
 * ordinary invitation, independently observed durable state, and a post-revocation denial that
 * creates no new invitation. Package output alone is insufficient: source, image, archive and
 * cleanup facts are mandatory.
 */

/** Locally packed package names admitted by the compatibility consumer. */
type PackedPackageName = '@portaidentity/sdk' | '@portaidentity/cli';

/** Terminal outcomes used by the existing credential-isolation control and cleanup evidence. */
type TerminalOutcome = 'success' | 'failure' | 'timeout' | 'sigint' | 'sigterm';

/** One existing credential-isolation outcome retained beside the new feature journey. */
interface CredentialIsolationResult {
  outcome: TerminalOutcome;
  temporaryHomeMode: number;
  temporaryResourcesRemoved: boolean;
  callerCredentialFingerprintUnchanged: boolean;
}

/** Exact package, source, image and fixture provenance required before a journey is admitted. */
interface PackedProvenanceEvidence {
  nodeVersion: string;
  nodeExecutableSha256: string;
  sourceRevision: string;
  serverImageDigest: string;
  fixtureManifestDigest: string;
  /** Exact local package pair; the validator enforces both names and their order. */
  packageNames: PackedPackageName[];
  packageVersions: Record<PackedPackageName, string>;
  archiveSha256: Record<PackedPackageName, string>;
  dependencySpecifiers: Record<PackedPackageName, string>;
  compiledEntrypoints: string[];
  resolvedContentDigestsMatchArchives: boolean;
  prohibitedResolutionObserved: boolean;
  primaryTreeUnchanged: boolean;
}

/** Evidence that the existing credential-isolation control ran before the new journey. */
interface CredentialIsolationEvidence {
  outcomes: CredentialIsolationResult[];
  completedBeforeFeatureJourney: boolean;
  featureJourneyCountedAsCredentialIsolation: boolean;
}

/** One direct packed SDK service-account invitation journey. */
interface PackedServiceAccountInvitationJourneyEvidence {
  id: string;
  packedSdkEntry: string;
  credentialProvider: string;
  binding: {
    endpoint: string;
    status: number;
    managementActor: string;
    clientOwnedByRun: boolean;
    clientConfidential: boolean;
    clientControlPlane: boolean;
    accountOwnedByRun: boolean;
    policyTargetIncludesInvitationOrganization: boolean;
  };
  replacementSecret: {
    endpoint: string;
    status: number;
    managementActor: string;
    plaintextReturnedOnce: boolean;
    /** Digest of the secret bytes; the secret itself is never evidence. */
    secretDigest: string;
    preBindingSecretsRetired: boolean;
    usedByPackedTokenProvider: boolean;
  };
  token: {
    endpointPath: string;
    requestMethod: string;
    grantType: string;
    requestedScope: string;
    grantedScope: string;
    status: number;
    /** Native access tokens are opaque rather than JWTs. */
    format: string;
    native: boolean;
    /** Feature-token lifetime in seconds. */
    ttlSeconds: number;
    obtainedThroughPackedProvider: boolean;
    /** Digest of the secret used by the packed provider; must match the replacement secret. */
    clientSecretDigest: string;
  };
  invitation: {
    method: string;
    pathTemplate: string;
    status: number;
    usedPackedSdkClient: boolean;
    authenticatedWithPackedToken: boolean;
    targetOrganizationOrdinary: boolean;
    targetOrganizationAllowlisted: boolean;
    targetOwnedByFixture: boolean;
    requestedAssignmentsAllowlisted: boolean;
    created: boolean;
    /** Digest of the owned organization and email; the values themselves are never evidence. */
    targetDigest: string;
    /** Delivery result reported separately from invitation persistence. */
    deliveryOutcome: 'sent' | 'failed' | 'unknown';
  };
  durableInvitation: {
    independentSource: string;
    observedIndependently: boolean;
    exists: boolean;
    status: string;
    invitationCountAfterCreate: number;
    eagerUserCreated: boolean;
    /** Must equal the digest of the invitation target. */
    targetDigest: string;
    /** Digest of the non-secret durable invitation projection. */
    recordDigest: string;
  };
  revocation: {
    endpoint: string;
    status: number;
    managementActor: string;
    bindingStatusAfter: string;
  };
  postRevocation: {
    usedPreviouslyIssuedToken: boolean;
    invitationStatus: number;
    invitationDenied: boolean;
    invitationCountAfterAttempt: number;
    /** Must equal the durable invitation target digest. */
    targetDigest: string;
    recordDigest: string;
  };
  /** Truthful outcome derived from the observations above. */
  outcome: 'passed' | 'product-failure';
}

/** Cleanup facts required after the journey, including failure paths. */
interface PackedServiceAccountInvitationCleanupEvidence {
  terminalOutcome: TerminalOutcome;
  ownedFixtureDataRemoved: boolean;
  consumerRemoved: boolean;
  buildWorktreeRemoved: boolean;
  secretMaterialRemoved: boolean;
  temporaryCredentialMaterialRemoved: boolean;
  callerCredentialFingerprintUnchanged: boolean;
  unrelatedInstallationUnchanged: boolean;
  residuePaths: string[];
}

/** Complete evidence document admitted by the packed service-account validator. */
interface PackedServiceAccountInvitationEvidence {
  version: 1;
  selector: 'compatibility';
  provenance: PackedProvenanceEvidence;
  credentialIsolation: CredentialIsolationEvidence;
  journey: PackedServiceAccountInvitationJourneyEvidence;
  cleanup: PackedServiceAccountInvitationCleanupEvidence;
}

/** Existing credential-isolation outcomes in their established execution order. */
const credentialIsolationOutcomes = ['success', 'failure', 'timeout', 'sigint', 'sigterm'] as const;

/** Exact existing selectors that must remain available and unchanged. */
const closedCompatibilitySelectors = [
  'ST-69',
  'ST-70',
  'ST-71',
  'ST-72',
  'ST-73',
  'p1-admin',
] as const;

const digestA = `sha256:${'a'.repeat(64)}`;
const digestB = `sha256:${'b'.repeat(64)}`;
const bareDigestA = 'a'.repeat(64);
const bareDigestB = 'b'.repeat(64);
const sourceRevision = 'c'.repeat(40);

/** Creates complete, internally consistent evidence for validator specification only. */
function completeEvidence(): PackedServiceAccountInvitationEvidence {
  return {
    version: 1,
    selector: 'compatibility',
    provenance: {
      nodeVersion: 'v24.0.0',
      nodeExecutableSha256: bareDigestA,
      sourceRevision,
      serverImageDigest: digestB,
      fixtureManifestDigest: digestA,
      packageNames: ['@portaidentity/sdk', '@portaidentity/cli'],
      packageVersions: {
        '@portaidentity/sdk': '1.0.0',
        '@portaidentity/cli': '1.0.0',
      },
      archiveSha256: {
        '@portaidentity/sdk': bareDigestA,
        '@portaidentity/cli': bareDigestB,
      },
      dependencySpecifiers: {
        '@portaidentity/sdk': 'file:portaidentity-sdk.tgz',
        '@portaidentity/cli': 'file:portaidentity-cli.tgz',
      },
      compiledEntrypoints: [
        '@portaidentity/sdk/dist/index.js',
        '@portaidentity/sdk/dist/agent.js',
        '@portaidentity/sdk/dist/browser.js',
        '@portaidentity/sdk/dist/node.js',
        '@portaidentity/cli/dist/index.js',
      ],
      resolvedContentDigestsMatchArchives: true,
      prohibitedResolutionObserved: false,
      primaryTreeUnchanged: true,
    },
    credentialIsolation: {
      outcomes: credentialIsolationOutcomes.map((outcome) => ({
        outcome,
        temporaryHomeMode: 0o700,
        temporaryResourcesRemoved: true,
        callerCredentialFingerprintUnchanged: true,
      })),
      completedBeforeFeatureJourney: true,
      featureJourneyCountedAsCredentialIsolation: false,
    },
    journey: {
      id: 'packed-sdk-service-account-invitation',
      packedSdkEntry: '@portaidentity/sdk/node',
      credentialProvider: 'createClientCredentialsAuth',
      binding: {
        endpoint: 'PUT /api/admin/clients/:id/service-account',
        status: 201,
        managementActor: 'human-super-admin',
        clientOwnedByRun: true,
        clientConfidential: true,
        clientControlPlane: true,
        accountOwnedByRun: true,
        policyTargetIncludesInvitationOrganization: true,
      },
      replacementSecret: {
        endpoint: 'POST /api/admin/clients/:id/secrets',
        status: 201,
        managementActor: 'human-super-admin',
        plaintextReturnedOnce: true,
        secretDigest: digestA,
        preBindingSecretsRetired: true,
        usedByPackedTokenProvider: true,
      },
      token: {
        endpointPath: '/porta-admin/token',
        requestMethod: 'POST',
        grantType: 'client_credentials',
        requestedScope: 'admin:user:invite',
        grantedScope: 'admin:user:invite',
        status: 200,
        format: 'opaque',
        native: true,
        ttlSeconds: 300,
        obtainedThroughPackedProvider: true,
        clientSecretDigest: digestA,
      },
      invitation: {
        method: 'POST',
        pathTemplate: '/api/admin/organizations/:orgId/users/invite',
        status: 201,
        usedPackedSdkClient: true,
        authenticatedWithPackedToken: true,
        targetOrganizationOrdinary: true,
        targetOrganizationAllowlisted: true,
        targetOwnedByFixture: true,
        requestedAssignmentsAllowlisted: true,
        created: true,
        targetDigest: digestA,
        deliveryOutcome: 'sent',
      },
      durableInvitation: {
        independentSource: 'direct-postgresql-query',
        observedIndependently: true,
        exists: true,
        status: 'pending',
        invitationCountAfterCreate: 1,
        eagerUserCreated: false,
        targetDigest: digestA,
        recordDigest: digestB,
      },
      revocation: {
        endpoint: 'DELETE /api/admin/clients/:id/service-account',
        status: 204,
        managementActor: 'human-super-admin',
        bindingStatusAfter: 'revoked',
      },
      postRevocation: {
        usedPreviouslyIssuedToken: true,
        invitationStatus: 401,
        invitationDenied: true,
        invitationCountAfterAttempt: 1,
        targetDigest: digestA,
        recordDigest: digestB,
      },
      outcome: 'passed',
    },
    cleanup: {
      terminalOutcome: 'success',
      ownedFixtureDataRemoved: true,
      consumerRemoved: true,
      buildWorktreeRemoved: true,
      secretMaterialRemoved: true,
      temporaryCredentialMaterialRemoved: true,
      callerCredentialFingerprintUnchanged: true,
      unrelatedInstallationUnchanged: true,
      residuePaths: [],
    },
  };
}

/** Returns a fresh mutable copy so each negative case changes exactly one required fact. */
function evidenceWith(
  change: (draft: PackedServiceAccountInvitationEvidence) => void,
): PackedServiceAccountInvitationEvidence {
  const draft = structuredClone(completeEvidence());
  change(draft);
  return draft;
}

/** One table-driven negative case with a human-readable diagnostic label. */
type Mutation = readonly [string, (draft: PackedServiceAccountInvitationEvidence) => void];

/** Rejects every mutation without accepting a partially changed document. */
function rejectMutations(mutations: readonly Mutation[]): void {
  for (const [label, change] of mutations) {
    assert.throws(
      () => validatePackedServiceAccountInvitationEvidence(evidenceWith(change)),
      Error,
      label,
    );
  }
}

test('should keep the direct journey inside the existing compatibility selector', () => {
  assert.equal(packedCompatibilitySelectors.includes('compatibility'), true);
  for (const selector of closedCompatibilitySelectors) {
    assert.equal(isPackedCompatibilitySelector(selector), true, selector);
  }
  for (const invented of ['service-account', 'service-account-invitations', 'packed-service-account']) {
    assert.equal(isPackedCompatibilitySelector(invented), false, invented);
  }
  const complete = completeEvidence();
  assert.equal(complete.selector, 'compatibility');
  assert.equal(complete.journey.id, 'packed-sdk-service-account-invitation');
});

test('should admit a complete packed SDK invitation journey with exact evidence', () => {
  const complete = completeEvidence();
  const validated: unknown = validatePackedServiceAccountInvitationEvidence(complete);

  assert.deepEqual(validated, complete);
  assert.equal(complete.journey.token.requestedScope, 'admin:user:invite');
  assert.equal(complete.journey.token.grantedScope, 'admin:user:invite');
  assert.equal(complete.journey.token.endpointPath, '/porta-admin/token');
  assert.equal(complete.journey.token.ttlSeconds, 300);
  assert.equal(complete.journey.token.format, 'opaque');
  assert.equal(complete.journey.durableInvitation.observedIndependently, true);
  assert.equal(complete.journey.durableInvitation.status, 'pending');
  assert.equal(complete.journey.postRevocation.invitationDenied, true);
  assert.equal(
    complete.journey.postRevocation.invitationCountAfterAttempt,
    complete.journey.durableInvitation.invitationCountAfterCreate,
  );
  assert.equal(
    complete.journey.postRevocation.recordDigest,
    complete.journey.durableInvitation.recordDigest,
  );

  // Delivery is separate from durable creation: any email effect is admissible evidence, but it
  // cannot prove invitation persistence by itself.
  for (const deliveryOutcome of ['sent', 'failed', 'unknown'] as const) {
    assert.doesNotThrow(
      () =>
        validatePackedServiceAccountInvitationEvidence(
          evidenceWith((draft) => {
            draft.journey.invitation.deliveryOutcome = deliveryOutcome;
          }),
        ),
      Error,
      deliveryOutcome,
    );
  }

  // Revocation can reject at authentication (401) or authorization (403); both are denials.
  for (const invitationStatus of [401, 403] as const) {
    assert.doesNotThrow(
      () =>
        validatePackedServiceAccountInvitationEvidence(
          evidenceWith((draft) => {
            draft.journey.postRevocation.invitationStatus = invitationStatus;
          }),
        ),
      Error,
      String(invitationStatus),
    );
  }
});

test('should reject incomplete package, source, image, and archive provenance', () => {
  rejectMutations([
    ['wrong source revision', (draft) => { draft.provenance.sourceRevision = 'not-a-commit'; }],
    ['wrong server image digest', (draft) => { draft.provenance.serverImageDigest = 'sha256:defect'; }],
    ['wrong fixture manifest digest', (draft) => { draft.provenance.fixtureManifestDigest = 'defect'; }],
    ['unsupported Node runtime', (draft) => { draft.provenance.nodeVersion = 'v18.0.0'; }],
    ['missing packed package', (draft) => { draft.provenance.packageNames = ['@portaidentity/sdk']; }],
    ['reordered packed package pair', (draft) => {
      draft.provenance.packageNames = ['@portaidentity/cli', '@portaidentity/sdk'];
    }],
    ['missing packed package version', (draft) => {
      Reflect.deleteProperty(draft.provenance.packageVersions, '@portaidentity/cli');
    }],
    ['wrong archive digest', (draft) => { draft.provenance.archiveSha256['@portaidentity/sdk'] = 'defect'; }],
    ['non-local dependency specifier', (draft) => {
      draft.provenance.dependencySpecifiers['@portaidentity/sdk'] =
        'https://registry.example/sdk.tgz';
    }],
    ['missing compiled SDK node entry', (draft) => {
      draft.provenance.compiledEntrypoints = ['@portaidentity/sdk/dist/index.js'];
    }],
    ['resolved package content differs from archive', (draft) => {
      draft.provenance.resolvedContentDigestsMatchArchives = false;
    }],
    ['prohibited package resolution', (draft) => {
      draft.provenance.prohibitedResolutionObserved = true;
    }],
    ['changed primary source tree', (draft) => { draft.provenance.primaryTreeUnchanged = false; }],
  ]);
});

test('should reject credential-isolation loss, reordering, or merged reporting', () => {
  rejectMutations([
    ['wrong selector', (draft) => { Reflect.set(draft, 'selector', 'p1-admin'); }],
    ['missing feature journey', (draft) => { Reflect.deleteProperty(draft, 'journey'); }],
    ['missing credential isolation', (draft) => { Reflect.deleteProperty(draft, 'credentialIsolation'); }],
    ['missing credential outcome', (draft) => { draft.credentialIsolation.outcomes.pop(); }],
    ['reordered credential outcomes', (draft) => { draft.credentialIsolation.outcomes.reverse(); }],
    ['changed credential outcome', (draft) => {
      draft.credentialIsolation.outcomes[0]!.outcome = 'failure';
    }],
    ['unsafe temporary-home mode', (draft) => {
      draft.credentialIsolation.outcomes[0]!.temporaryHomeMode = 0o755;
    }],
    ['retained temporary credentials', (draft) => {
      draft.credentialIsolation.outcomes[0]!.temporaryResourcesRemoved = false;
    }],
    ['changed caller credential fingerprint', (draft) => {
      draft.credentialIsolation.outcomes[0]!.callerCredentialFingerprintUnchanged = false;
    }],
    ['feature journey before credential isolation', (draft) => {
      draft.credentialIsolation.completedBeforeFeatureJourney = false;
    }],
    ['feature journey counted as credential isolation', (draft) => {
      draft.credentialIsolation.featureJourneyCountedAsCredentialIsolation = true;
    }],
  ]);
});

test('should reject a token that is not the scoped native feature token', () => {
  rejectMutations([
    ['main SDK entry instead of packed Node entry', (draft) => {
      draft.journey.packedSdkEntry = '@portaidentity/sdk';
    }],
    ['wrong credential provider', (draft) => { draft.journey.credentialProvider = 'createTokenAuth'; }],
    ['tenant token endpoint', (draft) => { draft.journey.token.endpointPath = '/alpha/token'; }],
    ['authorization-code grant', (draft) => { draft.journey.token.grantType = 'authorization_code'; }],
    ['missing explicit feature scope', (draft) => { draft.journey.token.requestedScope = 'openid'; }],
    ['feature scope not granted', (draft) => { draft.journey.token.grantedScope = 'openid'; }],
    ['failed token request', (draft) => { draft.journey.token.status = 400; }],
    ['JWT instead of opaque native token', (draft) => { draft.journey.token.format = 'jwt'; }],
    ['non-native token', (draft) => { draft.journey.token.native = false; }],
    ['non-feature token lifetime', (draft) => { draft.journey.token.ttlSeconds = 600; }],
    ['token used another secret', (draft) => {
      draft.journey.token.clientSecretDigest = digestB;
    }],
    ['token not obtained through packed provider', (draft) => {
      draft.journey.token.obtainedThroughPackedProvider = false;
    }],
    ['invitation not authenticated with packed token', (draft) => {
      draft.journey.invitation.authenticatedWithPackedToken = false;
    }],
    ['invitation not executed by packed SDK', (draft) => {
      draft.journey.invitation.usedPackedSdkClient = false;
    }],
    ['replacement secret not used by packed provider', (draft) => {
      draft.journey.replacementSecret.usedByPackedTokenProvider = false;
    }],
  ]);
});

test('should reject missing owned binding or replacement-secret evidence', () => {
  rejectMutations([
    ['replacement instead of initial binding', (draft) => { draft.journey.binding.status = 200; }],
    ['non-human binding actor', (draft) => {
      draft.journey.binding.managementActor = 'service-account';
    }],
    ['client not owned by run', (draft) => { draft.journey.binding.clientOwnedByRun = false; }],
    ['public client', (draft) => { draft.journey.binding.clientConfidential = false; }],
    ['tenant client', (draft) => { draft.journey.binding.clientControlPlane = false; }],
    ['account not owned by run', (draft) => { draft.journey.binding.accountOwnedByRun = false; }],
    ['policy does not target invitation organization', (draft) => {
      draft.journey.binding.policyTargetIncludesInvitationOrganization = false;
    }],
    ['replacement secret response status', (draft) => {
      draft.journey.replacementSecret.status = 200;
    }],
    ['non-human secret generation actor', (draft) => {
      draft.journey.replacementSecret.managementActor = 'service-account';
    }],
    ['secret plaintext retained', (draft) => {
      draft.journey.replacementSecret.plaintextReturnedOnce = false;
    }],
    ['invalid secret digest', (draft) => { draft.journey.replacementSecret.secretDigest = 'defect'; }],
    ['pre-binding secrets not retired', (draft) => {
      draft.journey.replacementSecret.preBindingSecretsRetired = false;
    }],
  ]);
});

test('should reject a non-allowlisted or non-durable invitation', () => {
  rejectMutations([
    ['rejected invitation', (draft) => { draft.journey.invitation.status = 403; }],
    ['wrong invitation method', (draft) => { draft.journey.invitation.method = 'PUT'; }],
    ['wrong invitation endpoint', (draft) => {
      draft.journey.invitation.pathTemplate = '/api/admin/organizations/:orgId/users';
    }],
    ['control-plane target', (draft) => {
      draft.journey.invitation.targetOrganizationOrdinary = false;
    }],
    ['unlisted target organization', (draft) => {
      draft.journey.invitation.targetOrganizationAllowlisted = false;
    }],
    ['target not owned by fixture', (draft) => {
      draft.journey.invitation.targetOwnedByFixture = false;
    }],
    ['unlisted role or claim assignment', (draft) => {
      draft.journey.invitation.requestedAssignmentsAllowlisted = false;
    }],
    ['invitation not created', (draft) => { draft.journey.invitation.created = false; }],
    ['invalid delivery outcome', (draft) => {
      Reflect.set(draft.journey.invitation, 'deliveryOutcome', 'cancelled');
    }],
    ['client output treated as durable state', (draft) => {
      draft.journey.durableInvitation.observedIndependently = false;
    }],
    ['wrong durable observation source', (draft) => {
      draft.journey.durableInvitation.independentSource = 'packed-client-output';
    }],
    ['durable invitation absent', (draft) => { draft.journey.durableInvitation.exists = false; }],
    ['durable row for another target', (draft) => {
      draft.journey.durableInvitation.targetDigest = digestB;
    }],
    ['wrong durable invitation status', (draft) => {
      draft.journey.durableInvitation.status = 'accepted';
    }],
    ['no durable invitation count', (draft) => {
      draft.journey.durableInvitation.invitationCountAfterCreate = 0;
    }],
    ['eager user created', (draft) => { draft.journey.durableInvitation.eagerUserCreated = true; }],
    ['invalid durable record digest', (draft) => {
      draft.journey.durableInvitation.recordDigest = 'defect';
    }],
  ]);
});

test('should reject missing or ineffective post-revocation denial', () => {
  rejectMutations([
    ['failed binding revocation', (draft) => { draft.journey.revocation.status = 200; }],
    ['wrong revocation actor', (draft) => {
      draft.journey.revocation.managementActor = 'service-account';
    }],
    ['binding still active', (draft) => { draft.journey.revocation.bindingStatusAfter = 'active'; }],
    ['different token used after revocation', (draft) => {
      draft.journey.postRevocation.usedPreviouslyIssuedToken = false;
    }],
    ['invitation accepted after revocation', (draft) => {
      draft.journey.postRevocation.invitationStatus = 201;
    }],
    ['denied flag contradicts status', (draft) => {
      draft.journey.postRevocation.invitationDenied = false;
    }],
    ['unexpected denial status', (draft) => {
      draft.journey.postRevocation.invitationStatus = 500;
    }],
    ['post-revocation attempt used another target', (draft) => {
      draft.journey.postRevocation.targetDigest = digestB;
    }],
    ['new invitation created after revocation', (draft) => {
      draft.journey.postRevocation.invitationCountAfterAttempt = 2;
    }],
    ['durable invitation changed after denied attempt', (draft) => {
      draft.journey.postRevocation.recordDigest = digestA;
    }],
  ]);
});

test('should reject incomplete cleanup or modified unrelated installation', () => {
  rejectMutations([
    ['failed terminal outcome', (draft) => { draft.cleanup.terminalOutcome = 'failure'; }],
    ['owned fixture data retained', (draft) => { draft.cleanup.ownedFixtureDataRemoved = false; }],
    ['consumer retained', (draft) => { draft.cleanup.consumerRemoved = false; }],
    ['build worktree retained', (draft) => { draft.cleanup.buildWorktreeRemoved = false; }],
    ['secret material retained', (draft) => { draft.cleanup.secretMaterialRemoved = false; }],
    ['temporary credentials retained', (draft) => {
      draft.cleanup.temporaryCredentialMaterialRemoved = false;
    }],
    ['caller credential changed', (draft) => {
      draft.cleanup.callerCredentialFingerprintUnchanged = false;
    }],
    ['unrelated installation changed', (draft) => {
      draft.cleanup.unrelatedInstallationUnchanged = false;
    }],
    ['owned residue remains', (draft) => {
      draft.cleanup.residuePaths = ['compat-runtime-or-child'];
    }],
    ['product failure cannot hide failed cleanup', (draft) => {
      draft.journey.postRevocation.invitationStatus = 201;
      draft.journey.postRevocation.invitationDenied = false;
      draft.journey.outcome = 'product-failure';
      draft.cleanup.secretMaterialRemoved = false;
    }],
  ]);
});

test('should admit truthful product failure but reject mislabeled outcomes', () => {
  // A revocation that fails to deny the old token is a product failure. The oracle must admit that
  // truthful failure so the command can report the registered product exit.
  const productFailure = evidenceWith((draft) => {
    draft.journey.postRevocation.invitationStatus = 201;
    draft.journey.postRevocation.invitationDenied = false;
    draft.journey.postRevocation.invitationCountAfterAttempt = 2;
    draft.journey.outcome = 'product-failure';
  });
  assert.deepEqual(
    validatePackedServiceAccountInvitationEvidence(productFailure),
    productFailure,
  );

  // Passing observations cannot be relabeled as a product failure to manufacture another exit.
  assert.throws(() =>
    validatePackedServiceAccountInvitationEvidence(
      evidenceWith((draft) => {
        draft.journey.outcome = 'product-failure';
      }),
    ),
  );

  // A failed observation cannot be relabeled as passed.
  assert.throws(() =>
    validatePackedServiceAccountInvitationEvidence(
      evidenceWith((draft) => {
        draft.journey.postRevocation.invitationStatus = 201;
        draft.journey.postRevocation.invitationDenied = false;
        draft.journey.outcome = 'passed';
      }),
    ),
  );

  // No unsupported outcome class is admitted in place of the two observed classes.
  assert.throws(() =>
    validatePackedServiceAccountInvitationEvidence(
      evidenceWith((draft) => {
        Reflect.set(draft.journey, 'outcome', 'incomplete');
      }),
    ),
  );
});

test('should reject evidence that retains secret material', () => {
  rejectMutations([
    ['top-level access token', (draft) => {
      Reflect.set(draft, 'accessToken', 'synthetic-secret-value');
    }],
    ['journey access token', (draft) => {
      Reflect.set(draft.journey, 'accessToken', 'synthetic-secret-value');
    }],
    ['token endpoint response body', (draft) => {
      Reflect.set(draft.journey.token, 'rawResponse', 'synthetic-secret-value');
    }],
    ['replacement secret plaintext', (draft) => {
      Reflect.set(draft.journey.replacementSecret, 'plaintextSecret', 'synthetic-secret-value');
    }],
    ['invitation token', (draft) => {
      Reflect.set(draft.journey.invitation, 'invitationToken', 'synthetic-secret-value');
    }],
  ]);
});
