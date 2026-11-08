import { ServiceAccountValidationError } from './errors.js';

/**
 * Reject values JSON would silently change, then exercise the native encoder before any write.
 * Iteration avoids imposing an artificial nesting limit or overflowing our own traversal stack.
 */
export function validateServiceAccountInvitationJson(value: unknown): void {
  const pending: unknown[] = [value];
  const seen = new Set<object>();
  while (pending.length) {
    const item = pending.pop();
    if (typeof item === 'number' && !Number.isFinite(item)) throw new ServiceAccountValidationError();
    if (typeof item === 'object' && item !== null) {
      if (seen.has(item)) throw new ServiceAccountValidationError();
      seen.add(item);
      pending.push(...Object.values(item));
    }
  }
  try {
    if (JSON.stringify(value) === undefined) throw new ServiceAccountValidationError();
  } catch {
    throw new ServiceAccountValidationError();
  }
}
