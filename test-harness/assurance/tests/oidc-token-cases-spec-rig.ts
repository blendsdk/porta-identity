import type {
  OidcTokenCasesContract,
  ProtocolCaseObservation,
  ProtocolCaseRequirement,
  ProtocolStepObservation,
  ProtocolStepRequirement,
} from './oidc-token-cases-contract.js';

/**
 * Requirements-only executor for immutable protocol specifications.
 *
 * It never contacts Porta and is not product evidence. A future live adapter must replace this
 * delegate behind the stable contract without changing the specifications.
 */
export function createOidcTokenCasesSpecRig(): OidcTokenCasesContract {
  return Object.freeze({
    observeCase: async (requirement: ProtocolCaseRequirement) => observeCase(requirement),
  });
}

/** Mirrors one requirement step so specification structure can be checked without product evidence. */
function observeStep(
  requirement: ProtocolCaseRequirement,
  step: ProtocolStepRequirement,
): ProtocolStepObservation {
  return Object.freeze({
    id: step.id,
    transport: step.transport,
    boundary: step.boundary,
    facts: Object.freeze({ ...step.expectedFacts }),
    prohibitedSideEffects: Object.freeze(
      Object.fromEntries(requirement.prohibitedSideEffects.map((effect) => [effect, false])),
    ),
    securityLog:
      step.controlId === undefined
        ? null
        : Object.freeze({
            event: requirement.requiredLogEvent,
            fields: Object.freeze([...requirement.requiredLogFields]),
          }),
    recoveryObserved: step.controlId === undefined ? null : requirement.recoveryExpectation,
  });
}

/** Mirrors one complete case while preserving the stable observation contract. */
function observeCase(requirement: ProtocolCaseRequirement): ProtocolCaseObservation {
  return Object.freeze({
    sentinelId: requirement.sentinelId,
    controls: Object.freeze(
      requirement.controls.map((control) => observeStep(requirement, control)),
    ),
    probes: Object.freeze(requirement.probes.map((probe) => observeStep(requirement, probe))),
  });
}
