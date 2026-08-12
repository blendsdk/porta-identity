import { z } from 'zod';

/** Stable fault identifier accepted by selectors and evidence paths. */
export const faultIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);

/** Exact SHA-256 identity used to bind a reviewed patch target. */
export const sha256IdentitySchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

/** One claim-specific sentinel and exact failure signature. */
export const faultTupleSchema = z.object({
  claimId: z.string().regex(/^CLAIM-R[1-7]-[0-9]{2}$/),
  sentinelId: z.string().regex(/^ST-[0-9]{2}[A-Z]?$/),
  expectedSignature: z.string().regex(/^[A-Z][A-Z0-9_]{2,127}$/),
});

/** One reviewed patch target with immutable revision and byte constraints. */
export const faultTargetSchema = z.object({
  ancestorCommit: z.string().regex(/^[0-9a-f]{40}$/),
  path: z.string().regex(/^test-harness\/assurance\/fault\/(?:fixtures|targets)\/[a-z0-9./_-]+$/),
  sha256: sha256IdentitySchema,
});

/** Complete curated-fault definition stored in the versioned catalog. */
export const curatedFaultSchema = z
  .object({
    id: faultIdSchema,
    rationale: z.string().trim().min(1),
    target: faultTargetSchema,
    patchPath: z.string().regex(/^test-harness\/assurance\/fault\/patches\/[a-z0-9._-]+\.patch$/),
    buildCommand: faultIdSchema,
    executionCommand: faultIdSchema,
    timeoutMilliseconds: z.number().int().positive().max(3_600_000),
    cleanupVerification: z.literal('primary-tree-unchanged-and-no-owned-residue'),
    tuples: z.array(faultTupleSchema).min(1),
  })
  .superRefine((fault, context) => {
    const identities = new Set<string>();
    for (const [index, tuple] of fault.tuples.entries()) {
      const identity = `${tuple.claimId}\0${tuple.sentinelId}`;
      if (identities.has(identity)) {
        context.addIssue({
          code: 'custom',
          path: ['tuples', index],
          message: 'fault tuples must have unique claim and sentinel identities',
        });
      }
      identities.add(identity);
    }
  });

/** Versioned catalog for reviewed curated faults. */
export const curatedFaultCatalogSchema = z
  .object({
    version: z.literal(1),
    faults: z.array(curatedFaultSchema).min(1),
  })
  .superRefine((catalog, context) => {
    const identities = new Set<string>();
    for (const [index, fault] of catalog.faults.entries()) {
      if (identities.has(fault.id)) {
        context.addIssue({
          code: 'custom',
          path: ['faults', index, 'id'],
          message: 'fault IDs must be unique',
        });
      }
      identities.add(fault.id);
    }
  });

/** Validated curated-fault definition. */
export type CuratedFault = z.infer<typeof curatedFaultSchema>;

/** Validated curated-fault catalog. */
export type CuratedFaultCatalog = z.infer<typeof curatedFaultCatalogSchema>;

/** Validated exact tuple owned by one curated fault. */
export type FaultTuple = z.infer<typeof faultTupleSchema>;

/** Stable terminal classification for one exact tuple execution. */
export type FaultClassification =
  'killed' | 'survived' | 'invalid' | 'infrastructure-failed' | 'timeout';

/** Controlled child observation used by the classification boundary. */
export interface FaultObservation {
  /** Stage at which the tuple stopped. */
  readonly stage: 'validation' | 'build' | 'startup' | 'fixture' | 'sentinel' | 'cleanup';
  /** Numeric status when the child exited normally. */
  readonly exitCode: number;
  /** Bounded assertion markers emitted by the designated sentinel. */
  readonly assertionSignatures: readonly string[];
  /** Whether an unrelated test failed. */
  readonly unrelatedFailure: boolean;
  /** Whether the tuple deadline expired. */
  readonly timedOut: boolean;
}

/** Sanitized result for one exact claim and sentinel tuple. */
export interface FaultTupleResult {
  /** Exact tuple selected from the catalog. */
  readonly tuple: FaultTuple;
  /** Terminal classification derived from the observation. */
  readonly classification: FaultClassification;
  /** Claims blocked by this result. */
  readonly blockedClaims: readonly string[];
  /** Claims independently killed by this result. */
  readonly killedClaims: readonly string[];
  /** Whether the primary source tree retained its original identity. */
  readonly primaryTreeUnchanged: boolean;
  /** Sanitized owned-resource kinds remaining after cleanup. */
  readonly residue: readonly string[];
  /** Bounded recovery command when automatic cleanup fails. */
  readonly recoveryCommand?: string;
}
