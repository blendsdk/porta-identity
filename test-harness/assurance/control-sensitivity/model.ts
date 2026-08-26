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
  /** Operator signal forwarded while the stage was active. */
  readonly forwardedSignal?: 'SIGINT' | 'SIGTERM';
}

/** Immutable identities that bind a local control check to its exact inputs and owned runtime. */
export interface ControlSensitivityProvenance {
  /** Clean source commit used to create the disposable worktree. */
  readonly commitIdentity: string;
  /** Clean source tree used to create the disposable worktree. */
  readonly treeIdentity: string;
  /** Assurance implementation identity used by the command. */
  readonly assuranceToolDigest: string;
  /** Root dependency lock identity. */
  readonly dependencyLockDigest: string;
  /** Exact reviewed production target. */
  readonly targetPath: string;
  /** Original target content identity. */
  readonly originalSha256: string;
  /** Disposable variant target content identity, when prepared. */
  readonly variantSha256?: string;
  /** Lifecycle run that owned the local stack, when started. */
  readonly lifecycleRunId?: string;
  /** Public fixture definition identity, when seeded. */
  readonly fixtureIdentity?: string;
  /** Exact Porta image identity, when started. */
  readonly serverImageDigest?: string;
  /** Exact Docker containers owned by the lifecycle run. */
  readonly containerIds?: readonly string[];
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
  /** Returns the sanitized immutable identities observed so far. */
  provenance(): ControlSensitivityProvenance | undefined;
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
  /** Operator signal retained separately from the five semantic outcomes. */
  readonly terminalSignal?: 'SIGINT' | 'SIGTERM';
  /** Exact immutable identities observed for this run. */
  readonly provenance?: ControlSensitivityProvenance;
}
