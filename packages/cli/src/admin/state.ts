/** Immutable state displayed by the embedded administration shell. */

import type { VerifiedIdentity } from '../auth/types.js';

/** Failure categories safe to expose inside a terminal frame. */
export type AdminFailureKind =
  'unavailable' | 'unauthenticated' | 'unauthorized' | 'configuration-failure' | 'storage-failure';

/** A bounded failure value that never carries remote or internal detail. */
export interface AdminPublicFailure {
  /** Safe category used to choose a fixed user-facing message. */
  readonly kind: AdminFailureKind;
}

/** Complete connection state for one administration application. */
export type AdminConnectionState =
  | { readonly kind: 'selecting-server' }
  | {
      readonly kind: 'unauthenticated';
      readonly server: URL;
      readonly reason?: AdminFailureKind;
    }
  | { readonly kind: 'authenticating'; readonly server: URL; readonly canCancel: true }
  | { readonly kind: 'verifying'; readonly server: URL; readonly canCancel: true }
  | {
      readonly kind: 'authenticated';
      readonly server: URL;
      readonly identity: VerifiedIdentity;
    }
  | {
      readonly kind: 'unauthorized';
      readonly server: URL;
      readonly identity: VerifiedIdentity;
    }
  | { readonly kind: 'fatal'; readonly failure: AdminPublicFailure };

/** Returns true only when Retry can safely repeat a transient operation. */
export function canRetryAdminState(state: AdminConnectionState): boolean {
  return state.kind === 'unauthenticated' && state.reason === 'unavailable';
}

/** Returns the normalized server carried by a connection state, if present. */
export function adminStateServer(state: AdminConnectionState): URL | undefined {
  return 'server' in state ? state.server : undefined;
}
