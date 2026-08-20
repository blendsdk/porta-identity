import type {
  FaultCatalogCampaignArtifact,
  FaultCatalogCampaignContract,
} from './fault-catalog-campaign-contract.js';
import {
  aggregateFaultCatalogSelector,
  classifyFaultCatalogCampaignExit,
  expandFaultCatalogCampaign,
  faultCatalogCampaignBaselineFixture,
  faultCatalogCampaignFixture,
  faultCatalogCampaignRetainedFields,
} from './fault-catalog-campaign-requirements.js';

/** Builds requirement-owned contract data without contacting Git or executing a fault. */
function requirementArtifact(): FaultCatalogCampaignArtifact {
  const tuples = expandFaultCatalogCampaign(faultCatalogCampaignFixture).map((tuple) => {
    const classification =
      tuple.sentinelId === 'ST-64' || tuple.sentinelId === 'ST-68A'
        ? ('invalid' as const)
        : tuple.sentinelId === 'ST-65'
          ? ('infrastructure-failed' as const)
          : tuple.sentinelId === 'ST-67'
            ? ('survived' as const)
            : ('killed' as const);
    return {
      identity: tuple.identity,
      ordinal: tuple.ordinal,
      executionStatus: 'completed' as const,
      classification,
      notRunReason: null,
      exactSignatureObserved: classification === 'killed',
      killedClaimIds: classification === 'killed' ? [tuple.claimId] : [],
      blockedClaimIds: classification === 'survived' ? [tuple.claimId] : [],
      freshDetachedWorktree: tuple.sentinelId !== 'ST-68A',
      primaryTreeUnchanged: true,
      ownedResourcesRemovedOrRecovered: true,
    };
  });
  const exitCode = classifyFaultCatalogCampaignExit({
    cleanupOrTreeDrift: false,
    signal: null,
    timedOut: false,
    invalid: tuples.some((tuple) => tuple.classification === 'invalid'),
    infrastructureFailed: tuples.some((tuple) => tuple.classification === 'infrastructure-failed'),
    survived: tuples.some((tuple) => tuple.classification === 'survived'),
  });
  return {
    schemaVersion: 1,
    selector: aggregateFaultCatalogSelector,
    catalogDigest: faultCatalogCampaignFixture.digest,
    baseline: faultCatalogCampaignBaselineFixture,
    tuples,
    exitCode,
    terminalReason: 'REQUIREMENT_FIXTURE_CLASSIFIED',
    artifactMode: 0o600,
    atomicWrite: true,
    primaryTreeUnchanged: true,
    ownedResourcesRemovedOrRecovered: true,
    ownedResourceCleanup: {
      worktree: 'removed',
      build: 'removed',
      image: 'removed',
      stack: 'removed',
      evidence: 'removed',
    },
    retainedFieldNames: faultCatalogCampaignRetainedFields,
  };
}

/**
 * Returns a requirements-only adapter used to verify aggregate contract semantics.
 *
 * Live execution is owned by the closed root fault command; this adapter cannot access Git,
 * processes, Docker, or result directories and therefore cannot be used as evidence.
 */
export function createFaultCatalogCampaignContract(): FaultCatalogCampaignContract {
  return {
    async execute() {
      return requirementArtifact();
    },
  };
}
