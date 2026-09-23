/**
 * Branding domain — organization branding asset management.
 *
 * @module domains/branding
 */

import type { HttpTransport, TransportResponse } from '../transport/types.js';
import type {
  BrandingAsset,
  BrandingAssetUploadInput,
  Organization,
  UpdateBrandingSettingsInput,
} from '../types/index.js';
import { unwrapData } from './helpers.js';

/** Organization branding settings and asset operations. */
export interface BrandingDomain {
  /**
   * List stored logo and favicon metadata without downloading image bytes.
   * @param orgId - Organization whose assets should be listed.
   * @returns Stored asset metadata.
   */
  listAssets(orgId: string): Promise<BrandingAsset[]>;
  /**
   * Update flat branding settings.
   * @param orgId - Organization whose settings should change.
   * @param input - Branding fields to update or clear.
   * @returns The complete updated organization.
   */
  updateSettings(orgId: string, input: UpdateBrandingSettingsInput): Promise<Organization>;
  /**
   * Read one protected asset as an unprocessed transport response.
   * @param orgId - Organization that owns the asset.
   * @param assetType - Branding slot to read.
   * @returns Raw transport response containing image bytes and headers.
   */
  getAsset(orgId: string, assetType: 'logo' | 'favicon'): Promise<TransportResponse>;
  /**
   * Create or replace one asset.
   * @param orgId - Organization that owns the asset.
   * @param assetType - Branding slot to create or replace.
   * @param input - Base64 image data and declared media type.
   * @returns Metadata for the stored asset.
   */
  uploadAsset(
    orgId: string,
    assetType: 'logo' | 'favicon',
    input: BrandingAssetUploadInput,
  ): Promise<BrandingAsset>;
  /**
   * Permanently remove one stored branding asset.
   * @param orgId - Organization that owns the asset.
   * @param assetType - Branding slot to remove.
   * @returns A promise that resolves after deletion succeeds.
   */
  deleteAsset(orgId: string, assetType: 'logo' | 'favicon'): Promise<void>;
}

/**
 * Create the branding domain for one configured transport.
 *
 * @param transport - HTTP transport used for Admin API requests.
 * @returns Branding settings and asset operations.
 *
 * @example
 * ```typescript
 * const branding = createBrandingDomain(transport);
 * const assets = await branding.listAssets(organizationId);
 * ```
 */
export function createBrandingDomain(transport: HttpTransport): BrandingDomain {
  function base(orgId: string): string {
    return `/organizations/${orgId}/branding`;
  }

  return {
    async listAssets(orgId) {
      const res = await transport.request({ method: 'GET', path: base(orgId) });
      return unwrapData<BrandingAsset[]>(res.body);
    },
    async updateSettings(orgId, input) {
      const res = await transport.request({ method: 'PUT', path: base(orgId), body: input });
      return unwrapData<Organization>(res.body);
    },
    async getAsset(orgId, assetType) {
      return transport.request({
        method: 'GET',
        path: `${base(orgId)}/${assetType}`,
        responseType: 'raw',
      });
    },
    async uploadAsset(orgId, assetType, input) {
      const res = await transport.request({
        method: 'PUT',
        path: `${base(orgId)}/${assetType}`,
        body: input,
      });
      return unwrapData<BrandingAsset>(res.body);
    },
    async deleteAsset(orgId, assetType) {
      await transport.request({ method: 'DELETE', path: `${base(orgId)}/${assetType}` });
    },
  };
}
