import type {
  ControlSensitivityOutcome,
  ControlSensitivityResult,
  ControlSensitivityRuntime,
  ControlSensitivityStage,
  ControlSensitivityStageObservation,
  TenantAdminControlCheckDefinition,
} from './model.js';

/** Maps a failed stage onto the stable defensive control-check vocabulary. */
function failedOutcome(
  stage: ControlSensitivityStage,
  observation: ControlSensitivityStageObservation,
): ControlSensitivityOutcome {
  if (observation.status === 'timed-out') return 'timed-out';
  return stage === 'validation' || stage === 'variant' || stage === 'build'
    ? 'check-invalid'
    : 'environment-failed';
}

/** Executes one selected local control check with unconditional cleanup precedence. */
export async function executeControlSensitivityCheck(
  definition: TenantAdminControlCheckDefinition,
  runtime: ControlSensitivityRuntime,
  interruption: () => 'SIGINT' | 'SIGTERM' | undefined = () => undefined,
): Promise<ControlSensitivityResult> {
  const stages: readonly [
    ControlSensitivityStage,
    (entry: TenantAdminControlCheckDefinition) => Promise<ControlSensitivityStageObservation>,
  ][] = [
    ['validation', runtime.validate.bind(runtime)],
    ['variant', runtime.prepareVariant.bind(runtime)],
    ['build', runtime.build.bind(runtime)],
    ['startup', runtime.start.bind(runtime)],
    ['fixture', runtime.verifyFixture.bind(runtime)],
  ];
  let primary: Omit<ControlSensitivityResult, 'cleanupComplete' | 'provenance'> = {
    id: definition.id,
    outcome: 'check-invalid',
    stage: 'validation',
  };
  try {
    for (const [stage, execute] of stages) {
      const pendingSignal = interruption();
      if (pendingSignal !== undefined) {
        primary = {
          id: definition.id,
          outcome: 'environment-failed',
          stage,
          terminalSignal: pendingSignal,
        };
        return await finalize(definition, runtime, primary);
      }
      const observation = await execute(definition);
      if (observation.forwardedSignal !== undefined) {
        primary = {
          id: definition.id,
          outcome: 'environment-failed',
          stage,
          terminalSignal: observation.forwardedSignal,
        };
        return await finalize(definition, runtime, primary);
      }
      if (observation.status !== 'passed') {
        primary = { id: definition.id, outcome: failedOutcome(stage, observation), stage };
        return await finalize(definition, runtime, primary);
      }
    }
    const pendingSignal = interruption();
    const check =
      pendingSignal === undefined
        ? await runtime.runCheck(definition)
        : ({ status: 'failed', forwardedSignal: pendingSignal } as const);
    if (check.forwardedSignal !== undefined) {
      primary = {
        id: definition.id,
        outcome: 'environment-failed',
        stage: 'check',
        terminalSignal: check.forwardedSignal,
      };
    } else if (check.status === 'timed-out') {
      primary = { id: definition.id, outcome: 'timed-out', stage: 'check' };
    } else if (check.status !== 'failed') {
      primary = { id: definition.id, outcome: 'not-detected', stage: 'check' };
    } else if (check.signature === definition.expectedSignature) {
      primary = {
        id: definition.id,
        outcome: 'detected',
        stage: 'check',
        signature: check.signature,
      };
    } else {
      primary = { id: definition.id, outcome: 'check-invalid', stage: 'check' };
    }
    return await finalize(definition, runtime, primary);
  } catch {
    primary = { id: definition.id, outcome: 'environment-failed', stage: primary.stage };
    return await finalize(definition, runtime, primary);
  }
}

/** Applies cleanup precedence without retaining untrusted runtime diagnostics. */
async function finalize(
  definition: TenantAdminControlCheckDefinition,
  runtime: ControlSensitivityRuntime,
  primary: Omit<ControlSensitivityResult, 'cleanupComplete' | 'provenance'>,
): Promise<ControlSensitivityResult> {
  try {
    const cleanup = await runtime.cleanup(definition);
    if (cleanup.status === 'passed') {
      return Object.freeze({ ...primary, cleanupComplete: true, provenance: runtime.provenance() });
    }
  } catch {
    // The sanitized cleanup result below intentionally hides runtime paths and diagnostics.
  }
  return Object.freeze({
    id: definition.id,
    outcome: 'environment-failed',
    stage: 'cleanup',
    cleanupComplete: false,
    provenance: runtime.provenance(),
  });
}
