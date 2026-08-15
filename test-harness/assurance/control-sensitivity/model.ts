/** Operator-facing result of one defensive local control check. */
export type ControlSensitivityOutcome =
  'detected' | 'not-detected' | 'check-invalid' | 'environment-failed' | 'timed-out';

/** Ordered stages owned by the local control-sensitivity executor. */
export type ControlSensitivityStage =
  'validation' | 'variant' | 'build' | 'startup' | 'fixture' | 'check' | 'cleanup';

/** Closed tenant/admin control-check selectors. */
export type TenantAdminControlCheckId =
  | 'tenant-read-scope'
  | 'tenant-write-scope'
  | 'issuer-separation'
  | 'organization-cache-scope'
  | 'stale-authority-recheck'
  | 'admin-organization-membership'
  | 'admin-permission-rbac';

/** One exact literal replacement in a reviewed repository file. */
export interface ReviewedSourceReplacement {
  /** Exact source text that must occur once before transformation. */
  readonly before: string;
  /** Defensive negative-control text written only in the disposable worktree. */
  readonly after: string;
}

/** Closed code-owned definition for one tenant/admin control check. */
export interface TenantAdminControlCheckDefinition {
  /** Stable selector accepted by the compatibility command boundary. */
  readonly id: TenantAdminControlCheckId;
  /** Exact assurance claim owned by the designated check. */
  readonly claimId: 'CLAIM-R5-03';
  /** Stable top-level sentinel retained by the command selector. */
  readonly sentinelId: 'ST-28' | 'ST-29' | 'ST-30' | 'ST-31' | 'ST-32';
  /** Exact repository-relative production file owned by this check. */
  readonly targetPath: string;
  /** SHA-256 identity required before the local variant is created. */
  readonly originalSha256: `sha256:${string}`;
  /** Reviewed literal transformations confined to the exact target file. */
  readonly replacements: readonly ReviewedSourceReplacement[];
  /** Exact requirement-owned live sub-check. */
  readonly subSentinel: string;
  /** Only assertion signature that may classify the control removal as detected. */
  readonly expectedSignature: string;
}

/** Sanitized observation returned by one executor stage. */
export interface ControlSensitivityStageObservation {
  /** Whether the stage completed normally. */
  readonly status: 'passed' | 'failed' | 'timed-out';
  /** Exact assertion signature emitted by the designated check, when any. */
  readonly signature?: string;
}

/** Runtime capabilities required by the staged executor. */
export interface ControlSensitivityRuntime {
  /** Validates clean provenance, target identity, and local prerequisites. */
  validate(
    definition: TenantAdminControlCheckDefinition,
  ): Promise<ControlSensitivityStageObservation>;
  /** Creates and verifies the one-file isolated source variant. */
  prepareVariant(
    definition: TenantAdminControlCheckDefinition,
  ): Promise<ControlSensitivityStageObservation>;
  /** Builds the selected local source variant. */
  build(definition: TenantAdminControlCheckDefinition): Promise<ControlSensitivityStageObservation>;
  /** Starts one lifecycle-owned local stack from the variant. */
  start(definition: TenantAdminControlCheckDefinition): Promise<ControlSensitivityStageObservation>;
  /** Verifies migration, fixture, and health prerequisites. */
  verifyFixture(
    definition: TenantAdminControlCheckDefinition,
  ): Promise<ControlSensitivityStageObservation>;
  /** Runs only the exact registered live check. */
  runCheck(
    definition: TenantAdminControlCheckDefinition,
  ): Promise<ControlSensitivityStageObservation>;
  /** Removes the exact owned stack, source variant, and runtime records. */
  cleanup(
    definition: TenantAdminControlCheckDefinition,
  ): Promise<ControlSensitivityStageObservation>;
}

/** Sanitized final result of one local defensive control check. */
export interface ControlSensitivityResult {
  /** Stable selected control-check ID. */
  readonly id: string;
  /** Final operator-facing outcome. */
  readonly outcome: ControlSensitivityOutcome;
  /** Stage that supplied the primary result. */
  readonly stage: ControlSensitivityStage;
  /** Whether all owned resources were proven absent. */
  readonly cleanupComplete: boolean;
  /** Exact designated signature retained only for a detected result. */
  readonly signature?: string;
}
