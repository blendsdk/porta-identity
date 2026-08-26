/**
 * Branding assets integration tests.
 *
 * Validates image upload, retrieval, listing, and deletion
 * against the branding_assets table in PostgreSQL.
 *
 * @see 06-bulk-branding.md
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { truncateAllTables, seedBaseData } from '../helpers/database.js';
import { flushTestRedis } from '../helpers/redis.js';
import { createTestOrganization } from '../helpers/factories.js';
import {
  uploadAsset,
  getAsset,
  listAssets,
  deleteAsset,
} from '../../../src/lib/branding-assets.js';

/**
 * Minimal 1x1 PNG image (68 bytes) for testing.
 * PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
 */
const MINIMAL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** Minimal valid SVG for testing */
const MINIMAL_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>',
);

describe('Branding Assets (Integration)', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    await flushTestRedis();
  });

  // ── Upload & Retrieve ──────────────────────────────────────────────

  describe('uploadAsset / getAsset', () => {
    it('should upload a PNG logo and retrieve it', async () => {
      const org = await createTestOrganization({ name: 'Brand Org' });

      await uploadAsset(org.id, 'logo', 'image/png', MINIMAL_PNG);

      const asset = await getAsset(org.id, 'logo');

      expect(asset).not.toBeNull();
      expect(asset!.assetType).toBe('logo');
      expect(asset!.contentType).toBe('image/png');
      expect(asset!.data).toBeInstanceOf(Buffer);
      expect(asset!.data.length).toBeGreaterThan(0);
    });

    it('should upload an SVG favicon and retrieve it', async () => {
      const org = await createTestOrganization({ name: 'SVG Org' });

      await uploadAsset(org.id, 'favicon', 'image/svg+xml', MINIMAL_SVG);

      const asset = await getAsset(org.id, 'favicon');

      expect(asset).not.toBeNull();
      expect(asset!.assetType).toBe('favicon');
      expect(asset!.contentType).toBe('image/svg+xml');
    });

    it('should upsert existing asset on re-upload', async () => {
      const org = await createTestOrganization({ name: 'Upsert Org' });

      await uploadAsset(org.id, 'logo', 'image/png', MINIMAL_PNG);

      // Upload again with SVG
      await uploadAsset(org.id, 'logo', 'image/svg+xml', MINIMAL_SVG);

      const asset = await getAsset(org.id, 'logo');

      expect(asset!.contentType).toBe('image/svg+xml');
    });

    it('should return null for non-existent asset', async () => {
      const org = await createTestOrganization({ name: 'No Asset Org' });

      const asset = await getAsset(org.id, 'logo');

      expect(asset).toBeNull();
    });
  });

  // ── List Assets ────────────────────────────────────────────────────

  describe('listAssets', () => {
    it('should list all assets for an organization', async () => {
      const org = await createTestOrganization({ name: 'List Org' });

      await uploadAsset(org.id, 'logo', 'image/png', MINIMAL_PNG);
      await uploadAsset(org.id, 'favicon', 'image/svg+xml', MINIMAL_SVG);

      const assets = await listAssets(org.id);

      expect(assets).toHaveLength(2);
      expect(assets.map((a) => a.assetType).sort()).toEqual(['favicon', 'logo']);
    });

    it('should return empty array when no assets exist', async () => {
      const org = await createTestOrganization({ name: 'Empty Brand Org' });

      const assets = await listAssets(org.id);

      expect(assets).toHaveLength(0);
    });

    it('should not include assets from other organizations', async () => {
      const org1 = await createTestOrganization({ name: 'Iso Brand 1' });
      const org2 = await createTestOrganization({ name: 'Iso Brand 2' });

      await uploadAsset(org1.id, 'logo', 'image/png', MINIMAL_PNG);
      await uploadAsset(org2.id, 'logo', 'image/svg+xml', MINIMAL_SVG);

      const assets1 = await listAssets(org1.id);
      const assets2 = await listAssets(org2.id);

      expect(assets1).toHaveLength(1);
      expect(assets2).toHaveLength(1);
      expect(assets1[0]!.contentType).toBe('image/png');
      expect(assets2[0]!.contentType).toBe('image/svg+xml');
    });
  });

  // ── Delete Asset ───────────────────────────────────────────────────

  describe('deleteAsset', () => {
    it('should delete an existing asset', async () => {
      const org = await createTestOrganization({ name: 'Delete Org' });

      await uploadAsset(org.id, 'logo', 'image/png', MINIMAL_PNG);

      const deleted = await deleteAsset(org.id, 'logo');
      expect(deleted).toBe(true);

      const asset = await getAsset(org.id, 'logo');
      expect(asset).toBeNull();
    });

    it('should return false when deleting non-existent asset', async () => {
      const org = await createTestOrganization({ name: 'No Del Org' });

      const deleted = await deleteAsset(org.id, 'logo');

      expect(deleted).toBe(false);
    });

    it('should not affect other assets in the same organization', async () => {
      const org = await createTestOrganization({ name: 'Selective Del Org' });

      await uploadAsset(org.id, 'logo', 'image/png', MINIMAL_PNG);
      await uploadAsset(org.id, 'favicon', 'image/svg+xml', MINIMAL_SVG);

      await deleteAsset(org.id, 'logo');

      const logo = await getAsset(org.id, 'logo');
      const favicon = await getAsset(org.id, 'favicon');

      expect(logo).toBeNull();
      expect(favicon).not.toBeNull();
    });
  });
});
