/** Validated SDK boundary for selected-organization OIDC client administration. */

import {
  PortaAuthenticationError,
  PortaConflictError,
  PortaForbiddenError,
  PortaValidationError,
} from '@portaidentity/sdk';
import type {
  ClientsDomain,
  CreateClientInput,
  GenerateSecretInput,
  UpdateClientInput,
} from '@portaidentity/sdk';
import type {
  AdminClient,
  AdminClientMutationResult,
  AdminClientReadResult,
  AdminClientSecret,
  AdminGeneratedClientSecret,
} from './client-state.js';

export type * from './client-state.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns true when text contains a terminal control character. */
function containsTerminalControl(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) return true;
  }
  return false;
}

/** Validates bounded text retained by the terminal. */
function isText(value: unknown, maximum: number, minimum = 0): value is string {
  return (
    typeof value === 'string' &&
    value.length >= minimum &&
    value.length <= maximum &&
    !containsTerminalControl(value)
  );
}

/** Validates a display timestamp. */
function isTimestamp(value: unknown): value is string {
  if (
    !isText(value, 40, 20) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)
  ) {
    return false;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 19) === value.slice(0, 19);
}

/** Validates an optional display timestamp. */
function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || isTimestamp(value);
}

/** Validates an optional bounded, control-free HTTP entity tag. */
function isEtag(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && /^W\/"[0-9a-f]{16}"$/.test(value));
}

/** Returns true for a non-array object that can be inspected by field name. */
function isObjectValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Returns an object-shaped untrusted value. */
function objectValue(value: unknown): Record<string, unknown> | undefined {
  return isObjectValue(value) ? value : undefined;
}

/** Validates one bounded string collection. */
function stringCollection(
  value: unknown,
  maximumItems: number,
  maximumLength: number,
  minimumItems = 0,
): readonly string[] | undefined {
  if (!Array.isArray(value) || value.length < minimumItems || value.length > maximumItems) {
    return undefined;
  }
  const result: string[] = [];
  for (const entry of value) {
    if (!isText(entry, maximumLength, 1)) return undefined;
    result.push(entry);
  }
  return Object.freeze(result);
}

/** Validates one closed login-method collection. */
function loginMethods(
  value: unknown,
  nullable: boolean,
): readonly ('password' | 'magic_link')[] | null | undefined {
  if (nullable && value === null) return null;
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) return undefined;
  const methods: ('password' | 'magic_link')[] = [];
  for (const method of value) {
    if (method !== 'password' && method !== 'magic_link') return undefined;
    methods.push(method);
  }
  return Object.freeze(methods);
}

/** Validates the closed OAuth grant-type collection. */
function grantTypes(value: unknown): AdminClient['grantTypes'] | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) return undefined;
  const grants: Array<AdminClient['grantTypes'][number]> = [];
  for (const grant of value) {
    if (
      grant !== 'authorization_code' &&
      grant !== 'client_credentials' &&
      grant !== 'refresh_token'
    ) {
      return undefined;
    }
    grants.push(grant);
  }
  return Object.freeze(grants);
}

/** Validates the closed OIDC response-type collection. */
function responseTypes(value: unknown): AdminClient['responseTypes'] | undefined {
  if (!Array.isArray(value) || value.length !== 1 || value[0] !== 'code') return undefined;
  return Object.freeze(['code']);
}

/** Validates a safe absolute redirect URI without fragments or wildcards. */
function isRedirectUri(value: string): boolean {
  if (!isText(value, 2_048, 1) || value.includes('*')) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol.length > 1 && parsed.hash === '';
  } catch {
    return false;
  }
}

/** Validates an exact HTTP or HTTPS browser origin. */
function isAllowedOrigin(value: string): boolean {
  if (!isText(value, 2_048, 1) || value.includes('*')) return false;
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.pathname === '/' &&
      parsed.search === '' &&
      parsed.hash === '' &&
      parsed.origin === value
    );
  } catch {
    return false;
  }
}

/** Validates the public/confidential protocol relationships used by Porta. */
function hasCompatibleProtocol(
  clientType: AdminClient['clientType'],
  grants: AdminClient['grantTypes'],
  authenticationMethod: AdminClient['tokenEndpointAuthMethod'],
  requirePkce: boolean,
): boolean {
  if (clientType === 'public') {
    return (
      authenticationMethod === 'none' &&
      requirePkce &&
      !grants.includes('client_credentials')
    );
  }
  return authenticationMethod !== 'none';
}

/** Projects one complete organization-owned client or rejects it. */
function clientValue(value: unknown, organizationId: string): AdminClient | undefined {
  const candidate = objectValue(value);
  const redirects = candidate ? stringCollection(candidate.redirectUris, 10, 2_048, 1) : undefined;
  const logoutRedirects = candidate
    ? stringCollection(candidate.postLogoutRedirectUris, 10, 2_048)
    : undefined;
  const grants = candidate ? grantTypes(candidate.grantTypes) : undefined;
  const responses = candidate ? responseTypes(candidate.responseTypes) : undefined;
  const origins = candidate ? stringCollection(candidate.allowedOrigins, 10, 2_048) : undefined;
  const override = candidate ? loginMethods(candidate.loginMethods, true) : undefined;
  const effective = candidate ? loginMethods(candidate.effectiveLoginMethods, false) : undefined;
  if (
    !candidate ||
    typeof candidate.id !== 'string' ||
    !UUID.test(candidate.id) ||
    candidate.organizationId !== organizationId ||
    typeof candidate.applicationId !== 'string' ||
    !UUID.test(candidate.applicationId) ||
    !isText(candidate.clientId, 255, 1) ||
    !isText(candidate.clientName, 255, 1) ||
    !(candidate.clientType === 'public' || candidate.clientType === 'confidential') ||
    !(
      candidate.applicationType === 'web' ||
      candidate.applicationType === 'native' ||
      candidate.applicationType === 'spa'
    ) ||
    !redirects ||
    !redirects.every(isRedirectUri) ||
    !logoutRedirects ||
    !logoutRedirects.every(isRedirectUri) ||
    !grants ||
    !responses ||
    !isText(candidate.scope, 2_048, 1) ||
    !(
      candidate.tokenEndpointAuthMethod === 'client_secret_basic' ||
      candidate.tokenEndpointAuthMethod === 'client_secret_post' ||
      candidate.tokenEndpointAuthMethod === 'none'
    ) ||
    !origins ||
    !origins.every(isAllowedOrigin) ||
    typeof candidate.requirePkce !== 'boolean' ||
    !hasCompatibleProtocol(
      candidate.clientType,
      grants,
      candidate.tokenEndpointAuthMethod,
      candidate.requirePkce,
    ) ||
    override === undefined ||
    !effective ||
    !(
      candidate.status === 'active' ||
      candidate.status === 'inactive' ||
      candidate.status === 'revoked'
    ) ||
    !isTimestamp(candidate.createdAt) ||
    !isTimestamp(candidate.updatedAt)
  ) {
    return undefined;
  }
  return Object.freeze({
    id: candidate.id,
    organizationId,
    applicationId: candidate.applicationId,
    clientId: candidate.clientId,
    clientName: candidate.clientName,
    clientType: candidate.clientType,
    applicationType: candidate.applicationType,
    redirectUris: redirects,
    postLogoutRedirectUris: logoutRedirects,
    grantTypes: grants,
    responseTypes: responses,
    scope: candidate.scope,
    tokenEndpointAuthMethod: candidate.tokenEndpointAuthMethod,
    allowedOrigins: origins,
    requirePkce: candidate.requirePkce,
    loginMethods: override,
    effectiveLoginMethods: effective,
    status: candidate.status,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  });
}

/** Projects secret metadata and rejects plaintext-bearing values. */
function secretValue(value: unknown, clientId: string): AdminClientSecret | undefined {
  const candidate = objectValue(value);
  if (
    !candidate ||
    'plaintext' in candidate ||
    typeof candidate.id !== 'string' ||
    !UUID.test(candidate.id) ||
    candidate.clientId !== clientId ||
    !(candidate.label === null || isText(candidate.label, 255)) ||
    !(candidate.status === 'active' || candidate.status === 'revoked') ||
    !isNullableTimestamp(candidate.lastUsedAt) ||
    !isNullableTimestamp(candidate.expiresAt) ||
    !isTimestamp(candidate.createdAt)
  ) {
    return undefined;
  }
  return Object.freeze({
    id: candidate.id,
    clientId,
    label: candidate.label,
    status: candidate.status,
    lastUsedAt: candidate.lastUsedAt,
    expiresAt: candidate.expiresAt,
    createdAt: candidate.createdAt,
  });
}

/** Projects one one-time generated secret for a synchronous continuation. */
function generatedSecretValue(
  value: unknown,
  clientId: string,
): AdminGeneratedClientSecret | undefined {
  const candidate = objectValue(value);
  if (
    !candidate ||
    typeof candidate.id !== 'string' ||
    !UUID.test(candidate.id) ||
    candidate.clientId !== clientId ||
    !(candidate.label === null || isText(candidate.label, 255)) ||
    !isText(candidate.plaintext, 4_096, 1) ||
    !isNullableTimestamp(candidate.expiresAt) ||
    !isTimestamp(candidate.createdAt)
  ) {
    return undefined;
  }
  return Object.freeze({
    id: candidate.id,
    clientId,
    label: candidate.label,
    plaintext: candidate.plaintext,
    expiresAt: candidate.expiresAt,
    createdAt: candidate.createdAt,
  });
}

/** Projects a complete collection without returning partial values. */
function collection<T>(
  value: unknown,
  project: (entry: unknown) => T | undefined,
): readonly T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = new Set<string>();
  const projected: T[] = [];
  for (const entry of value) {
    const item = project(entry);
    const candidate = objectValue(item);
    if (!item || !candidate || typeof candidate.id !== 'string' || ids.has(candidate.id)) {
      return undefined;
    }
    ids.add(candidate.id);
    projected.push(item);
  }
  return Object.freeze(projected);
}

/** Maps a read error to a fixed safe result. */
function readError(error: unknown): AdminClientReadResult<never> {
  if (error instanceof PortaAuthenticationError) return { kind: 'session-invalid' };
  if (error instanceof PortaValidationError) return { kind: 'failure', failure: 'validation' };
  if (error instanceof PortaForbiddenError) return { kind: 'failure', failure: 'unauthorized' };
  if (error instanceof PortaConflictError) return { kind: 'failure', failure: 'conflict' };
  return { kind: 'failure', failure: 'unavailable' };
}

/** Maps a mutation error to a fixed safe result. */
function mutationError(error: unknown): Exclude<AdminClientMutationResult, { kind: 'success' }> {
  if (error instanceof DOMException && error.name === 'AbortError') return { kind: 'cancelled' };
  if (error instanceof PortaAuthenticationError) return { kind: 'session-invalid' };
  if (error instanceof PortaValidationError) return { kind: 'failure', failure: 'validation' };
  if (error instanceof PortaForbiddenError) return { kind: 'failure', failure: 'unauthorized' };
  if (error instanceof PortaConflictError) return { kind: 'failure', failure: 'conflict' };
  return { kind: 'outcome-unknown' };
}

/** Successful client creation before the plaintext continuation is disposed. */
export interface AdminClientCreateResult {
  /** Validated created client. */
  readonly client: AdminClient;
  /** One-time confidential-client secret, when returned. */
  readonly secret?: AdminGeneratedClientSecret;
}

/** Exact client operations consumed by controllers and later views. */
export interface AdminClientOperations {
  /** Loads every validated client for exactly one organization. */
  readonly listAll: (
    organizationId: string,
  ) => Promise<AdminClientReadResult<readonly AdminClient[]>>;
  /** Loads one validated organization-owned client and its update precondition. */
  readonly get: (
    organizationId: string,
    clientId: string,
  ) => Promise<AdminClientReadResult<{ client: AdminClient; etag: string | null }>>;
  /** Creates one client in exactly one organization. */
  readonly create: (
    organizationId: string,
    input: Omit<CreateClientInput, 'organizationId'>,
  ) => Promise<AdminClientMutationResult<AdminClientCreateResult>>;
  /** Updates mutable client configuration. */
  readonly update: (
    organizationId: string,
    clientId: string,
    input: UpdateClientInput,
    etag?: string,
    signal?: AbortSignal,
  ) => Promise<AdminClientMutationResult<AdminClient>>;
  /** Activates one client. */
  readonly activate: (
    organizationId: string,
    clientId: string,
    signal?: AbortSignal,
  ) => Promise<AdminClientMutationResult>;
  /** Deactivates one client. */
  readonly deactivate: (
    organizationId: string,
    clientId: string,
    signal?: AbortSignal,
  ) => Promise<AdminClientMutationResult>;
  /** Permanently revokes one client. */
  readonly revoke: (
    organizationId: string,
    clientId: string,
    signal?: AbortSignal,
  ) => Promise<AdminClientMutationResult>;
  /** Lists metadata-only secrets for one confidential client. */
  readonly listSecrets: (
    organizationId: string,
    clientId: string,
  ) => Promise<AdminClientReadResult<readonly AdminClientSecret[]>>;
  /** Generates one transient plaintext secret. */
  readonly generateSecret: (
    organizationId: string,
    clientId: string,
    input?: GenerateSecretInput,
    signal?: AbortSignal,
  ) => Promise<AdminClientMutationResult<AdminGeneratedClientSecret>>;
  /** Permanently revokes one nested secret. */
  readonly revokeSecret: (
    organizationId: string,
    clientId: string,
    secretId: string,
    signal?: AbortSignal,
  ) => Promise<AdminClientMutationResult>;
}

type AdminClientDomain = Pick<
  ClientsDomain,
  | 'listAll'
  | 'get'
  | 'create'
  | 'update'
  | 'activate'
  | 'deactivate'
  | 'revoke'
  | 'listSecrets'
  | 'generateSecret'
  | 'revokeSecret'
>;

/** Verifies that an existing client belongs to the active organization before further work. */
async function readOwnedClient(
  remote: AdminClientDomain,
  organizationId: string,
  clientId: string,
): Promise<AdminClientReadResult<AdminClient>> {
  try {
    const response = await remote.get(clientId);
    const value = clientValue(response.data, organizationId);
    if (value?.id !== clientId) return { kind: 'failure', failure: 'invalid-response' };
    return value
      ? { kind: 'success', value }
      : { kind: 'failure', failure: 'invalid-response' };
  } catch (error) {
    return readError(error);
  }
}

/** Converts a pre-dispatch ownership result to a mutation result. */
function ownershipMutationFailure(
  result: Exclude<AdminClientReadResult<AdminClient>, { kind: 'success' }>,
): Exclude<AdminClientMutationResult, { kind: 'success' }> {
  return result.kind === 'session-invalid'
    ? result
    : { kind: 'failure', failure: result.failure };
}

/** Invokes one void mutation exactly once. */
async function voidMutation(invoke: () => Promise<unknown>): Promise<AdminClientMutationResult> {
  try {
    await invoke();
    return { kind: 'success' };
  } catch (error) {
    return mutationError(error);
  }
}

/** Creates the feature-local client SDK adapter. */
export function createAdminClientOperations(
  domain: () => AdminClientDomain,
): AdminClientOperations {
  return {
    async listAll(organizationId) {
      if (!UUID.test(organizationId)) return { kind: 'failure', failure: 'validation' };
      try {
        const value = collection(await domain().listAll({ organizationId }), (entry) =>
          clientValue(entry, organizationId),
        );
        return value
          ? { kind: 'success', value }
          : { kind: 'failure', failure: 'invalid-response' };
      } catch (error) {
        return readError(error);
      }
    },
    async get(organizationId, clientId) {
      if (!UUID.test(organizationId) || !UUID.test(clientId)) {
        return { kind: 'failure', failure: 'validation' };
      }
      try {
        const response = await domain().get(clientId);
        const value = clientValue(response.data, organizationId);
        if (!value || value.id !== clientId || !isEtag(response.etag)) {
          return { kind: 'failure', failure: 'invalid-response' };
        }
        return { kind: 'success', value: { client: value, etag: response.etag } };
      } catch (error) {
        return readError(error);
      }
    },
    async create(organizationId, input) {
      if (!UUID.test(organizationId)) return { kind: 'failure', failure: 'validation' };
      try {
        const response = await domain().create({ ...input, organizationId });
        const created = clientValue(response.client, organizationId);
        const generated = response.secret
          ? generatedSecretValue(response.secret, response.client.id)
          : undefined;
        if (
          !created ||
          (created.clientType === 'confidential' && !generated) ||
          (created.clientType === 'public' && generated)
        ) {
          return { kind: 'outcome-unknown' };
        }
        return {
          kind: 'success',
          value: generated ? { client: created, secret: generated } : { client: created },
        };
      } catch (error) {
        return mutationError(error);
      }
    },
    async update(organizationId, clientId, input, etag, signal) {
      if (!UUID.test(organizationId) || !UUID.test(clientId)) {
        return { kind: 'failure', failure: 'validation' };
      }
      try {
        const remote = domain();
        const ownership = await readOwnedClient(remote, organizationId, clientId);
        if (ownership.kind !== 'success') return ownershipMutationFailure(ownership);
        if (signal?.aborted) return { kind: 'cancelled' };
        const value = clientValue(await remote.update(clientId, input, etag), organizationId);
        return value
          ? { kind: 'success', value }
          : { kind: 'outcome-unknown' };
      } catch (error) {
        return mutationError(error);
      }
    },
    async activate(organizationId, clientId, signal) {
      if (!UUID.test(organizationId) || !UUID.test(clientId)) {
        return { kind: 'failure', failure: 'validation' };
      }
      const remote = domain();
      const ownership = await readOwnedClient(remote, organizationId, clientId);
      if (ownership.kind === 'success' && signal?.aborted) return { kind: 'cancelled' };
      return ownership.kind === 'success'
        ? voidMutation(() => remote.activate(clientId))
        : ownershipMutationFailure(ownership);
    },
    async deactivate(organizationId, clientId, signal) {
      if (!UUID.test(organizationId) || !UUID.test(clientId)) {
        return { kind: 'failure', failure: 'validation' };
      }
      const remote = domain();
      const ownership = await readOwnedClient(remote, organizationId, clientId);
      if (ownership.kind === 'success' && signal?.aborted) return { kind: 'cancelled' };
      return ownership.kind === 'success'
        ? voidMutation(() => remote.deactivate(clientId))
        : ownershipMutationFailure(ownership);
    },
    async revoke(organizationId, clientId, signal) {
      if (!UUID.test(organizationId) || !UUID.test(clientId)) {
        return { kind: 'failure', failure: 'validation' };
      }
      const remote = domain();
      const ownership = await readOwnedClient(remote, organizationId, clientId);
      if (ownership.kind === 'success' && signal?.aborted) return { kind: 'cancelled' };
      return ownership.kind === 'success'
        ? voidMutation(() => remote.revoke(clientId))
        : ownershipMutationFailure(ownership);
    },
    async listSecrets(organizationId, clientId) {
      if (!UUID.test(organizationId) || !UUID.test(clientId)) {
        return { kind: 'failure', failure: 'validation' };
      }
      try {
        const remote = domain();
        const ownership = await readOwnedClient(remote, organizationId, clientId);
        if (ownership.kind !== 'success') return ownership;
        const value = collection(await remote.listSecrets(clientId), (entry) =>
          secretValue(entry, clientId),
        );
        return value
          ? { kind: 'success', value }
          : { kind: 'failure', failure: 'invalid-response' };
      } catch (error) {
        return readError(error);
      }
    },
    async generateSecret(organizationId, clientId, input, signal) {
      if (!UUID.test(organizationId) || !UUID.test(clientId)) {
        return { kind: 'failure', failure: 'validation' };
      }
      try {
        const remote = domain();
        const ownership = await readOwnedClient(remote, organizationId, clientId);
        if (ownership.kind !== 'success') return ownershipMutationFailure(ownership);
        if (signal?.aborted) return { kind: 'cancelled' };
        const value = generatedSecretValue(
          await remote.generateSecret(clientId, input),
          clientId,
        );
        return value
          ? { kind: 'success', value }
          : { kind: 'outcome-unknown' };
      } catch (error) {
        return mutationError(error);
      }
    },
    async revokeSecret(organizationId, clientId, secretId, signal) {
      if (!UUID.test(organizationId) || !UUID.test(clientId) || !UUID.test(secretId)) {
        return { kind: 'failure', failure: 'validation' };
      }
      const remote = domain();
      const ownership = await readOwnedClient(remote, organizationId, clientId);
      if (ownership.kind === 'success' && signal?.aborted) return { kind: 'cancelled' };
      return ownership.kind === 'success'
        ? voidMutation(() => remote.revokeSecret(clientId, secretId))
        : ownershipMutationFailure(ownership);
    },
  };
}
