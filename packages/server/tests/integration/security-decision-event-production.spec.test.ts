/** Execute the immutable terminal-decision oracle only in the service-backed integration project. */
process.env.PORTA_SECURITY_DECISION_SPEC_REQUIRED = '1';

await import('../unit/security/security-decision-event.spec.test.js');
