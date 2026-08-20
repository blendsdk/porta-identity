/** Exact selector that alone admits an aggregate fault-catalog campaign. */
export interface FaultCatalogCampaignSelector {
  readonly fault: string;
  readonly claim: string;
  readonly sentinel: string;
}

/** One claim-specific exact sentinel tuple declared by a curated fault. */
export interface FaultCatalogCampaignTuple {
  readonly claimId: string;
  readonly sentinelId: string;
  readonly expectedSignature: string;
}

/** Curated fault metadata required before one tuple may run. */
export interface FaultCatalogCampaignFault {
  readonly id: string;
  readonly targetRevision: string;
  readonly targetPath: string;
  readonly targetHash: string;
  readonly patchPath: string;
  readonly buildCommandId: string;
  readonly executionCommandId: string;
  readonly tuples: readonly FaultCatalogCampaignTuple[];
}

/** Validated immutable catalog snapshot used for the entire campaign. */
export interface FaultCatalogCampaignCatalog {
  readonly version: 1;
  readonly digest: string;
  readonly faults: readonly FaultCatalogCampaignFault[];
}

/** Clean source and tool identities captured once before tuple expansion. */
export interface FaultCatalogCampaignBaseline {
  readonly commit: string;
  readonly treeDigest: string;
  readonly toolchainDigest: string;
  readonly catalogDigest: string;
  readonly clean: boolean;
}

/** Deterministic globally unique unit of aggregate execution. */
export interface FaultCatalogCampaignTuplePlan extends FaultCatalogCampaignTuple {
  readonly identity: string;
  readonly ordinal: number;
  readonly faultId: string;
  readonly targetRevision: string;
  readonly targetPath: string;
  readonly targetHash: string;
  readonly patchPath: string;
  readonly buildCommandId: string;
  readonly executionCommandId: string;
  readonly executionIsolation: 'fresh-detached-worktree';
}

/** Classified outcome for one completed tuple or explicit unattempted tuple. */
export interface FaultCatalogCampaignTupleEntry {
  readonly identity: string;
  readonly ordinal: number;
  readonly executionStatus: 'completed' | 'not-run';
  readonly classification:
    'killed' | 'survived' | 'invalid' | 'infrastructure-failed' | 'timeout' | null;
  readonly notRunReason: string | null;
  readonly exactSignatureObserved: boolean;
  readonly killedClaimIds: readonly string[];
  readonly blockedClaimIds: readonly string[];
  readonly freshDetachedWorktree: boolean;
  readonly primaryTreeUnchanged: boolean;
  readonly ownedResourcesRemovedOrRecovered: boolean;
}

/** Sanitized single-artifact result of an aggregate catalog campaign. */
export interface FaultCatalogCampaignArtifact {
  readonly schemaVersion: 1;
  readonly selector: FaultCatalogCampaignSelector;
  readonly catalogDigest: string;
  readonly baseline: FaultCatalogCampaignBaseline;
  readonly tuples: readonly FaultCatalogCampaignTupleEntry[];
  readonly exitCode: 0 | 21 | 30 | 50 | 60 | 70 | 130 | 143;
  readonly terminalReason: string;
  readonly artifactMode: 0o600;
  readonly atomicWrite: boolean;
  readonly primaryTreeUnchanged: boolean;
  readonly ownedResourcesRemovedOrRecovered: boolean;
  readonly ownedResourceCleanup: Readonly<
    Record<
      'worktree' | 'build' | 'image' | 'stack' | 'evidence',
      'removed' | 'exactly-recovered' | 'recovery-required'
    >
  >;
  /** Bounded repository-relative cleanup command when automatic recovery is incomplete. */
  readonly recoveryCommand?: string;
  readonly retainedFieldNames: readonly string[];
}

/** Complete request accepted by the future aggregate campaign capability. */
export interface FaultCatalogCampaignRequest {
  readonly selector: FaultCatalogCampaignSelector;
}

/** Stable execution seam implemented by the aggregate campaign owner. */
export interface FaultCatalogCampaignContract {
  /** Executes one exact aggregate request and returns its complete sanitized accounting. */
  execute(request: FaultCatalogCampaignRequest): Promise<FaultCatalogCampaignArtifact>;
}
