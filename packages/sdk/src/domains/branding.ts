/**
 * Branding domain — organization branding asset management.
 *
 * @module domains/branding
 */

import type { HttpTransport, TransportResponse } from '../transport/types.js';
import type { BrandingAssets } from '../types/index.js';
import { unwrapData } from './helpers.js';

/**
 * Input for `PUT /organizations/:id/branding` — mirrors the server
 * `updateBrandingSchema` (src/routes/organizations.ts). These are the flat
 * branding settings fields; `null` clears a field.
 */
export interface UpdateBrandingSettingsInput {
  logoUrl?: string | null;
  faviconUrl?: string | null;
  primaryColor?: string | null;
  companyName?: string | null;
  customCss?: string | null;
}

export interface BrandingDomain {
  getSettings(orgId: string): Promise<BrandingAssets>;
  updateSettings(orgId: string, input: UpdateBrandingSettingsInput): Promise<BrandingAssets>;
  getAsset(orgId: string, assetType: 'logo' | 'favicon'): Promise<TransportResponse>;
  uploadAsset(orgId: string, assetType: 'logo' | 'favicon', data: Blob | Buffer): Promise<void>;
  deleteAsset(orgId: string, assetType: 'logo' | 'favicon'): Promise<void>;
}


export function createBrandingDomain(transport: HttpTransport): BrandingDomain {
  function base(orgId: string) { return `/organizations/${orgId}/branding`; }

  return {
    async getSettings(orgId) {
      const res = await transport.request({ method: 'GET', path: base(orgId) });
      return unwrapData<BrandingAssets>(res.body);
    },
    async updateSettings(orgId, input) {
      const res = await transport.request({ method: 'PUT', path: base(orgId), body: input });
      return unwrapData<BrandingAssets>(res.body);
    },
    async getAsset(orgId, assetType) {
      return transport.request({ method: 'GET', path: `${base(orgId)}/${assetType}`, responseType: 'raw' });
    },
    async uploadAsset(orgId, assetType, data) {
      await transport.request({ method: 'PUT', path: `${base(orgId)}/${assetType}`, body: data, contentType: null });
    },
    async deleteAsset(orgId, assetType) {
      await transport.request({ method: 'DELETE', path: `${base(orgId)}/${assetType}` });
    },
  };
}
