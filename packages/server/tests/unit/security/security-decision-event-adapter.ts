import {
  SECURITY_DECISION_EVENT_CAPABILITY_MISSING,
  type SecurityDecisionEventCapability,
} from './security-decision-event-contract.js';
import { ProductionSecurityDecisionEventDriver } from './security-decision-event-production-driver.js';

/** Return a fail-closed seam until production middleware and owned observers are connected. */
export function getSecurityDecisionEventCapability(): SecurityDecisionEventCapability {
  if (process.env.PORTA_SECURITY_DECISION_SPEC_REQUIRED === '1') {
    return Object.freeze({
      available: true,
      evidenceBoundary: 'production-middleware-and-owned-observers',
      createDriver: async () => new ProductionSecurityDecisionEventDriver(),
    });
  }
  return Object.freeze({
    available: false,
    reason: SECURITY_DECISION_EVENT_CAPABILITY_MISSING,
  });
}
