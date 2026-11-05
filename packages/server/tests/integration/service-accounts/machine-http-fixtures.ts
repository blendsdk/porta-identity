/**
 * Real HTTP fixtures for invitation-only machine access. Only human token lookup
 * and outgoing email are substituted; native machine tokens and live authority
 * always use the application, provider, PostgreSQL and Redis.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type Provider from 'oidc-provider';

import { initI18n, initTemplateEngine, setEmailTransport } from '../../../src/auth/index.js';
import { updateClient } from '../../../src/clients/index.js';
import { generateAndStore } from '../../../src/clients/secret-service.js';
import { getPool } from '../../../src/lib/database.js';
import { getRedis } from '../../../src/lib/redis.js';
import { ensureSigningKeys } from '../../../src/lib/signing-keys.js';
import { loadOidcTtlConfig } from '../../../src/lib/system-config.js';
import { clearAdminAuthProvider, setAdminAuthProvider } from '../../../src/middleware/admin-auth.js';
import { createOidcProvider } from '../../../src/oidc/provider.js';
import { createApp } from '../../../src/server.js';
import { setServiceAccount } from '../../../src/service-accounts/index.js';
import type { ServiceAccountBinding } from '../../../src/service-accounts/index.js';
import { createLifecycleFixture, readLifecycleSecrets } from './lifecycle-fixtures.js';
import type { LifecycleActor, LifecycleFixture } from './lifecycle-fixtures.js';

/** Real secret authentication methods supported by these fixtures. */
export type MachineAuthMethod = 'client_secret_basic' | 'client_secret_post';

/** Initial client authentication and binding state. */
export interface MachineHttpFixtureOptions {
  /** Provision a binding unless explicitly false. */
  bound?: boolean;
  /** Configure Basic authentication unless POST authentication is requested. */
  method?: MachineAuthMethod;
}

/** An owned full application and the real identities used to call it. */
export interface MachineHttpFixture {
  /** Existing control-plane, human actor and ordinary target definitions. */
  lifecycle: LifecycleFixture;
  /** Genuine provider used for both issuance and native model lookup. */
  provider: Provider;
  /** Origin of the owned loopback listener, without a trailing slash. */
  baseUrl: string;
  /** Actual control-plane organization slug read from storage. */
  adminSlug: string;
  /** Initial binding; null only for explicitly unbound setup. */
  binding: ServiceAccountBinding | null;
  /** Active credential material kept in memory and never included in errors. */
  credential: {
    /** Existing secret row identity. */
    id: string;
    /** One-time plaintext used only to authenticate fixture requests. */
    plaintext: string;
  };
  /** Observation of the outgoing email boundary, without message contents. */
  mail: {
    /** Number of calls made to the fixture transport. */
    attempts: number;
  };
  /** Map an unpredictable opaque token to a real actor ID, not claimed roles. */
  humanToken(actor: LifecycleActor): string;
  /** Close HTTP connections and clear fixture seams, leaving worker stores owned by the runner. */
  close(): Promise<void>;
}

/** Overrides for a real client-credentials token request. */
export interface MachineTokenOptions {
  /** Plaintext credential override, including an intentionally invalid value. */
  secret?: string;
  /** Public OAuth client identifier, not the internal client UUID. */
  clientId?: string;
  /** Organization slug selecting the real token endpoint. */
  issuerSlug?: string;
  /** Requested scope; an empty string remains empty. */
  scope?: string;
  /** Authentication method; defaults to the fixture client's configured method. */
  method?: MachineAuthMethod;
  /** Raw form fields applied last, so caller-input attacks reach the application. */
  fields?: Record<string, string>;
}

/** One request to the owned application, without retries or authentication fallback. */
export interface MachineRequestOptions {
  /** Actual HTTP method sent to the listener. */
  method: string;
  /** Origin-relative path, including any query string. */
  path: string;
  /** Bearer token used unless an explicit Authorization header is supplied. */
  token?: string;
  /** Value encoded with native JSON.stringify when rawBody is absent. */
  body?: unknown;
  /** Exact request bytes, including unusual JSON number syntax or deep values. */
  rawBody?: string;
  /** Explicit headers take precedence over generated defaults. */
  headers?: RequestInit['headers'];
}

/** Unmodified HTTP outcome plus an object-only JSON projection. */
export interface MachineHttpResponse {
  /** Actual HTTP status; unsuccessful responses are not converted into exceptions. */
  status: number;
  /** Parsed JSON object, or an empty object for non-object/non-JSON responses. */
  body: Record<string, unknown>;
  /** Exact response text; callers must not print credential-bearing responses. */
  text: string;
  /** Actual response headers, including rate-limit observations. */
  headers: Headers;
}

/** Token response without a second copy of the credential-bearing raw text. */
export type MachineTokenResponse = Pick<MachineHttpResponse, 'status' | 'body'>;

/** Non-secret persisted invitation fields used by independent assertions. */
export interface MachineInvitation {
  /** Durable invitation identity. */
  id: string;
  /** Native JSON details, without reading the invitation token or its hash. */
  details: Record<string, unknown>;
  /** Stored inviter identity, including null when that is the persisted result. */
  invitedBy: string | null;
}

/** Narrow an unknown JSON value without unsafe casts. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Refuse destructive resets unless the worker explicitly names both owned stores. */
function assertOwnedMachineStores(): void {
  const env = process.env;
  if (
    env.NODE_ENV !== 'test'
    || !env.TEST_DATABASE_URL || !env.DATABASE_URL
    || env.DATABASE_URL !== env.TEST_DATABASE_URL
    || !env.TEST_REDIS_URL || !env.REDIS_URL
    || env.REDIS_URL !== env.TEST_REDIS_URL
  ) {
    throw new Error('Machine HTTP fixtures require explicitly matched test database and Redis URLs');
  }
}

/** Parse without allowing malformed response bytes to escape in a JSON parse error. */
function parseMachineBody(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text);
    return isRecord(value) ? value : {};
  } catch {
    return {};
  }
}

/** Bind only an ephemeral IPv4 loopback port and report failures without runtime details. */
function listenMachineHttp(server: Server): Promise<string> {
  return new Promise((resolve, reject) => {
    const failed = (): void => { reject(new Error('Machine HTTP listener could not start')); };
    server.once('error', failed);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', failed);
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Machine HTTP listener has no loopback address'));
        return;
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

/**
 * Start the full application after checking reset ownership. Bound setup admits
 * both ordinary lifecycle targets and generates a new secret after promotion.
 * Rendering, signing keys and authority stores remain real.
 * @example
 * const fixture = await createMachineHttpFixture({ method: 'client_secret_post' });
 * try { await issueMachineToken(fixture); } finally { await fixture.close(); }
 */
export async function createMachineHttpFixture(
  options: MachineHttpFixtureOptions = {},
): Promise<MachineHttpFixture> {
  assertOwnedMachineStores();
  let server: Server | undefined;
  let closed = false;
  const humanTokens = new Map<string, string>();
  const mail = { attempts: 0 };

  /** Stop accepting requests before destroying connections; always clear external seams. */
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    try {
      const listener = server;
      if (listener?.listening) {
        await new Promise<void>((resolve, reject) => {
          listener.close((error) => {
            if (error) reject(new Error('Machine HTTP listener could not close'));
            else resolve();
          });
          listener.closeAllConnections();
        });
      } else {
        listener?.closeAllConnections();
      }
    } finally {
      humanTokens.clear();
      clearAdminAuthProvider();
      setEmailTransport(null);
    }
  };

  try {
    await getRedis().flushdb();
    const lifecycle = await createLifecycleFixture();
    lifecycle.client = await updateClient(lifecycle.client.id, {
      grantTypes: ['client_credentials'],
      responseTypes: ['code'],
      scope: 'admin:user:invite',
      tokenEndpointAuthMethod: options.method ?? 'client_secret_basic',
    }, lifecycle.actor.id);
    const organizations = await getPool().query<{ slug: string }>(
      'SELECT slug FROM organizations WHERE id = $1', [lifecycle.adminOrganization.id],
    );
    const adminSlug = organizations.rows[0]?.slug;
    if (!adminSlug) throw new Error('Machine fixture administrative organization is missing');

    await Promise.resolve(initI18n());
    await Promise.resolve(initTemplateEngine());
    setEmailTransport({
      send(message) {
        mail.attempts += 1;
        return Promise.resolve({ messageId: randomUUID(), accepted: [message.to], rejected: [] });
      },
    });
    const binding = options.bound === false ? null : await setServiceAccount(lifecycle.client.id, {
      accountEmail: lifecycle.accountEmail,
      targets: [lifecycle.target, lifecycle.otherTarget],
    }, lifecycle.actor);
    let credential: MachineHttpFixture['credential'];
    if (binding) {
      const generated = await generateAndStore(lifecycle.client.id, {}, lifecycle.actor.id);
      credential = { id: generated.id, plaintext: generated.plaintext };
    } else {
      const active = (await readLifecycleSecrets(lifecycle.client.id)).find((secret) => secret.status === 'active');
      if (!active) throw new Error('Machine fixture unbound credential is missing');
      credential = { id: active.id, plaintext: lifecycle.oldSecret };
    }

    const { keys } = await ensureSigningKeys();
    const ttl = await loadOidcTtlConfig();
    const provider = await createOidcProvider({ jwks: { keys }, ttl });
    const app = createApp(provider);
    // Only the external human-token lookup is substituted. The application still
    // checks the stored account and memberships; machine lookup never uses this map.
    const authProvider = {
      AccessToken: {
        async find(token: string) {
          const accountId = humanTokens.get(token);
          return accountId ? { accountId } : provider.AccessToken.find(token);
        },
      },
      ClientCredentials: {
        find(token: string) { return provider.ClientCredentials.find(token); },
      },
    };
    setAdminAuthProvider(authProvider);
    server = createServer(app.callback());
    const baseUrl = await listenMachineHttp(server);
    return {
      lifecycle, provider, baseUrl, adminSlug, binding, credential, mail, close,
      humanToken(actor) {
        const token = randomBytes(32).toString('base64url');
        humanTokens.set(token, actor.id);
        return token;
      },
    };
  } catch {
    await close();
    throw new Error('Machine HTTP fixture setup failed');
  }
}

/** Encode a Basic authentication component with OAuth form encoding, not raw URI encoding. */
function encodeBasicComponent(value: string): string {
  return new URLSearchParams({ value }).toString().slice('value='.length);
}

/** Send an actual token POST; retain failed statuses and never invent a usable token. */
export async function issueMachineToken(
  fixture: MachineHttpFixture,
  options: MachineTokenOptions = {},
): Promise<MachineTokenResponse> {
  const clientId = options.clientId ?? fixture.lifecycle.client.clientId;
  const secret = options.secret ?? fixture.credential.plaintext;
  const method = options.method ?? (fixture.lifecycle.client.tokenEndpointAuthMethod === 'client_secret_post'
    ? 'client_secret_post' : 'client_secret_basic');
  const form = new URLSearchParams({ grant_type: 'client_credentials', scope: options.scope ?? 'admin:user:invite' });
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' };
  if (method === 'client_secret_post') {
    form.set('client_id', clientId);
    form.set('client_secret', secret);
  } else {
    const encoded = Buffer.from(`${encodeBasicComponent(clientId)}:${encodeBasicComponent(secret)}`).toString('base64');
    headers.authorization = `Basic ${encoded}`;
  }
  for (const [key, value] of Object.entries(options.fields ?? {})) form.set(key, value);
  const response = await machineRequest(fixture, {
    method: 'POST', path: `/${encodeURIComponent(options.issuerSlug ?? fixture.adminSlug)}/token`,
    rawBody: form.toString(), headers,
  });
  return { status: response.status, body: response.body };
}

/** Send one loopback request without redirect following, retries, or credential-bearing errors. */
export async function machineRequest(
  fixture: MachineHttpFixture,
  options: MachineRequestOptions,
): Promise<MachineHttpResponse> {
  try {
    const url = new URL(`${fixture.baseUrl}${options.path}`);
    if (!options.path.startsWith('/') || url.origin !== new URL(fixture.baseUrl).origin) {
      throw new Error('Machine HTTP requests must stay on the owned listener');
    }
    const headers = new Headers(options.headers);
    if (options.token !== undefined && !headers.has('authorization')) {
      headers.set('authorization', `Bearer ${options.token}`);
    }
    const body = options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
    if (body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await fetch(url, { method: options.method, headers, body, redirect: 'manual' });
    const text = await response.text();
    return { status: response.status, body: parseMachineBody(text), text, headers: response.headers };
  } catch {
    throw new Error('Machine HTTP request failed');
  }
}

/** Read a matching durable invitation without selecting any token material. */
export async function readMachineInvitation(
  organizationId: string,
  email: string,
): Promise<MachineInvitation | null> {
  const result = await getPool().query<{ id: string; details: unknown; invitedBy: string | null }>(
    `SELECT id, details, invited_by AS "invitedBy" FROM invitation_tokens
     WHERE organization_id = $1 AND LOWER(email) = LOWER($2)`, [organizationId, email],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (!isRecord(row.details)) throw new Error('Machine fixture invitation details are not an object');
  return { id: row.id, details: row.details, invitedBy: row.invitedBy };
}

/** Count actual target users separately from invitation persistence. */
export async function readMachineUserCount(organizationId: string, email: string): Promise<number> {
  const result = await getPool().query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM users WHERE organization_id = $1 AND LOWER(email) = LOWER($2)',
    [organizationId, email],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Machine fixture user count is missing');
  return row.count;
}

/** Read a token without substituting a default or including a failed response in an error. */
export function machineTokenValue(response: MachineTokenResponse): string {
  const token = response.body.access_token;
  if (response.status !== 200 || typeof token !== 'string' || token.length === 0) {
    throw new Error('Machine token response has no usable access token');
  }
  return token;
}

/** Send a minimal invitation through the actual Admin POST route, without asserting its outcome. */
export function machineInvitationRequest(
  fixture: MachineHttpFixture,
  token: string,
  email: string,
  organizationId: string = fixture.lifecycle.organization.id,
): Promise<MachineHttpResponse> {
  return machineRequest(fixture, {
    method: 'POST', path: `/api/admin/organizations/${organizationId}/users/invite`,
    token, body: { email },
  });
}
