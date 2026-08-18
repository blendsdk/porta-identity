import { createOidcTokenCasesSpecRig } from './oidc-token-cases-spec-rig.js';

import type { OidcTokenCasesContract } from './oidc-token-cases-contract.js';

/**
 * Creates the stable adapter consumed by immutable protocol specifications.
 *
 * The default requirements rig is transparent and non-evidentiary. Live mode fails closed until a
 * black-box HTTP and independent JOSE observations are supplied behind this interface.
 */
export function createOidcTokenCasesContract(): OidcTokenCasesContract {
  const mode = process.env.PORTA_ASSURANCE_PROTOCOL_ADAPTER ?? 'spec-rig';
  if (mode === 'live') throw new Error('OIDC_TOKEN_LIVE_ADAPTER_UNAVAILABLE');
  if (mode !== 'spec-rig') throw new Error('unsupported OIDC/token adapter mode');
  return createOidcTokenCasesSpecRig();
}
