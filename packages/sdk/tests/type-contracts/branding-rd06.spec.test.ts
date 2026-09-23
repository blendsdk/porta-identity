import { describe, expectTypeOf, it } from 'vitest';
import type {
  BrandingAsset,
  BrandingAssetContentType,
  BrandingAssetUploadInput,
  BrandingDomain,
  Organization,
  TransportResponse,
  UpdateBrandingSettingsInput,
} from '../../src/index.js';

type ExpectedBrandingContentType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/x-icon'
  | 'image/vnd.microsoft.icon'
  | 'image/svg+xml';

type ExpectedBrandingAsset = {
  id: string;
  organizationId: string;
  assetType: 'logo' | 'favicon';
  contentType: ExpectedBrandingContentType;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
};

type ExpectedBrandingUploadInput = {
  data: string;
  contentType: ExpectedBrandingContentType;
};

type ExpectedBrandingSettingsInput = {
  logoUrl?: string | null;
  faviconUrl?: string | null;
  primaryColor?: string | null;
  companyName?: string | null;
  customCss?: string | null;
};

type ExpectedBrandingDomain = {
  listAssets(orgId: string): Promise<BrandingAsset[]>;
  updateSettings(orgId: string, input: UpdateBrandingSettingsInput): Promise<Organization>;
  uploadAsset(
    orgId: string,
    assetType: 'logo' | 'favicon',
    input: BrandingAssetUploadInput,
  ): Promise<BrandingAsset>;
  getAsset(orgId: string, assetType: 'logo' | 'favicon'): Promise<TransportResponse>;
  deleteAsset(orgId: string, assetType: 'logo' | 'favicon'): Promise<void>;
};

describe('branding SDK type specification', () => {
  it('should expose exact branding media, upload, metadata, and settings types', () => {
    expectTypeOf<BrandingAssetContentType>().toEqualTypeOf<ExpectedBrandingContentType>();
    expectTypeOf<BrandingAssetUploadInput>().toEqualTypeOf<ExpectedBrandingUploadInput>();
    expectTypeOf<BrandingAsset>().toEqualTypeOf<ExpectedBrandingAsset>();
    expectTypeOf<UpdateBrandingSettingsInput>().toEqualTypeOf<ExpectedBrandingSettingsInput>();
    expectTypeOf<BrandingAsset['assetType']>().toEqualTypeOf<'logo' | 'favicon'>();
  });

  // Exact function equality rejects binary overloads, multipart variants, and compatibility shims.
  it('should expose only the direct branding domain contract without a settings alias', () => {
    expectTypeOf<BrandingDomain>().toEqualTypeOf<ExpectedBrandingDomain>();
    expectTypeOf<Extract<keyof BrandingDomain, 'getSettings'>>().toEqualTypeOf<never>();
  });
});
