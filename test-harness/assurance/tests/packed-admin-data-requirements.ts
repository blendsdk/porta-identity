import type { PackedAdminDataRequirement } from './packed-admin-data-contract.js';

/** Exact non-destructive SDK and CLI administrative-data compatibility matrix. */
export const packedAdminDataRequirements: readonly PackedAdminDataRequirement[] = Object.freeze([
  {
    id: 'packed-sdk-bulk-duplicate-rejection',
    client: 'sdk',
    surface: 'bulk-duplicate-rejection',
    expectedOutcome: 'rejected',
    requiresNonmutation: true,
  },
  {
    id: 'packed-sdk-import-dry-run',
    client: 'sdk',
    surface: 'import-dry-run',
    expectedOutcome: 'allowed',
    requiresNonmutation: true,
  },
  {
    id: 'packed-sdk-export-users-json',
    client: 'sdk',
    surface: 'export-users-json',
    expectedOutcome: 'allowed',
    requiresNonmutation: true,
  },
  {
    id: 'packed-cli-export-users-json',
    client: 'cli',
    surface: 'export-users-json',
    expectedOutcome: 'allowed',
    requiresNonmutation: true,
  },
]);

/** Closed protected-output classes scanned before transient output is discarded. */
export const packedAdminDataForbiddenOutputClasses = Object.freeze([
  'access-or-refresh-token',
  'session-cookie-or-client-secret',
  'password-or-recovery-material',
  'private-signing-key-material',
  'foreign-tenant-identity',
]);
