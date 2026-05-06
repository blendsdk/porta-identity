/**
 * Data import / provisioning types for the Porta SDK.
 *
 * @module types/imports
 */

export type ImportMode = 'merge' | 'overwrite';

export interface ImportManifest {
  /** Raw provisioning data (YAML/JSON parsed) */
  data: Record<string, unknown>;
  /** Import mode: merge existing or overwrite */
  mode?: ImportMode;
  /** Dry run — validate without applying */
  dryRun?: boolean;
}

export interface ImportResult {
  /** Whether the import was a dry run */
  dryRun: boolean;
  /** Number of entities processed per type */
  counts: Record<string, number>;
  /** Errors encountered during import */
  errors: ImportError[];
}

export interface ImportError {
  /** Entity type that failed */
  entityType: string;
  /** Identifier of the failed entity */
  identifier: string;
  /** Error message */
  error: string;
}
