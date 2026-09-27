/**
 * Server release version.
 *
 * Kept aligned with the coordinated release version by `scripts/sync-versions.js`.
 * Reported as the `version` field of the `Server started` log entry so an operator can
 * identify the running build; it is never returned in a public HTTP response.
 */
export const SERVER_VERSION = '1.11.0';
