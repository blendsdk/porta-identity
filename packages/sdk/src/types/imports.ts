/**
 * Data import / provisioning types for the Porta SDK.
 *
 * Types mirror the server's data-import module response shapes exactly.
 * Server is the source of truth (per AR #2 in sdk-contract-audit plan).
 *
 * @module types/imports
 */

/** Import mode — controls how existing entities are handled */
export type ImportMode = 'merge' | 'overwrite' | 'dry-run';

/** Request payload for the import endpoint */
export interface ImportManifest {
  /** Raw provisioning manifest (YAML/JSON parsed) */
  manifest: Record<string, unknown>;
  /** Import mode: merge existing, overwrite, or dry-run */
  mode?: ImportMode;
  /** Dry run — validate without applying (shorthand for mode='dry-run') */
  dryRun?: boolean;
}

/** A single entity operation result (created or updated) */
export interface ImportEntityResult {
  /** Entity type (e.g., "organization", "application", "client") */
  type: string;
  /** Entity slug identifier */
  slug: string;
  /** Entity display name */
  name: string;
  /** List of changes applied (for updates) */
  changes?: string[];
}

/** A skipped entity with reason */
export interface ImportSkippedResult {
  /** Entity type */
  type: string;
  /** Entity slug identifier */
  slug: string;
  /** Why the entity was skipped */
  reason: string;
}

/** An import error for a specific entity */
export interface ImportErrorResult {
  /** Entity type that failed */
  type: string;
  /** Entity slug identifier */
  slug: string;
  /** Error message */
  error: string;
}

/** Client credentials generated during import (shown once, never stored in plaintext) */
export interface ImportClientCredentials {
  /** Client display name */
  clientName: string;
  /** Generated client ID */
  clientId: string;
  /** Client type */
  clientType: 'confidential' | 'public';
  /** Raw secret — only present on create for confidential clients */
  secretPlaintext?: string;
  /** DB row ID of the generated secret */
  secretId?: string;
  /** Optional label for the secret */
  secretLabel?: string;
  /** Optional expiry for the secret (ISO 8601) */
  secretExpiresAt?: string;
}

/** Full import result — matches server ImportResult exactly */
export interface ImportResult {
  /** The import mode that was used */
  mode: ImportMode;
  /** Entities that were created */
  created: ImportEntityResult[];
  /** Entities that were updated (overwrite mode) */
  updated: ImportEntityResult[];
  /** Entities that were skipped (merge mode, already exists) */
  skipped: ImportSkippedResult[];
  /** Errors encountered during import */
  errors: ImportErrorResult[];
  /** Credentials for all processed clients (created, skipped, updated, dry-run) */
  credentials: ImportClientCredentials[];
}
