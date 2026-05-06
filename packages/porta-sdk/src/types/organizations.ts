/**
 * Organization entity types for the Porta SDK.
 *
 * @module types/organizations
 */

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type OrganizationStatus = 'active' | 'suspended' | 'archived';
export type TwoFactorPolicy = 'optional' | 'required_email' | 'required_totp' | 'required_any';
export type LoginMethod = 'password' | 'magic_link';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  isSuperAdmin: boolean;
  brandingLogoUrl: string | null;
  brandingFaviconUrl: string | null;
  brandingPrimaryColor: string | null;
  brandingCompanyName: string | null;
  brandingCustomCss: string | null;
  defaultLocale: string;
  twoFactorPolicy: TwoFactorPolicy;
  defaultLoginMethods: LoginMethod[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface CreateOrganizationInput {
  name: string;
  slug?: string;
  defaultLocale?: string;
  twoFactorPolicy?: TwoFactorPolicy;
  defaultLoginMethods?: LoginMethod[];
}

export interface UpdateOrganizationInput {
  name?: string;
  slug?: string;
  defaultLocale?: string;
  twoFactorPolicy?: TwoFactorPolicy;
  defaultLoginMethods?: LoginMethod[];
  brandingPrimaryColor?: string | null;
  brandingCompanyName?: string | null;
  brandingCustomCss?: string | null;
}

// ---------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------

export interface BrandingInput {
  logo?: Blob | Buffer;
  favicon?: Blob | Buffer;
}
