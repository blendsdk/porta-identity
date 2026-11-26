/**
 * Shared HTTP fixture for device-authorization integration specifications.
 *
 * Starts the real Porta Koa application and node-oidc-provider on an isolated
 * IPv4 loopback port for every test, against the real PostgreSQL and Redis test
 * services. The fixture exposes the organization-scoped issuer separately from
 * the loopback origin because the provider derives its issuer from
 * `ISSUER_BASE_URL`, not from the socket address used by the test client.
 *
 * A small cookie jar is included for the browser-facing device pages; the
 * provider and Porta interaction routes rely on signed cookies for session,
 * interaction and resume state.
 */

import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { afterEach, beforeAll, beforeEach } from 'vitest';
import { config } from '../../../src/config/index.js';
import { initI18n } from '../../../src/auth/i18n.js';
import { initTemplateEngine } from '../../../src/auth/template-engine.js';
import { ensureSigningKeys } from '../../../src/lib/signing-keys.js';
import { loadOidcTtlConfig } from '../../../src/lib/system-config.js';
import { createOidcProvider } from '../../../src/oidc/provider.js';
import { createApp } from '../../../src/server.js';
import type { Application } from '../../../src/applications/types.js';
import type { Client } from '../../../src/clients/types.js';
import type { Organization } from '../../../src/organizations/types.js';
import type { User } from '../../../src/users/types.js';
import { DEFAULT_TEST_PASSWORD } from '../../helpers/constants.js';
import { seedBaseData, truncateAllTables } from '../helpers/database.js';
import {
  createTestApplication,
  createTestClient,
  createTestOrganization,
  createTestUserWithPassword,
} from '../helpers/factories.js';
import { flushTestRedis } from '../helpers/redis.js';

/** Grant value exercised by the device-authorization specifications. */
export const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

/** Client overrides accepted by the fixture. */
export interface DeviceClientOptions {
  /** Grant types stored on the client; defaults to the device grant only. */
  readonly grantTypes?: string[];
  /** Registered redirect URIs; defaults to an empty device-only list. */
  readonly redirectUris?: string[];
  /** Registered response types; defaults to an empty device-only list. */
  readonly responseTypes?: string[];
  /** Client authentication model; defaults to a public native client. */
  readonly clientType?: 'public' | 'confidential';
  /** Application type registered for the client. */
  readonly applicationType?: 'web' | 'native' | 'machine';
  /** Whether the existing consent page is required after confirmation. */
  readonly requireConsent?: boolean;
  /** Requested scope string understood by the provider. */
  readonly scope?: string;
  /** Organization default locale; defaults to English. */
  readonly defaultLocale?: string;
}

/** Options for one isolated device-authorization fixture. */
export interface DeviceFixtureOptions extends DeviceClientOptions {
  /** Create a password-capable user in the organization; defaults to true. */
  readonly createUser?: boolean;
}

/** Minimal cookie jar for provider and interaction browser state. */
export class DeviceCookieJar {
  private readonly cookies = new Map<string, string>();

  /** Store every cookie set by one response. */
  absorb(response: Response): void {
    for (const header of response.headers.getSetCookie()) {
      const pair = header.split(';', 1)[0] ?? '';
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      this.cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
    }
  }

  /** Build the request Cookie header, or undefined when no cookie is held. */
  header(): string | undefined {
    if (this.cookies.size === 0) return undefined;
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  /** Read one stored cookie value without exposing it in assertions. */
  get(name: string): string | undefined {
    return this.cookies.get(name);
  }

  /** Replace one cookie value, used to model a mismatched resume cookie. */
  set(name: string, value: string): void {
    this.cookies.set(name, value);
  }
}

/** Real database entities and one loopback instance of the complete application. */
export interface DeviceFixture {
  /** Loopback origin used for HTTP requests. */
  readonly origin: string;
  /** Organization-scoped issuer advertised by the provider. */
  readonly issuer: string;
  /** Owning organization. */
  readonly organization: Organization;
  /** Owning application. */
  readonly application: Application;
  /** Device-enabled client. */
  readonly client: Client;
  /** Password-capable user in the organization, when requested. */
  readonly user: User;
  /** Plaintext password for the fixture user, when requested. */
  readonly password: string;
  /** Cookie-aware browser session for the device pages and interactions. */
  readonly browser: DeviceCookieJar;
  /** Send a protocol request without browser cookies. */
  request(path: string, init?: RequestInit): Promise<Response>;
  /** Send a cookie-aware request; the response cookies are stored automatically. */
  browserRequest(path: string, init?: RequestInit): Promise<Response>;
  /** Create an independent empty browser session for concurrency cases. */
  newBrowser(): DeviceCookieJar;
  /** Send a request with an explicit browser session. */
  browserRequestWith(
    browser: DeviceCookieJar,
    path: string,
    init?: RequestInit,
  ): Promise<Response>;
}

/** Listen only on IPv4 loopback, using an operating-system-assigned free port. */
async function listenOnLoopback(server: Server, port = 0): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    const fail = (error: Error): void => reject(error);
    server.once('error', fail);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', fail);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Device fixture did not acquire a loopback port');
  }
  return `http://127.0.0.1:${address.port}`;
}

/**
 * Reserve one free loopback port before the provider is constructed.
 *
 * The provider captures its issuer at construction time from the configured base URL. Reserving the
 * port first lets the fixture set that base URL to the exact request origin, so issued endpoint
 * URLs, the discovery issuer and the tenant resolver all agree.
 */
async function reserveLoopbackPort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const address = probe.address();
  if (!address || typeof address === 'string') {
    throw new Error('Device fixture could not reserve a loopback port');
  }
  await new Promise<void>((resolve, reject) => {
    probe.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

/** Parse a form or JSON response body without assuming a particular content type. */
export async function readJson(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Expected a JSON object response');
  }
  return body as Record<string, unknown>;
}

/** Build a request URL from a relative path or an absolute redirect target. */
function requestUrl(origin: string, path: string): string {
  return path.startsWith('http://') || path.startsWith('https://') ? path : `${origin}${path}`;
}

/** Read one required string response field. */
export function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Expected response field ${key} to be a non-empty string`);
  }
  return value;
}

/**
 * Register one isolated device fixture for a specification file.
 *
 * @param options - Client and user shape for the fixture
 * @returns A getter for the current test's fixture
 * @example const current = useDeviceFixture();
 */
export function useDeviceFixture(options: DeviceFixtureOptions = {}): () => DeviceFixture {
  let current: DeviceFixture | undefined;
  let server: Server | undefined;
  let previousIssuerBaseUrl: string | undefined;

  beforeAll(async () => {
    await initI18n();
    await initTemplateEngine();
  });

  beforeEach(async () => {
    await truncateAllTables();
    await flushTestRedis();
    await seedBaseData();

    const organization = await createTestOrganization({
      name: 'Device Authorization Org',
      defaultLocale: options.defaultLocale ?? 'en',
    });
    const application = await createTestApplication();
    const client = await createTestClient(organization.id, application.id, {
      clientType: options.clientType ?? 'public',
      applicationType: options.applicationType ?? 'native',
      grantTypes: options.grantTypes ?? [DEVICE_CODE_GRANT],
      redirectUris: options.redirectUris ?? [],
      responseTypes: options.responseTypes ?? [],
      scope: options.scope ?? 'openid profile email offline_access',
      requirePkce: true,
      requireConsent: options.requireConsent ?? false,
      tokenEndpointAuthMethod:
        (options.clientType ?? 'public') === 'public' ? 'none' : 'client_secret_basic',
    });
    const createdUser =
      options.createUser === false
        ? undefined
        : await createTestUserWithPassword(organization.id);

    const port = await reserveLoopbackPort();
    previousIssuerBaseUrl = config.issuerBaseUrl;
    config.issuerBaseUrl = `http://127.0.0.1:${port}`;

    const jwks = await ensureSigningKeys();
    const ttl = await loadOidcTtlConfig();
    const provider = await createOidcProvider({ jwks, ttl });
    const app = createApp(provider);

    const ownedServer = createServer(app.callback());
    server = ownedServer;
    const origin = await listenOnLoopback(ownedServer, port);
    const browser = new DeviceCookieJar();

    current = {
      origin,
      issuer: `${origin}/${organization.slug}`,
      organization,
      application,
      client,
      user: createdUser?.user as User,
      password: createdUser?.password ?? DEFAULT_TEST_PASSWORD,
      browser,
      request: (path, init) => fetch(requestUrl(origin, path), { redirect: 'manual', ...init }),
      browserRequest: async (path, init) => {
        const cookie = browser.header();
        const response = await fetch(requestUrl(origin, path), {
          redirect: 'manual',
          ...init,
          headers: {
            ...(init?.headers ?? {}),
            ...(cookie === undefined ? {} : { Cookie: cookie }),
          },
        });
        browser.absorb(response);
        return response;
      },
      newBrowser: () => new DeviceCookieJar(),
      browserRequestWith: async (jar, path, init) => {
        const cookie = jar.header();
        const response = await fetch(requestUrl(origin, path), {
          redirect: 'manual',
          ...init,
          headers: {
            ...(init?.headers ?? {}),
            ...(cookie === undefined ? {} : { Cookie: cookie }),
          },
        });
        jar.absorb(response);
        return response;
      },
    };
  });

  afterEach(async () => {
    current = undefined;
    const ownedServer = server;
    server = undefined;
    try {
      if (!ownedServer) return;
      ownedServer.closeAllConnections();
      if (ownedServer.listening) {
        await new Promise<void>((resolve, reject) => {
          ownedServer.close((error) => (error ? reject(error) : resolve()));
        });
      }
    } finally {
      if (previousIssuerBaseUrl !== undefined) {
        config.issuerBaseUrl = previousIssuerBaseUrl;
        previousIssuerBaseUrl = undefined;
      }
    }
  });

  return () => {
    if (!current) throw new Error('Device fixture is not initialized');
    return current;
  };
}

/** Build one form-encoded protocol request. */
export function postForm(fields: Record<string, string>): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  };
}

/** Extract the provider XSRF value from a device form. */
export function extractXsrf(html: string): string {
  const match = /name="xsrf"\s+value="([^"]+)"/.exec(html);
  if (!match?.[1]) throw new Error('Device page did not contain an XSRF value');
  return match[1];
}

/** Extract the provider XSRF value from a Porta interaction page. */
export function extractInteractionCsrf(html: string): string {
  const match = /name="_csrf"\s+value="([^"]+)"/.exec(html)
    ?? /name="csrf"\s+value="([^"]+)"/.exec(html);
  if (!match?.[1]) throw new Error('Interaction page did not contain a CSRF value');
  return match[1];
}
