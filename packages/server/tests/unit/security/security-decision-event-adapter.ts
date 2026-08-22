import {
  SECURITY_DECISION_EVENT_CAPABILITY_MISSING,
  type SecurityDecisionEventCapability,
} from './security-decision-event-contract.js';

/** Return a fail-closed seam until production middleware and owned observers are connected. */
export function getSecurityDecisionEventCapability(): SecurityDecisionEventCapability {
  return Object.freeze({
    available: false,
    reason: SECURITY_DECISION_EVENT_CAPABILITY_MISSING,
  });
}
