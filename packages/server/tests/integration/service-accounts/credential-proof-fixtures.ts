/** Real credential handoff fixtures that pause only after the actual bridge has validated a secret. */
import { createServer } from 'node:http';
import Koa from 'koa';
import Router from '@koa/router';
import bodyParser from 'koa-bodyparser';
import { generateSecret, hashSecret, sha256Secret } from '../../../src/clients/crypto.js';
import { insertSecret } from '../../../src/clients/secret-repository.js';
import { generateAndStore } from '../../../src/clients/secret-service.js';
import { config } from '../../../src/config/index.js';
import { clientSecretHash } from '../../../src/middleware/client-secret-hash.js';
import { oidcClientTenantBinding } from '../../../src/middleware/oidc-client-tenant.js';
import { oidcPreflightCors } from '../../../src/middleware/oidc-preflight-cors.js';
import { tenantResolver } from '../../../src/middleware/tenant-resolver.js';
import { introspectionRateLimiter, tokenRateLimiter } from '../../../src/middleware/token-rate-limiter.js';
import { issuerStore } from '../../../src/server.js';
import type { MachineHttpFixture } from './machine-http-fixtures.js';

/** Persisted credential representation used by the real bridge. */
export type CredentialProofKind = 'modern' | 'legacy';

/** Distinct real secrets prevent canonical-digest rewriting from proving the wrong credential. */
export interface CredentialProofSecrets {
  /** Exact credential sent in the paused HTTP request. */
  proven: MachineHttpFixture['credential'];
  /** Separate active SHA-backed row used by the native provider as its canonical credential. */
  canonical: MachineHttpFixture['credential'];
}

/** One actual HTTP bridge/provider listener with a single credential-validation pause. */
export interface CredentialProofBarrier {
  /** Owned IPv4 loopback origin for the selected token request. */
  baseUrl: string;
  /** Resolves only when genuine credential validation has reached the handoff seam. */
  reached: Promise<void>;
  /** Idempotently allow the paused request to enter the native provider. */
  release(): void;
  /** Release the seam and close all connections; callers first settle their pending requests. */
  close(): Promise<void>;
}

/**
 * Construct real modern or Argon-only proof credentials without inspecting provider internals.
 * Canonical identity is observed through the public native Client model. Comparisons remain
 * boolean so neither the plaintext nor a canonical digest can appear in failure output.
 */
export async function prepareCredentialProofSecrets(
  fixture: MachineHttpFixture,
  kind: CredentialProofKind,
): Promise<CredentialProofSecrets> {
  const candidates = [fixture.credential];
  let legacy: MachineHttpFixture['credential'] | undefined;
  if (kind === 'modern') {
    const generated = await generateAndStore(fixture.lifecycle.client.id, {}, fixture.lifecycle.actor.id);
    candidates.push({ id: generated.id, plaintext: generated.plaintext });
  } else {
    const plaintext = generateSecret();
    const inserted = await insertSecret({
      clientId: fixture.lifecycle.client.id, secretHash: await hashSecret(plaintext),
      secretSha256: null, label: 'legacy-proof-fixture', expiresAt: null,
    });
    legacy = { id: inserted.id, plaintext };
  }
  const client = await fixture.provider.Client.find(fixture.lifecycle.client.clientId);
  const canonical = candidates.find((entry) => client?.clientSecret === sha256Secret(entry.plaintext));
  if (!canonical) throw new Error('A real modern canonical bridge credential could not be identified');
  const proven = legacy ?? candidates.find((entry) => entry.id !== canonical.id);
  if (!proven || proven.id === canonical.id) throw new Error('Distinct real proof credentials are required');
  return { proven, canonical };
}

/**
 * Mount the existing resolver, parsers, protections and credential bridge around the same
 * provider as the full application. The native handoff receives the original IncomingMessage,
 * not a fabricated request or an outer Koa state object pretending to be provider context.
 */
export async function createCredentialProofBarrier(fixture: MachineHttpFixture): Promise<CredentialProofBarrier> {
  let markReached: (() => void) | undefined;
  let resume: (() => void) | undefined;
  let armed = true;
  let closed = false;
  const reached = new Promise<void>((resolve) => { markReached = resolve; });
  const paused = new Promise<void>((resolve) => { resume = resolve; });
  const release = (): void => { resume?.(); };
  const app = new Koa();
  const router = new Router({ prefix: '/:orgSlug' });
  router.use(tenantResolver());
  router.use(bodyParser({ enableTypes: ['json', 'form'], jsonLimit: '100kb', formLimit: '100kb' }));
  router.use(async (ctx, next) => {
    Reflect.set(ctx.req, 'body', ctx.request.body);
    await next();
  });
  router.use(tokenRateLimiter(), introspectionRateLimiter(), oidcPreflightCors());
  router.use(oidcClientTenantBinding(fixture.provider));
  router.use(clientSecretHash({
    async afterCredentialValidation() {
      if (!armed) return;
      armed = false;
      markReached?.();
      await paused;
    },
  }));
  router.post('/token', async (ctx) => {
    const original = ctx.req.url ?? ctx.originalUrl;
    Reflect.set(ctx.req, 'originalUrl', original);
    ctx.req.url = original.slice(`/${ctx.params.orgSlug}`.length) || '/';
    Reflect.set(ctx.req, '_portaOrganization', ctx.state.organization);
    ctx.respond = false;
    await Promise.resolve(issuerStore.run(
      `${config.issuerBaseUrl}/${ctx.params.orgSlug}`,
      () => fixture.provider.callback()(ctx.req, ctx.res),
    ));
  });
  app.use(router.routes());
  app.use(router.allowedMethods());
  const server = createServer(app.callback());

  /** Stop accepting connections before closing keep-alive sockets; never leave the proof held. */
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    release();
    if (!server.listening) {
      server.closeAllConnections();
      return;
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(new Error('Credential proof listener could not close'));
        else resolve();
      });
      server.closeAllConnections();
    });
  };
  try {
    const baseUrl = await new Promise<string>((resolve, reject) => {
      const failed = (): void => { reject(new Error('Credential proof listener could not start')); };
      server.once('error', failed);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', failed);
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Credential proof listener has no loopback address'));
          return;
        }
        resolve(`http://127.0.0.1:${address.port}`);
      });
    });
    return { baseUrl, reached, release, close };
  } catch {
    await close();
    throw new Error('Credential proof listener setup failed');
  }
}

/**
 * Bound a held-proof step so an oracle can enter finally and release it on failure.
 * A test-runner timeout alone does not cancel a pending HTTP request or release its barrier.
 * Callers retain and settle the original work promise after releasing the proof.
 */
export async function waitForCredentialProofStep<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => { reject(new Error('Credential proof step did not finish while held')); }, 5_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
