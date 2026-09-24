import { createHumanAuthCasesSpecRig } from './human-auth-cases-spec-rig.js';
import { createHumanAuthRecoveryContract } from './human-auth-recovery-live-adapter.js';

import type { HumanAuthCasesContract } from './human-auth-cases-contract.js';

/**
 * Creates the stable adapter consumed by immutable human-authentication specifications.
 *
 * The default `spec-rig` mode returns the requirements-only rig. The `live` mode returns the real
 * delivered-artifact adapter, which fails closed for any sentinel it cannot observe; no mode ever
 * mixes synthetic and live evidence.
 */
export function createHumanAuthCasesContract(): HumanAuthCasesContract {
  const mode = process.env.PORTA_ASSURANCE_HUMAN_AUTH_ADAPTER ?? 'spec-rig';
  if (mode === 'live') return createHumanAuthRecoveryContract();
  if (mode !== 'spec-rig') throw new Error('unsupported human-authentication adapter mode');
  return createHumanAuthCasesSpecRig();
}
