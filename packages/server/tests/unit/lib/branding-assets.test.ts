import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

import { getPool } from '../../../src/lib/database.js';
import {
  uploadAsset,
  getAsset,
  listAssets,
  deleteAsset,
} from '../../../src/lib/branding-assets.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const VALID_SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1" /></svg>',
);

/** Build a buffer with an exact PNG signature and the requested total size. */
function pngOfSize(size: number): Buffer {
  const data = Buffer.alloc(size);
  PNG_SIGNATURE.copy(data);
  return data;
}

function createMockPool() {
  return { query: vi.fn() };
}

describe('branding-assets', () => {
  let mockPool: ReturnType<typeof createMockPool>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPool = createMockPool();
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue(mockPool);
  });

  describe('uploadAsset', () => {
    it('should upload a valid PNG image', async () => {
      const now = new Date();
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 'asset-1',
            organizationId: 'org-1',
            assetType: 'logo',
            contentType: 'image/png',
            fileSize: 100,
            createdAt: now,
            updatedAt: now,
          },
        ],
      });

      const image = pngOfSize(100);
      const result = await uploadAsset('org-1', 'logo', 'image/png', image);
      expect(result.id).toBe('asset-1');
      expect(result.assetType).toBe('logo');
      const sql = mockPool.query.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO branding_assets');
      expect(sql).toContain('ON CONFLICT');
      expect(mockPool.query.mock.calls[0][1]).toEqual([
        'org-1',
        'logo',
        'image/png',
        image,
        image.length,
      ]);
    });

    it('should reject unsupported content types', async () => {
      await expect(
        uploadAsset('org-1', 'logo', 'application/pdf', Buffer.alloc(10)),
      ).rejects.toThrow('Unsupported content type');
    });

    it('should reject empty data', async () => {
      await expect(uploadAsset('org-1', 'logo', 'image/png', Buffer.alloc(0))).rejects.toThrow(
        'cannot be empty',
      );
    });

    it('should reject favicons larger than 512KB', async () => {
      const bigBuffer = pngOfSize(512 * 1024 + 1);
      await expect(uploadAsset('org-1', 'favicon', 'image/png', bigBuffer)).rejects.toThrow(
        'File too large',
      );
    });

    it('should accept SVG content type', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 'a1',
            organizationId: 'o1',
            assetType: 'logo',
            contentType: 'image/svg+xml',
            fileSize: 50,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });
      const result = await uploadAsset('o1', 'logo', 'image/svg+xml', VALID_SVG);
      expect(result.contentType).toBe('image/svg+xml');
    });

    it('should persist sanitized SVG bytes and their resulting size', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 'a1',
            organizationId: 'o1',
            assetType: 'logo',
            contentType: 'image/svg+xml',
            fileSize: 53,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });
      const unsafeSvg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect /></svg>',
      );
      const sanitizedSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>');

      await uploadAsset('o1', 'logo', 'image/svg+xml', unsafeSvg);

      expect(mockPool.query.mock.calls[0][1]).toEqual([
        'o1',
        'logo',
        'image/svg+xml',
        sanitizedSvg,
        sanitizedSvg.length,
      ]);
    });
  });

  describe('getAsset', () => {
    it('should return asset with data', async () => {
      const buf = Buffer.from('image-data');
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 'a1',
            organizationId: 'o1',
            assetType: 'favicon',
            contentType: 'image/x-icon',
            data: buf,
            fileSize: buf.length,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      const asset = await getAsset('o1', 'favicon');
      expect(asset).not.toBeNull();
      expect(asset!.data).toEqual(buf);
    });

    it('should return null for non-existent asset', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });
      const asset = await getAsset('o1', 'logo');
      expect(asset).toBeNull();
    });
  });

  describe('listAssets', () => {
    it('should return metadata without data', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 'a1',
            organizationId: 'o1',
            assetType: 'favicon',
            contentType: 'image/x-icon',
            fileSize: 100,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'a2',
            organizationId: 'o1',
            assetType: 'logo',
            contentType: 'image/png',
            fileSize: 200,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      const assets = await listAssets('o1');
      expect(assets).toHaveLength(2);
      // Verify no data field in list results (query doesn't SELECT data)
      const sql = mockPool.query.mock.calls[0][0] as string;
      expect(sql).not.toContain(', data,');
    });
  });

  describe('deleteAsset', () => {
    it('should return true when asset was deleted', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 1 });
      const result = await deleteAsset('o1', 'logo');
      expect(result).toBe(true);
    });

    it('should return false when asset did not exist', async () => {
      mockPool.query.mockResolvedValue({ rowCount: 0 });
      const result = await deleteAsset('o1', 'favicon');
      expect(result).toBe(false);
    });
  });
});
