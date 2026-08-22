import type {
  HumanAuthCaseObservation,
  HumanAuthCaseRequirement,
  HumanAuthCasesContract,
  HumanAuthStepObservation,
  HumanAuthStepRequirement,
} from './human-auth-cases-contract.js';

/**
 * Transparent requirements-only executor for immutable human-authentication specifications.
 *
 * It never contacts Porta and is never product evidence. A future live implementation may replace
 * this delegate behind the stable contract without changing the specifications.
 */
export function createHumanAuthCasesSpecRig(): HumanAuthCasesContract {
  return Object.freeze({
    observeCase: async (requirement: HumanAuthCaseRequirement) => observeCase(requirement),
  });
}

function observeStep(
  requirement: HumanAuthCaseRequirement,
  step: HumanAuthStepRequirement,
): HumanAuthStepObservation {
  const isProbe = step.controlId !== undefined;
  return Object.freeze({
    id: step.id,
    boundary: step.boundary,
    action: step.action,
    target: step.target,
    facts: Object.freeze({ ...step.expectedFacts }),
    publicResponse:
      step.expectedPublicResponse === null
        ? null
        : Object.freeze({ ...step.expectedPublicResponse }),
    prohibitedSideEffects: Object.freeze(
      Object.fromEntries(requirement.prohibitedSideEffects.map((effect) => [effect, false])),
    ),
    protectedStateUnchanged: Object.freeze(
      Object.fromEntries(requirement.protectedStateKeys.map((key) => [key, true])),
    ),
    securityLog: isProbe
      ? Object.freeze({
          event: requirement.requiredLogEvent,
          fields: Object.freeze([...requirement.requiredLogFields]),
          forbiddenValueObserved: false,
        })
      : null,
    recoveryObserved: isProbe ? requirement.recoveryExpectation : null,
  });
}

function observeCase(requirement: HumanAuthCaseRequirement): HumanAuthCaseObservation {
  return Object.freeze({
    sentinelId: requirement.sentinelId,
    controls: Object.freeze(requirement.controls.map((step) => observeStep(requirement, step))),
    probes: Object.freeze(requirement.probes.map((step) => observeStep(requirement, step))),
  });
}
