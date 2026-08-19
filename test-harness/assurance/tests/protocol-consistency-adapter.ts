import { createProtocolConsistencySpecRig } from './protocol-consistency-spec-rig.js';

import type { ProtocolConsistencyContract } from './protocol-consistency-contract.js';

/** Stable adapter for defensive single-use consistency specs; live execution remains unavailable. */
export function createProtocolConsistencyContract(): ProtocolConsistencyContract {
  const mode = process.env.PORTA_ASSURANCE_PROTOCOL_CONSISTENCY_ADAPTER ?? 'spec-rig';
  if (mode === 'live') throw new Error('PROTOCOL_CONSISTENCY_LIVE_UNAVAILABLE');
  if (mode !== 'spec-rig') throw new Error('unsupported protocol consistency adapter mode');
  return createProtocolConsistencySpecRig();
}
