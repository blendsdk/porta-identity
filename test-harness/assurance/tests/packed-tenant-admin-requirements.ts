/** Public clients supported by the tenant/admin packed-client adjunct. */
export type PackedTenantAdminClient = 'sdk' | 'cli';

/** Exact operations exercised through each locally packed public client. */
export type PackedTenantAdminOperation = 'list' | 'read' | 'update' | 'denied-update';

/** Immutable requirement for one packed-client tenant/admin journey. */
export interface PackedTenantAdminRequirement {
  /** Stable requirement case identifier. */
  readonly id: string;
  /** Public client executing the operation. */
  readonly client: PackedTenantAdminClient;
  /** Supported administrative operation. */
  readonly operation: PackedTenantAdminOperation;
  /** Actor authority used by the operation. */
  readonly actor: 'full' | 'unprivileged';
  /** Expected public result. */
  readonly expectedResult: 'allowed' | 'forbidden';
  /** Whether independent raw observation must prove a changed target. */
  readonly expectedTargetMutation: boolean;
}

/** Exact SDK and CLI journey matrix; no unsupported client operation is implied. */
export const packedTenantAdminRequirements: readonly PackedTenantAdminRequirement[] = Object.freeze(
  (['sdk', 'cli'] as const).flatMap((client) => [
    Object.freeze({
      id: `packed-${client}-tenant-list`,
      client,
      operation: 'list' as const,
      actor: 'full' as const,
      expectedResult: 'allowed' as const,
      expectedTargetMutation: false,
    }),
    Object.freeze({
      id: `packed-${client}-tenant-read`,
      client,
      operation: 'read' as const,
      actor: 'full' as const,
      expectedResult: 'allowed' as const,
      expectedTargetMutation: false,
    }),
    Object.freeze({
      id: `packed-${client}-tenant-update`,
      client,
      operation: 'update' as const,
      actor: 'full' as const,
      expectedResult: 'allowed' as const,
      expectedTargetMutation: true,
    }),
    Object.freeze({
      id: `packed-${client}-tenant-denied-update`,
      client,
      operation: 'denied-update' as const,
      actor: 'unprivileged' as const,
      expectedResult: 'forbidden' as const,
      expectedTargetMutation: false,
    }),
  ]),
);
