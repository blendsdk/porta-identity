import {
  MAGIC_LINK_LIVE_AUTHORITY_CORRECTION_CAPABILITY_MISSING,
  type MagicLinkLiveAuthorityCorrectionCapability,
} from './magic-link-live-authority-correction-contract.js';

/** Return the fail-closed seam until the service-backed correction driver is implemented. */
export function getMagicLinkLiveAuthorityCorrectionCapability(): MagicLinkLiveAuthorityCorrectionCapability {
  return {
    available: false,
    reason: MAGIC_LINK_LIVE_AUTHORITY_CORRECTION_CAPABILITY_MISSING,
  };
}
