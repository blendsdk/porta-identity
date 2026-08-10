/** Public options for resolving an allowlisted repository reference. */
export interface RepositoryReferenceOptions {
  /** Absolute repository root used only as a trusted resolution anchor. */
  repositoryRoot: string;
  /** Repository-relative directory that the resolved reference must remain beneath. */
  allowedRoot: string;
}

/** Validates a claim catalog and preserves its records. */
export function validateCatalog<T>(claims: readonly T[], context: unknown): T[];

/** Applies one validated claim-state transition. */
export function transitionClaim<T>(claim: T, nextStatus: string, context: unknown): T;

/** Imports inventory as untrusted claim candidates. */
export function importInventory(
  claims: readonly unknown[],
  knownTests: readonly unknown[],
): Array<{ status: string }>;

/** Records a confirmed product defect while returning a blocked claim. */
export function recordProductDefect<T, D>(
  claim: T,
  defect: D,
): { claim: T & { status: string }; defect: D };

/** Rejects an oracle that derives expectations from implementation behavior. */
export function validateOracle<T>(oracle: T): T;

/** Returns whether a sentinel supplies exact, non-vacuous evidence. */
export function assessSentinel(sentinel: unknown): { trusted: boolean };

/** Validates that incomplete review results retain named gaps and honest conclusions. */
export function completeSurfaceReview(review: unknown): unknown;

/** Validates supported-surface contract coverage and preserves the definitions. */
export function validateSurfaceClaims<T>(claims: readonly T[]): T[];

/** Validates specification naming and single-runner ownership. */
export function validateTestOwnership<T>(ownership: readonly T[]): T[];

/** Validates requirement, case, task, and claim graph references. */
export function validateTraceability<T>(traceability: T, claims: readonly unknown[]): T;

/** Resolves one canonical allowlisted repository-relative reference. */
export function validateRepositoryReference(
  reference: string,
  options: RepositoryReferenceOptions,
): string;
