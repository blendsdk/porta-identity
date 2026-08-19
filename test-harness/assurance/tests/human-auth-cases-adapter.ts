import { createHumanAuthCasesSpecRig } from './human-auth-cases-spec-rig.js';

import type { HumanAuthCasesContract } from './human-auth-cases-contract.js';

/** Creates the stable adapter consumed by immutable human-authentication specifications. */
export function createHumanAuthCasesContract(): HumanAuthCasesContract {
  const mode = process.env.PORTA_ASSURANCE_HUMAN_AUTH_ADAPTER ?? 'spec-rig';
  if (mode === 'live') throw new Error('HUMAN_AUTH_LIVE_ADAPTER_UNAVAILABLE');
  if (mode !== 'spec-rig') throw new Error('unsupported human-authentication adapter mode');
  return createHumanAuthCasesSpecRig();
}
