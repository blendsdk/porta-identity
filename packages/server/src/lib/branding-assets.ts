/**
 * Branding assets service.
 *
 * Manages organization logo and favicon image uploads stored as PostgreSQL
 * bytea. Images are validated for type, size, and content before storage.
 *
 * Supported formats: PNG, SVG, ICO, JPEG, and WebP.
 *
 * @module branding-assets
 */

import { getPool } from './database.js';
import { validateImage } from './image-validator.js';

// ============================================================================
// Types
// ============================================================================

/** Branding image slot owned by an organization. */
export type AssetType = 'logo' | 'favicon';

/** Metadata returned for a stored organization branding asset. */
export interface BrandingAsset {
  /** Stable asset identifier. */
  id: string;
  /** Organization that owns the asset. */
  organizationId: string;
  /** Branding slot occupied by the asset. */
  assetType: AssetType;
  /** Media type confirmed from the stored content. */
  contentType: string;
  /** Number of decoded bytes stored in PostgreSQL. */
  fileSize: number;
  /** Time at which the asset row was created. */
  createdAt: Date;
  /** Time at which the asset content was last replaced. */
  updatedAt: Date;
}

/** Stored branding metadata together with its validated binary content. */
export interface BrandingAssetWithData extends BrandingAsset {
  /** Validated image bytes. SVG bytes contain the sanitized representation. */
  data: Buffer;
}

// ============================================================================
// Service functions
// ============================================================================

/**
 * Upload (upsert) a branding asset for an organization.
 * If an asset of the same type already exists, it is replaced.
 *
 * @param organizationId - Organization that owns the asset.
 * @param assetType - Branding slot to create or replace.
 * @param contentType - Declared image media type.
 * @param data - Decoded image bytes supplied by the caller.
 * @returns Metadata for the stored asset.
 * @throws Error when the image type, size, signature, or SVG content is invalid.
 */
export async function uploadAsset(
  organizationId: string,
  assetType: AssetType,
  contentType: string,
  data: Buffer,
): Promise<BrandingAsset> {
  const validation = validateImage(data, contentType, assetType);
  if (!validation.valid || validation.data === undefined) {
    throw new Error(validation.error ?? 'Branding asset is invalid');
  }

  const validatedData = validation.data;

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
    [organizationId, assetType, contentType, validatedData, validatedData.length],
  );

  return rows[0];
}

/**
 * Get a branding asset with its binary data.
 * Returns null if no asset exists.
 *
 * @param organizationId - Organization that owns the asset.
 * @param assetType - Branding slot to read.
 * @returns Stored metadata and bytes, or `null` when the slot is empty.
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
 * List branding assets for an organization without loading binary data.
 *
 * @param organizationId - Organization whose asset metadata is requested.
 * @returns Metadata ordered by branding slot.
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
 *
 * @param organizationId - Organization that owns the asset.
 * @param assetType - Branding slot to remove.
 * @returns Whether an asset row was removed.
 */
export async function deleteAsset(organizationId: string, assetType: AssetType): Promise<boolean> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `DELETE FROM branding_assets WHERE organization_id = $1 AND asset_type = $2`,
    [organizationId, assetType],
  );
  return (rowCount ?? 0) > 0;
}
