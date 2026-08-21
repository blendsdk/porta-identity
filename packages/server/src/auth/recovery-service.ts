/** Public enqueue and application lifecycle boundary for durable recovery work. */

import { createAccountRecoveryJobProcessor } from './recovery-job-processor.js';
import {
  createRecoveryJobRepository,
  type EnqueueRecoveryJobResult,
  type RecoveryJobType,
} from './recovery-job-repository.js';
import {
  normalizeRecoveryAddress,
  protectRecoveryAddress,
  recoveryIdempotencyDigest,
} from './recovery-crypto.js';
import { createRecoveryWorker, type RecoveryWorker } from './recovery-worker.js';

/** Input accepted after public validation, CSRF, and rate limiting. */
export interface EnqueueAccountRecoveryInput {
  /** Closed recovery operation. */
  readonly jobType: RecoveryJobType;
  /** Resolved tenant UUID. */
  readonly organizationId: string;
  /** Publicly submitted recovery address. */
  readonly email: string;
  /** Interaction binding for magic links, otherwise null. */
  readonly interactionUid: string | null;
  /** Per-form CSRF value that identifies one admitted action without storing it. */
  readonly actionNonce: string;
}

let worker: RecoveryWorker | null = null;

/** Protect and durably enqueue one account-independent recovery request. */
export async function enqueueAccountRecovery(
  input: EnqueueAccountRecoveryInput,
): Promise<EnqueueRecoveryJobResult> {
  const requestAuthority = {
    organizationId: input.organizationId,
    jobType: input.jobType,
    interactionUid: input.interactionUid,
  } as const;
  const normalized = normalizeRecoveryAddress(input.email);
  const idempotencyDigest = recoveryIdempotencyDigest(requestAuthority, input.actionNonce);
  const result = await createRecoveryJobRepository().enqueue({
    jobType: input.jobType,
    organizationId: input.organizationId,
    protectedAddress: protectRecoveryAddress(normalized, {
      ...requestAuthority,
      idempotencyDigest,
    }),
    interactionUid: input.interactionUid,
    idempotencyDigest,
    availableAt: new Date(),
  });
  worker?.wake();
  return result;
}

/** Start the singleton recovery worker after all application dependencies are ready. */
export function startAccountRecoveryWorker(): void {
  if (worker) return;
  worker = createRecoveryWorker({
    repository: createRecoveryJobRepository(),
    processor: createAccountRecoveryJobProcessor(),
  });
  worker.start();
}

/** Stop accepting claims and await the bounded active-cycle settlement window. */
export async function stopAccountRecoveryWorker(): Promise<boolean> {
  const active = worker;
  if (!active) return true;
  worker = null;
  return active.stop();
}
