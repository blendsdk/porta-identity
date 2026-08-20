import type { PackedP1ReadClient } from './p1-packed-read-requirements.js';

/** Broad result from one packed client or independent raw read. */
export interface PackedP1ReadResultObservation {
  /** Public outcome classified from the actual response. */
  readonly result: 'allowed' | 'forbidden' | 'not-found' | 'unexpected-error';
  /** Actual public status represented by the observation. */
  readonly status: number;
  /** Stable ordered identities returned by the selected page or filter. */
  readonly orderedItemIdentities: readonly string[];
  /** Digest of the observed page and filter metadata. */
  readonly pageOrFilterMetadataDigest: string;
  /** Digest of the bounded public fields returned for all selected items. */
  readonly publicFieldDigest: string;
}

/** One client result paired with independent raw, fixture, state, and output observations. */
export interface PackedP1ReadJourneyEvidence {
  /** Stable requirement executed by the journey. */
  readonly requirementId: string;
  /** Locally packed public client that executed the request. */
  readonly client: PackedP1ReadClient;
  /** Result observed through the packed public client. */
  readonly clientResult: PackedP1ReadResultObservation;
  /** Result independently observed through raw HTTP. */
  readonly independentRawResult: PackedP1ReadResultObservation;
  /** Whether runtime fixture ownership and masking facts were satisfied. */
  readonly fixtureOracleSatisfied: boolean;
  /** Independently resolved identities expected in the client result. */
  readonly fixtureResolvedIdentities: readonly string[];
  /** Protected-state fingerprints captured before the client read. */
  readonly stateFingerprintsBefore: Readonly<Record<string, string>>;
  /** Protected-state fingerprints captured after the client read. */
  readonly stateFingerprintsAfter: Readonly<Record<string, string>>;
  /** Closed forbidden-output classes and whether each was observed. */
  readonly forbiddenOutputObserved: Readonly<Record<string, boolean>>;
  /** CLI-only temporary-home and caller-credential isolation facts. */
  readonly cliIsolation?: {
    /** Exact owner-only mode applied to the temporary home. */
    readonly temporaryHomeMode: number;
    /** Whether the temporary home was removed. */
    readonly temporaryHomeRemoved: boolean;
    /** Whether the caller's real credential fingerprint stayed unchanged. */
    readonly callerCredentialFingerprintUnchanged: boolean;
  };
}

/** Exact run provenance bound before packed public-client journeys execute. */
export interface PackedP1ReadProvenanceEvidence {
  /** Exact Node version used to execute the packed clients. */
  readonly nodeVersion: string;
  /** SHA-256 of the Node executable bytes. */
  readonly nodeExecutableSha256: string;
  /** Clean source revision shared by server and package builds. */
  readonly sourceRevision: string;
  /** Exact owned Porta image digest. */
  readonly serverImageDigest: string;
  /** Digest of the deterministic fixture manifest. */
  readonly fixtureManifestDigest: string;
  /** Exact locally packed package pair. */
  readonly packageNames: readonly string[];
  /** Package versions read from locally packed metadata. */
  readonly packageVersions: Readonly<Record<string, string>>;
  /** Archive-byte digests keyed by package name. */
  readonly archiveSha256: Readonly<Record<string, string>>;
  /** Exact local file dependency specifiers used by the consumer. */
  readonly dependencySpecifiers: Readonly<Record<string, string>>;
  /** Canonical compiled entrypoints loaded by the consumer. */
  readonly compiledEntrypoints: readonly string[];
  /** Whether resolved package content equals the prepared local archives. */
  readonly resolvedContentDigestsMatchArchives: boolean;
  /** Whether any registry, workspace, source, alias, or symlink escape was seen. */
  readonly prohibitedResolutionObserved: boolean;
  /** Whether primary source provenance stayed unchanged throughout the run. */
  readonly primaryTreeUnchanged: boolean;
}

/** Cleanup facts for the single terminal outcome that actually occurred. */
export interface PackedP1ReadCleanupEvidence {
  /** Single terminal outcome that actually occurred. */
  readonly terminalOutcome: 'success' | 'failure' | 'timeout' | 'sigint' | 'sigterm';
  /** Whether the caller's real credential fingerprint stayed unchanged. */
  readonly callerCredentialFingerprintUnchanged: boolean;
  /** Whether every generated credential file was removed. */
  readonly temporaryCredentialsRemoved: boolean;
  /** Whether every generated temporary home was removed. */
  readonly temporaryHomesRemoved: boolean;
  /** Whether the generated packed consumer was removed. */
  readonly consumerRemoved: boolean;
  /** Whether the generated install cache was removed. */
  readonly cacheRemoved: boolean;
  /** Whether every transient secret-bearing evidence file was removed. */
  readonly evidenceSecretsRemoved: boolean;
  /** Sanitized owned residue remaining after cleanup. */
  readonly residuePaths: readonly string[];
}

/** Complete versioned evidence document accepted by the future capability validator. */
export interface PackedP1ReadEvidence {
  /** Evidence schema version. */
  readonly version: 1;
  /** Server, source, runtime, archive, and resolution provenance. */
  readonly provenance: PackedP1ReadProvenanceEvidence;
  /** Complete exact six-journey evidence matrix. */
  readonly journeys: readonly PackedP1ReadJourneyEvidence[];
  /** Cleanup facts for the actual run outcome. */
  readonly cleanup: PackedP1ReadCleanupEvidence;
  /** Must remain false while correlated decision events are unavailable. */
  readonly correlatedLogEvidenceCollected: boolean;
}
