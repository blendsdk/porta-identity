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

/**
 * Nested branding object accepted by the org create/update schemas
 * (src/routes/organizations.ts — `branding{}`). `null` clears a field.
 */
export interface OrganizationBrandingInput {
  logoUrl?: string | null;
  faviconUrl?: string | null;
  primaryColor?: string | null;
  companyName?: string | null;
  customCss?: string | null;
}

/**
 * Input for creating an organization — mirrors the server
 * `createOrganizationSchema`. The server does NOT accept `twoFactorPolicy`
 * on create (AR-17/PF-005); branding is a nested object, not flat fields.
 */
export interface CreateOrganizationInput {
  name: string;
  slug?: string;
  defaultLocale?: string;
  defaultLoginMethods?: LoginMethod[];
  branding?: OrganizationBrandingInput;
}

/**
 * Input for updating an organization — mirrors the server
 * `updateOrganizationSchema`. The server does NOT accept `slug` or
 * `twoFactorPolicy` on update (PF-005); branding is a nested object.
 */
export interface UpdateOrganizationInput {
  name?: string;
  defaultLocale?: string;
  defaultLoginMethods?: LoginMethod[];
  branding?: OrganizationBrandingInput;
}

// ---------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------

export interface BrandingInput {
  logo?: Blob | Buffer;
  favicon?: Blob | Buffer;
}

