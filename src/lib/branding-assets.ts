/**
 * Branding assets service.
 *
 * Manages organization logo and favicon image uploads stored as PostgreSQL
 * bytea. Images are validated for type, size, and content before storage.
 *
 * Supported formats: PNG, SVG, ICO, JPEG, WebP
 * Max file size: 512 KB
 *
 * @module branding-assets
 * @see 06-bulk-operations-branding.md
 */

import { getPool } from './database.js';

// ============================================================================
// Types
// ============================================================================

export type AssetType = 'logo' | 'favicon';

export interface BrandingAsset {
  id: string;
  organizationId: string;
  assetType: AssetType;
  contentType: string;
  fileSize: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BrandingAssetWithData extends BrandingAsset {
  data: Buffer;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_FILE_SIZE = 524288; // 512 KB

const ALLOWED_CONTENT_TYPES = new Set([
  'image/png',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/jpeg',
  'image/webp',
]);

// ============================================================================
// Service functions
// ============================================================================

/**
 * Upload (upsert) a branding asset for an organization.
 * If an asset of the same type already exists, it is replaced.
 *
 * @throws Error if content type is not allowed or file too large
 */
export async function uploadAsset(
  organizationId: string,
  assetType: AssetType,
  contentType: string,
  data: Buffer,
): Promise<BrandingAsset> {
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error(`Unsupported content type: ${contentType}. Allowed: ${[...ALLOWED_CONTENT_TYPES].join(', ')}`);
  }

  if (data.length === 0) {
    throw new Error('Asset data cannot be empty');
  }

  if (data.length > MAX_FILE_SIZE) {
    throw new Error(`File too large: ${data.length} bytes (max ${MAX_FILE_SIZE})`);
  }

  const pool = getPool();
  const { rows } = await pool.query<BrandingAsset>(
    `INSERT INTO branding_assets (organization_id, asset_type, content_type, data, file_size)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (organization_id, asset_type) DO UPDATE SET
       content_type = EXCLUDED.content_type,
       data = EXCLUDED.data,
       file_size = EXCLUDED.file_size,
       updated_at = NOW()
     RETURNING id, organization_id AS "organizationId", asset_type AS "assetType",
               content_type AS "contentType", file_size AS "fileSize",
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    [organizationId, assetType, contentType, data, data.length],
  );

  return rows[0];
}

/**
 * Get a branding asset with its binary data.
 * Returns null if no asset exists.
 */
export async function getAsset(
  organizationId: string,
  assetType: AssetType,
): Promise<BrandingAssetWithData | null> {
  const pool = getPool();
  const { rows } = await pool.query<BrandingAssetWithData>(
    `SELECT id, organization_id AS "organizationId", asset_type AS "assetType",
            content_type AS "contentType", data, file_size AS "fileSize",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM branding_assets
     WHERE organization_id = $1 AND asset_type = $2`,
    [organizationId, assetType],
  );
  return rows[0] ?? null;
}

/**
 * List branding assets for an organization (metadata only, no binary data).
 */
export async function listAssets(organizationId: string): Promise<BrandingAsset[]> {
  const pool = getPool();
  const { rows } = await pool.query<BrandingAsset>(
    `SELECT id, organization_id AS "organizationId", asset_type AS "assetType",
            content_type AS "contentType", file_size AS "fileSize",
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM branding_assets
     WHERE organization_id = $1
     ORDER BY asset_type`,
    [organizationId],
  );
  return rows;
}

/**
 * Delete a branding asset.
 * Returns true if the asset existed and was deleted.
 */
export async function deleteAsset(
  organizationId: string,
  assetType: AssetType,
): Promise<boolean> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `DELETE FROM branding_assets WHERE organization_id = $1 AND asset_type = $2`,
    [organizationId, assetType],
  );
  return (rowCount ?? 0) > 0;
}
