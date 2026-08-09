/**
 * Client entity types for the Porta SDK.
 *
 * @module types/clients
 */

import type { LoginMethod } from './organizations.js';

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type ClientStatus = 'active' | 'revoked';
export type ClientType = 'public' | 'confidential';
export type GrantType = 'authorization_code' | 'client_credentials' | 'refresh_token';
export type ResponseType = 'code';

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

export interface Client {
  id: string;
  applicationId: string;
  clientId: string;
  name: string;
  description: string | null;
  clientType: ClientType;
  status: ClientStatus;
  redirectUris: string[];
  postLogoutRedirectUris: string[];
  grantTypes: GrantType[];
  responseTypes: ResponseType[];
  tokenEndpointAuthMethod: string;
  loginMethods: LoginMethod[] | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface CreateClientInput {
  applicationId: string;
  name: string;
  description?: string;
  clientType?: ClientType;
  redirectUris: string[];
  postLogoutRedirectUris?: string[];
  grantTypes?: GrantType[];
  responseTypes?: ResponseType[];
  tokenEndpointAuthMethod?: string;
  loginMethods?: LoginMethod[] | null;
}

export interface UpdateClientInput {
  name?: string;
  description?: string | null;
  redirectUris?: string[];
  postLogoutRedirectUris?: string[];
  grantTypes?: GrantType[];
  responseTypes?: ResponseType[];
  tokenEndpointAuthMethod?: string;
  loginMethods?: LoginMethod[] | null;
}

// ---------------------------------------------------------------------------
// Client Secrets
// ---------------------------------------------------------------------------

export interface ClientSecret {
  id: string;
  clientId: string;
  label: string | null;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface GenerateSecretInput {
  label?: string;
  expiresAt?: string;
}

export interface GeneratedSecret {
  id: string;
  clientId: string;
  secret: string;
  label: string | null;
  expiresAt: string | null;
  createdAt: string;
}
