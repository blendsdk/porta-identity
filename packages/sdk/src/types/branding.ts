/** Branding image media types accepted by the Admin API. */
export type BrandingAssetContentType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/x-icon'
  | 'image/vnd.microsoft.icon'
  | 'image/svg+xml';

/** Metadata for one stored organization branding image. */
export interface BrandingAsset {
  /** Stable asset identifier. */
  id: string;
  /** Organization that owns the asset. */
  organizationId: string;
  /** Branding slot occupied by the asset. */
  assetType: 'logo' | 'favicon';
  /** Media type confirmed by server-side validation. */
  contentType: BrandingAssetContentType;
  /** Number of decoded bytes stored by the server. */
  fileSize: number;
  /** ISO date-time at which the asset was created. */
  createdAt: string;
  /** ISO date-time at which the asset was last replaced. */
  updatedAt: string;
}

/** JSON/base64 upload envelope for one branding image. */
export interface BrandingAssetUploadInput {
  /** Image bytes encoded as standard base64. */
  data: string;
  /** Declared media type that the server verifies against the bytes. */
  contentType: BrandingAssetContentType;
}

/** Flat organization branding fields accepted by the branding settings endpoint. */
export interface UpdateBrandingSettingsInput {
  /** External logo fallback URL, or `null` to clear it. */
  logoUrl?: string | null;
  /** External favicon fallback URL, or `null` to clear it. */
  faviconUrl?: string | null;
  /** Six-digit hexadecimal primary color, or `null` to restore the default. */
  primaryColor?: string | null;
  /** Company display name, or `null` to use the organization name. */
  companyName?: string | null;
  /** Existing custom template CSS, or `null` to clear it. */
  customCss?: string | null;
}
