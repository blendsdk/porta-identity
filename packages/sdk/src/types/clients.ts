/**
 * Client entity types for the Porta SDK.
 *
 * @module types/clients
 */

import type { LoginMethod } from './organizations.js';

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** Administrative client lifecycle state. */
export type ClientStatus = 'active' | 'inactive' | 'revoked';
/** Whether the client authenticates with a secret. */
export type ClientType = 'public' | 'confidential';
/** Client deployment model used for protocol defaults. */
export type ApplicationType = 'web' | 'native' | 'spa';
/** OAuth grants supported by Porta client registrations. */
export type GrantType = 'authorization_code' | 'client_credentials' | 'refresh_token';
/** OIDC response types supported by Porta. */
export type ResponseType = 'code';
/** Client-secret lifecycle state exposed by metadata responses. */
export type ClientSecretStatus = 'active' | 'revoked';
/** Token endpoint authentication methods accepted by the server. */
export type TokenEndpointAuthMethod = 'client_secret_basic' | 'client_secret_post' | 'none';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface Client {
  /** Internal client UUID used by administrative mutation routes. */
  id: string;
  /** Internal UUID of the owning organization. */
  organizationId: string;
  /** Internal UUID of the global application definition. */
  applicationId: string;
  /** Generated OIDC client identifier exposed to relying parties. */
  clientId: string;
  /** Administrative display name. */
  clientName: string;
  /** Whether the client can hold a secret. */
  clientType: ClientType;
  /** Deployment model used to apply protocol defaults. */
  applicationType: ApplicationType;
  /** Registered authorization redirect URIs. */
  redirectUris: string[];
  /** Registered post-logout redirect URIs. */
  postLogoutRedirectUris: string[];
  /** Enabled OAuth grant types. */
  grantTypes: GrantType[];
  /** Enabled OIDC response types. */
  responseTypes: ResponseType[];
  /** Space-delimited scope allowlist. */
  scope: string;
  /** Token endpoint authentication method. */
  tokenEndpointAuthMethod: TokenEndpointAuthMethod;
  /** Exact browser origins permitted by the server. */
  allowedOrigins: string[];
  /** Whether authorization-code requests require PKCE. */
  requirePkce: boolean;
  /** Per-client login-method override, or null to inherit. */
  loginMethods: LoginMethod[] | null;
  /** Effective login methods after organization inheritance. */
  effectiveLoginMethods: LoginMethod[];
  /** Current client lifecycle state. */
  status: ClientStatus;
  /** ISO timestamp for creation. */
  createdAt: string;
  /** ISO timestamp for the latest change. */
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface CreateClientInput {
  /** Internal UUID of the owning organization. */
  organizationId: string;
  /** Internal UUID of the global application definition. */
  applicationId: string;
  /** Administrative display name. */
  clientName: string;
  /** Whether the client can hold a secret. */
  clientType: ClientType;
  /** Deployment model used to apply protocol defaults. */
  applicationType: ApplicationType;
  /** Registered authorization redirect URIs. */
  redirectUris: string[];
  /** Registered post-logout redirect URIs. */
  postLogoutRedirectUris?: string[];
  /** Enabled OAuth grant types. */
  grantTypes?: GrantType[];
  /** Enabled OIDC response types. */
  responseTypes?: ResponseType[];
  /** Space-delimited scope allowlist. */
  scope?: string;
  /** Token endpoint authentication method. */
  tokenEndpointAuthMethod?: TokenEndpointAuthMethod;
  /** Exact browser origins permitted by the server. */
  allowedOrigins?: string[];
  /** Whether authorization-code requests require PKCE. */
  requirePkce?: boolean;
  /** Optional label for the initial confidential-client secret. */
  secretLabel?: string;
  /** Per-client login-method override, or null to inherit. */
  loginMethods?: LoginMethod[] | null;
}

export interface UpdateClientInput {
  /** Replacement administrative display name. */
  clientName?: string;
  /** Replacement authorization redirect URIs. */
  redirectUris?: string[];
  /** Replacement post-logout redirect URIs. */
  postLogoutRedirectUris?: string[];
  /** Replacement OAuth grant types. */
  grantTypes?: GrantType[];
  /** Replacement OIDC response types. */
  responseTypes?: ResponseType[];
  /** Replacement space-delimited scope allowlist. */
  scope?: string;
  /** Replacement token endpoint authentication method. */
  tokenEndpointAuthMethod?: TokenEndpointAuthMethod;
  /** Replacement exact browser origins. */
  allowedOrigins?: string[];
  /** Replacement PKCE requirement. */
  requirePkce?: boolean;
  /** Replacement login-method override, or null to inherit. */
  loginMethods?: LoginMethod[] | null;
}

// ---------------------------------------------------------------------------
// Client Secrets
// ---------------------------------------------------------------------------

export interface ClientSecret {
  /** Internal secret UUID. */
  id: string;
  /** Internal UUID of the owning client. */
  clientId: string;
  /** Optional administrative label. */
  label: string | null;
  /** Current secret lifecycle state. */
  status: ClientSecretStatus;
  /** ISO timestamp of the most recent successful use. */
  lastUsedAt: string | null;
  /** Optional ISO expiry timestamp. */
  expiresAt: string | null;
  /** ISO timestamp for creation. */
  createdAt: string;
}

export interface GenerateSecretInput {
  /** Optional administrative label. */
  label?: string;
  /** Optional ISO expiry timestamp. */
  expiresAt?: string;
}

export interface GeneratedSecret {
  /** Internal secret UUID. */
  id: string;
  /** Internal UUID of the owning client. */
  clientId: string;
  /** One-time plaintext returned only by create/generate operations. */
  plaintext: string;
  /** Optional administrative label. */
  label: string | null;
  /** Optional ISO expiry timestamp. */
  expiresAt: string | null;
  /** ISO timestamp for creation. */
  createdAt: string;
}
