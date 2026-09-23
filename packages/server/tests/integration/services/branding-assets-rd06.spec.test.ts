import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteAsset,
  getAsset,
  listAssets,
  uploadAsset,
} from '../../../src/lib/branding-assets.js';
import { getPool } from '../../../src/lib/database.js';
import { truncateAllTables } from '../helpers/database.js';
import { createTestOrganization } from '../helpers/factories.js';

const LOGO_LIMIT = 2 * 1024 * 1024;
const FAVICON_LIMIT = 512 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ICO_SIGNATURE = Buffer.from([0x00, 0x00, 0x01, 0x00]);

/** Build a buffer of an exact size beginning with the supplied valid image signature. */
function signedImage(signature: Buffer, size: number): Buffer {
  if (size < signature.length) throw new Error('Image size cannot be shorter than its signature');
  return Buffer.concat([signature, Buffer.alloc(size - signature.length)]);
}

/** Read the dedicated forward migration that changes branding asset size constraints. */
async function readBrandingSizeMigration(): Promise<{ up: string; down: string }> {
  const sql = await readFile(
    join(process.cwd(), 'migrations', '027_branding_asset_size_limits.sql'),
    'utf8',
  );
  const [up, down, ...extraSections] = sql.split('-- Down Migration');
  expect(extraSections).toHaveLength(0);
  expect(down).toBeDefined();
  return { up: up ?? '', down: down ?? '' };
}

/** Remove SQL comments and normalize whitespace for structural migration assertions. */
function normalizeSql(sql: string): string {
  return sql.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim();
}

describe('branding asset persistence specification', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  // The favicon ceiling is inclusive in both service validation and the database constraint.
  it('should persist a valid ICO favicon at exactly 512 KiB', async () => {
    const organization = await createTestOrganization({ name: 'Exact favicon organization' });
    const ico = signedImage(ICO_SIGNATURE, FAVICON_LIMIT);

    const metadata = await uploadAsset(organization.id, 'favicon', 'image/x-icon', ico);
    const stored = await getAsset(organization.id, 'favicon');

    expect(metadata).toMatchObject({
      organizationId: organization.id,
      assetType: 'favicon',
      contentType: 'image/x-icon',
      fileSize: FAVICON_LIMIT,
    });
    expect(stored?.data).toEqual(ico);
  });

  // The larger logo ceiling is inclusive and must be accepted by the persisted schema.
  it('should persist a valid-signature logo at exactly 2 MiB', async () => {
    const organization = await createTestOrganization({ name: 'Exact logo organization' });
    const png = signedImage(PNG_SIGNATURE, LOGO_LIMIT);

    const metadata = await uploadAsset(organization.id, 'logo', 'image/png', png);
    const stored = await getAsset(organization.id, 'logo');

    expect(metadata.fileSize).toBe(LOGO_LIMIT);
    expect(stored?.data).toEqual(png);
  });

  // Failed replacement validation leaves the prior atomic-upsert row unchanged.
  it('should reject a logo above 2 MiB without replacing its prior row', async () => {
    const organization = await createTestOrganization({ name: 'Preserved logo organization' });
    const original = signedImage(PNG_SIGNATURE, 128);
    const oversized = signedImage(PNG_SIGNATURE, LOGO_LIMIT + 1);
    const originalMetadata = await uploadAsset(organization.id, 'logo', 'image/png', original);

    await expect(uploadAsset(organization.id, 'logo', 'image/png', oversized)).rejects.toThrow();

    const stored = await getAsset(organization.id, 'logo');
    expect(stored).toMatchObject({
      id: originalMetadata.id,
      organizationId: organization.id,
      fileSize: original.length,
    });
    expect(stored?.data).toEqual(original);
  });

  it('should reject a favicon above 512 KiB without creating a row', async () => {
    const organization = await createTestOrganization({ name: 'Oversized favicon organization' });
    const oversized = signedImage(ICO_SIGNATURE, FAVICON_LIMIT + 1);

    await expect(
      uploadAsset(organization.id, 'favicon', 'image/x-icon', oversized),
    ).rejects.toThrow();

    expect(await getAsset(organization.id, 'favicon')).toBeNull();
    const count = await getPool().query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM branding_assets WHERE organization_id = $1',
      [organization.id],
    );
    expect(count.rows[0]?.count).toBe('0');
  });

  // Harmless vector content remains byte-for-byte stable through validation and storage.
  it('should store clean SVG bytes unchanged', async () => {
    const organization = await createTestOrganization({ name: 'Clean SVG organization' });
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1" /></svg>',
    );

    await uploadAsset(organization.id, 'logo', 'image/svg+xml', svg);

    expect((await getAsset(organization.id, 'logo'))?.data).toEqual(svg);
  });

  it('should remove script elements and onclick attributes from SVG before storage', async () => {
    const organization = await createTestOrganization({ name: 'Sanitized SVG organization' });
    const unsafe = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect onclick="alert(2)" /></svg>',
    );

    await uploadAsset(organization.id, 'logo', 'image/svg+xml', unsafe);

    const stored = await getAsset(organization.id, 'logo');
    expect(stored?.data.toString('utf8')).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>',
    );
    expect(stored?.data.toString('utf8')).not.toMatch(/<script|onclick/i);
  });

  // Every list, lookup, and removal operation binds both asset type and owning organization.
  it('should prevent another organization from listing, reading, or deleting an asset', async () => {
    const owner = await createTestOrganization({ name: 'Asset owner organization' });
    const other = await createTestOrganization({ name: 'Unrelated organization' });
    const png = signedImage(PNG_SIGNATURE, 128);
    await uploadAsset(owner.id, 'logo', 'image/png', png);

    expect(await listAssets(other.id)).toEqual([]);
    expect(await getAsset(other.id, 'logo')).toBeNull();
    expect(await deleteAsset(other.id, 'logo')).toBe(false);

    const ownerAsset = await getAsset(owner.id, 'logo');
    expect(ownerAsset?.organizationId).toBe(owner.id);
    expect(ownerAsset?.data).toEqual(png);
  });

  // Re-uploading the same logical asset replaces one row rather than adding a second row.
  it('should keep one row with replacement metadata and content after two successful uploads', async () => {
    const organization = await createTestOrganization({ name: 'Replacement organization' });
    const png = signedImage(PNG_SIGNATURE, 128);
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="1" /></svg>');

    const first = await uploadAsset(organization.id, 'logo', 'image/png', png);
    const replacement = await uploadAsset(organization.id, 'logo', 'image/svg+xml', svg);

    const rows = await getPool().query<{
      id: string;
      organizationId: string;
      assetType: string;
      contentType: string;
      data: Buffer;
      fileSize: number;
    }>(
      `SELECT id, organization_id AS "organizationId", asset_type AS "assetType",
              content_type AS "contentType", data, file_size AS "fileSize"
       FROM branding_assets
       WHERE organization_id = $1 AND asset_type = 'logo'`,
      [organization.id],
    );

    expect(rows.rows).toHaveLength(1);
    expect(replacement.id).toBe(first.id);
    expect(rows.rows[0]).toMatchObject({
      id: first.id,
      organizationId: organization.id,
      assetType: 'logo',
      contentType: 'image/svg+xml',
      fileSize: svg.length,
      data: svg,
    });
  });
});

describe('branding asset size migration specification', () => {
  // The new migration changes only the existing size constraint and deliberately cannot roll back.
  it('should define only positive type-sensitive limits in a forward-only migration', async () => {
    const migration = await readBrandingSizeMigration();
    const up = normalizeSql(migration.up);
    const down = normalizeSql(migration.down);

    expect(up).toMatch(
      /ALTER TABLE branding_assets DROP CONSTRAINT(?: IF EXISTS)? branding_assets_valid_size/i,
    );
    expect(up).toMatch(/ADD CONSTRAINT branding_assets_valid_size CHECK/i);
    expect(up).toMatch(/file_size\s*>\s*0/i);
    expect(up).toMatch(/asset_type\s*=\s*'logo'[\s\S]*file_size\s*<=\s*2097152/i);
    expect(up).toMatch(/asset_type\s*=\s*'favicon'[\s\S]*file_size\s*<=\s*524288/i);
    expect(up).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE TABLE|DROP TABLE)\b/i);
    expect(up).not.toMatch(/\b(?:ADD|DROP)\s+COLUMN\b/i);
    expect(down).toBe('SELECT 1;');
  });
});
