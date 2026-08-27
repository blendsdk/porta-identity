/** Public entry point for the administration application owned by the CLI. */

export { runAdminApplication } from './application.js';
export type {
  AdminApplicationOptions,
  AdminApplicationSession,
  AdminExitCode,
} from './application.js';
export type { AdminConnectionState, AdminFailureKind, AdminPublicFailure } from './state.js';
