/**
 * Resolve the presentation-only organization branding used by authentication pages and emails.
 *
 * Uploaded assets take precedence over configured external URLs. Optional branding must never
 * make authentication unavailable, so metadata lookup failures fall back without retrying.
 */

import { config } from '../config/index.js';
import { listAssets, type AssetType, type BrandingAsset } from '../lib/branding-assets.js';
import { logger } from '../lib/logger.js';
import { validateBrandingImageUrl } from '../organizations/branding-url.js';
import type { Organization } from '../organizations/types.js';

/** Default accent color used when an organization has not configured one. */
export const DEFAULT_BRANDING_PRIMARY_COLOR = '#3B82F6';

/** Branding values safe for direct use by page and email templates. */
export interface EffectiveBranding {
  /** Name displayed by authentication templates. */
  readonly companyName: string;
  /** CSS accent color used by authentication templates. */
  readonly primaryColor: string;
  /** Effective uploaded or configured logo URL. */
  readonly logoUrl: string | null;
  /** Effective uploaded or configured favicon URL. */
  readonly faviconUrl: string | null;
  /** Existing optional CSS customization retained for template compatibility. */
  readonly customCss: string | null;
  /** Unique CSP image sources required by the effective image URLs. */
  readonly imageSources: readonly string[];
}

/** Return whether metadata contains one exact uploaded asset slot. */
function hasAsset(assets: readonly BrandingAsset[], type: AssetType): boolean {
  return assets.some((asset) => asset.assetType === type);
}

/** Build a public uploaded-asset URL from the trusted configured issuer. */
function publicAssetUrl(organizationSlug: string, type: AssetType): string {
  const issuer = config.issuerBaseUrl.replace(/\/+$/, '');
  return `${issuer}/${encodeURIComponent(organizationSlug)}/branding/${type}`;
}

/** Validate a stored fallback URL again before it reaches markup or CSP construction. */
function safeConfiguredUrl(value: string | null): string | null {
  if (value === null || value.trim() === '') return null;
  try {
    return validateBrandingImageUrl(value);
  } catch {
    return null;
  }
}

/** Return the CSP source required by one effective image URL. */
function imageSource(url: string | null, uploaded: boolean): string | null {
  if (url === null) return null;
  if (uploaded) return "'self'";
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Resolve uploaded, configured, and default organization branding in precedence order.
 *
 * Database failures are deliberately non-fatal because branding is optional decoration. The
 * diagnostic excludes organization fields, configured URLs, stored data, and raw error details.
 *
 * @param organization - Organization whose presentation values are required.
 * @returns Effective template fields and their validated CSP image sources.
 */
export async function resolveEffectiveBranding(
  organization: Organization,
): Promise<EffectiveBranding> {
  let assets: readonly BrandingAsset[] = [];
  try {
    assets = await listAssets(organization.id);
  } catch {
    logger.warn(
      { event: 'branding-asset-metadata-unavailable' },
      'Branding asset metadata unavailable',
    );
  }

  const hasLogo = hasAsset(assets, 'logo');
  const hasFavicon = hasAsset(assets, 'favicon');
  const logoUrl = hasLogo
    ? publicAssetUrl(organization.slug, 'logo')
    : safeConfiguredUrl(organization.brandingLogoUrl);
  const faviconUrl = hasFavicon
    ? publicAssetUrl(organization.slug, 'favicon')
    : safeConfiguredUrl(organization.brandingFaviconUrl);
  const sources = [imageSource(logoUrl, hasLogo), imageSource(faviconUrl, hasFavicon)].filter(
    (source): source is string => source !== null,
  );

  return {
    companyName: organization.brandingCompanyName?.trim() || organization.name,
    primaryColor: organization.brandingPrimaryColor?.trim() || DEFAULT_BRANDING_PRIMARY_COLOR,
    logoUrl,
    faviconUrl,
    customCss: organization.brandingCustomCss,
    imageSources: [...new Set(sources)],
  };
}
