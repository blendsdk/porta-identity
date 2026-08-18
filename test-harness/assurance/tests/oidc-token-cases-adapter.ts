import { createOidcTokenCasesSpecRig } from './oidc-token-cases-spec-rig.js';
import { createOidcTokenCasesLiveAdapter } from './oidc-token-cases-live.js';

import type { OidcTokenCasesContract } from './oidc-token-cases-contract.js';

let liveAdapterCreated = false;

/**
 * Creates the stable adapter consumed by immutable protocol specifications.
 *
 * The default requirements rig is transparent and non-evidentiary. Live mode fails closed until a
 * black-box HTTP and independent JOSE observations are supplied behind this interface.
 */
export function createOidcTokenCasesContract(): OidcTokenCasesContract {
  const mode = process.env.PORTA_ASSURANCE_PROTOCOL_ADAPTER ?? 'spec-rig';
  if (mode === 'live') {
    if (
      process.env.HARNESS_RUN_ID === undefined ||
      process.env.PORTA_ENDPOINT_MANIFEST === undefined ||
      process.env.HARNESS_FIXTURE_MANIFEST === undefined
    ) {
      throw new Error('OIDC_TOKEN_LIVE_ADAPTER_UNAVAILABLE');
    }
    if (liveAdapterCreated) throw new Error('OIDC_TOKEN_LIVE_ADAPTER_UNAVAILABLE');
    liveAdapterCreated = true;
    return createOidcTokenCasesLiveAdapter();
  }
  if (mode !== 'spec-rig') throw new Error('unsupported OIDC/token adapter mode');
  return createOidcTokenCasesSpecRig();
}
