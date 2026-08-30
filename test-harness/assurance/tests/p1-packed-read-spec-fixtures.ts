import type {
  PackedP1ReadEvidence,
  PackedP1ReadJourneyEvidence,
  PackedP1ReadResultObservation,
} from './p1-packed-read-contract.js';
import { packedP1ReadRequirements } from './p1-packed-read-requirements.js';

const digestA = 'a'.repeat(64);
const digestB = 'b'.repeat(64);

/** Creates one deterministic client/raw result for validator semantics. */
function result(identity: string): PackedP1ReadResultObservation {
  return {
    result: 'allowed',
    status: 200,
    orderedItemIdentities: [identity],
    observedTotal: 1,
    pageOrFilterMetadataDigest: `sha256:${digestA}`,
    publicFieldDigest: `sha256:${digestB}`,
  };
}

/** Expands one immutable requirement into a complete synthetic validator fixture. */
function journey(
  requirement: (typeof packedP1ReadRequirements)[number],
): PackedP1ReadJourneyEvidence {
  const identity =
    requirement.surface === 'tenant-session-page'
      ? `sha256:${digestB}`
      : `fixture-resolved:${requirement.id}`;
  const state = Object.fromEntries(
    requirement.stateFingerprintKeys.map((key) => [key, `sha256:${digestA}`]),
  );
  return {
    requirementId: requirement.id,
    client: requirement.client,
    clientResult: result(identity),
    independentRawResult: result(identity),
    outcome: 'passed',
    fixtureOracleSatisfied: true,
    fixtureResolvedIdentities: [identity],
    fixtureExpectedTotal: 1,
    stateFingerprintsBefore: state,
    stateFingerprintsAfter: { ...state },
    forbiddenOutputObserved: Object.fromEntries(
      requirement.forbiddenOutputClasses.map((key) => [key, false]),
    ),
    ...(requirement.client === 'cli'
      ? {
          cliIsolation: {
            temporaryHomeMode: 0o700,
            temporaryHomeRemoved: true,
            callerCredentialFingerprintUnchanged: true,
          },
        }
      : {}),
  };
}

/**
 * Returns complete requirement-owned data for validator semantics only.
 *
 * This fixture is synthetic and cannot substantiate a Porta or packed-client claim.
 */
export function completePackedP1ReadEvidence(): PackedP1ReadEvidence {
  return {
    version: 1,
    provenance: {
      nodeVersion: 'v24.0.0',
      nodeExecutableSha256: digestA,
      sourceRevision: 'c'.repeat(40),
      serverImageDigest: `sha256:${digestB}`,
      fixtureManifestDigest: `sha256:${digestA}`,
      packageNames: ['@portaidentity/sdk', '@portaidentity/cli'],
      packageVersions: {
        '@portaidentity/sdk': '0.0.0-fixture',
        '@portaidentity/cli': '0.0.0-fixture',
      },
      archiveSha256: { '@portaidentity/sdk': digestA, '@portaidentity/cli': digestB },
      dependencySpecifiers: {
        '@portaidentity/sdk': 'file:portaidentity-sdk.tgz',
        '@portaidentity/cli': 'file:portaidentity-cli.tgz',
      },
      compiledEntrypoints: ['@portaidentity/sdk/dist/index.js', '@portaidentity/cli/dist/index.js'],
      resolvedContentDigestsMatchArchives: true,
      prohibitedResolutionObserved: false,
      primaryTreeUnchanged: true,
    },
    journeys: packedP1ReadRequirements.map(journey),
    cleanup: {
      terminalOutcome: 'success',
      callerCredentialFingerprintUnchanged: true,
      temporaryCredentialsRemoved: true,
      temporaryHomesRemoved: true,
      consumerRemoved: true,
      cacheRemoved: true,
      evidenceSecretsRemoved: true,
      residuePaths: [],
    },
    correlatedLogEvidenceCollected: false,
  };
}
