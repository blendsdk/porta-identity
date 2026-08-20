import type { FaultCatalogCampaignContract } from './fault-catalog-campaign-contract.js';

/** Exact marker emitted until the aggregate campaign capability exists. */
export const faultCatalogCampaignMissingMarker =
  'FAULT_CATALOG_CAMPAIGN_CAPABILITY_MISSING' as const;

/** Returns the aggregate campaign adapter or fails closed while it is unavailable. */
export function createFaultCatalogCampaignContract(): FaultCatalogCampaignContract {
  throw new Error(faultCatalogCampaignMissingMarker);
}
