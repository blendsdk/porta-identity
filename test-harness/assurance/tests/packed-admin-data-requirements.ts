import type { PackedAdminDataRequirement } from './packed-admin-data-contract.js';

/** Exact non-destructive SDK and CLI administrative-data compatibility matrix. */
export const packedAdminDataRequirements: readonly PackedAdminDataRequirement[] = Object.freeze([
  {
    id: 'packed-sdk-bulk-duplicate-rejection',
    client: 'sdk',
    surface: 'bulk-duplicate-rejection',
    expectedOutcome: 'rejected',
    expectedStatus: 400,
    requiresNonmutation: true,
  },
  {
    id: 'packed-sdk-import-manifest-preview',
    client: 'sdk',
    surface: 'import-manifest-preview',
    expectedOutcome: 'allowed',
    expectedStatus: 200,
    requiresNonmutation: true,
  },
  {
    id: 'packed-sdk-export-manifest',
    client: 'sdk',
    surface: 'export-manifest',
    expectedOutcome: 'allowed',
    expectedStatus: 200,
    requiresNonmutation: true,
  },
  {
    id: 'packed-cli-export-manifest',
    client: 'cli',
    surface: 'export-manifest',
    expectedOutcome: 'allowed',
    expectedStatus: 200,
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
