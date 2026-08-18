import { createProtocolInterleavingSpecRig } from './protocol-interleaving-spec-rig.js';

import type { ProtocolInterleavingContract } from './protocol-interleaving-contract.js';

/** Stable adapter for immutable interleaving specs; live execution remains unavailable. */
export function createProtocolInterleavingContract(): ProtocolInterleavingContract {
  const mode = process.env.PORTA_ASSURANCE_INTERLEAVING_ADAPTER ?? 'spec-rig';
  if (mode === 'live') throw new Error('PROTOCOL_INTERLEAVING_LIVE_UNAVAILABLE');
  if (mode !== 'spec-rig') throw new Error('unsupported protocol interleaving adapter mode');
  return createProtocolInterleavingSpecRig();
}
