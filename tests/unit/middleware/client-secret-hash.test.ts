import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';

import { clientSecretHash } from '../../../src/middleware/client-secret-hash.js';

/** Compute expected SHA-256 hex hash */
function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Create a mock Koa context */
function createMockContext(overrides: {
  authorization?: string;
  body?: Record<string, unknown>;
} = {}): { ctx: Record<string, unknown>; next: ReturnType<typeof vi.fn> } {
  const reqHeaders: Record<string, string | undefined> = {};
  if (overrides.authorization) {
    reqHeaders.authorization = overrides.authorization;
  }

  const headers: Record<string, string | undefined> = { ...reqHeaders };
  const req = { headers: { ...reqHeaders } };
  const body = overrides.body ?? {};
  const request = { body };

  const ctx = { headers, req, request } as unknown as Record<string, unknown>;
  const next = vi.fn().mockResolvedValue(undefined);

  return { ctx, next };
}

describe('client-secret-hash middleware', () => {
  const middleware = clientSecretHash();

  describe('client_secret_basic (Authorization: Basic header)', () => {
    it('hashes the secret in a Basic auth header', async () => {
      const clientId = 'my-client-id';
      const secret = 'my-super-secret-value';
      const encoded = Buffer.from(`${clientId}:${secret}`).toString('base64');
      const { ctx, next } = createMockContext({ authorization: `Basic ${encoded}` });

      await middleware(ctx as any, next);

      const expectedHash = sha256(secret);
      const expectedEncoded = Buffer.from(`${clientId}:${expectedHash}`).toString('base64');
      expect((ctx as any).headers.authorization).toBe(`Basic ${expectedEncoded}`);
      expect((ctx as any).req.headers.authorization).toBe(`Basic ${expectedEncoded}`);
      expect(next).toHaveBeenCalledOnce();
    });

    it('preserves the client_id in Basic auth', async () => {
      const clientId = 'test-client-abc123';
      const secret = 'some-secret';
      const encoded = Buffer.from(`${clientId}:${secret}`).toString('base64');
      const { ctx, next } = createMockContext({ authorization: `Basic ${encoded}` });

      await middleware(ctx as any, next);

      const decoded = Buffer.from(
        (ctx as any).headers.authorization.slice(6),
        'base64',
      ).toString('utf8');
      const colonIndex = decoded.indexOf(':');
      expect(decoded.slice(0, colonIndex)).toBe(clientId);
    });

    it('does not modify header when secret is empty', async () => {
      const clientId = 'my-client';
      const encoded = Buffer.from(`${clientId}:`).toString('base64');
      const original = `Basic ${encoded}`;
      const { ctx, next } = createMockContext({ authorization: original });

      await middleware(ctx as any, next);

      expect((ctx as any).headers.authorization).toBe(original);
      expect(next).toHaveBeenCalledOnce();
    });

    it('handles URL-encoded characters in client_id', async () => {
      const clientId = 'client%20with%20spaces';
      const secret = 'secret123';
      const encoded = Buffer.from(`${clientId}:${secret}`).toString('base64');
      const { ctx, next } = createMockContext({ authorization: `Basic ${encoded}` });

      await middleware(ctx as any, next);

      const decoded = Buffer.from(
        (ctx as any).headers.authorization.slice(6),
        'base64',
      ).toString('utf8');
      const colonIndex = decoded.indexOf(':');
      expect(decoded.slice(0, colonIndex)).toBe(clientId);
      expect(decoded.slice(colonIndex + 1)).toBe(sha256(secret));
    });

    it('handles secrets containing colons', async () => {
      const clientId = 'my-client';
      const secret = 'secret:with:colons';
      const encoded = Buffer.from(`${clientId}:${secret}`).toString('base64');
      const { ctx, next } = createMockContext({ authorization: `Basic ${encoded}` });

      await middleware(ctx as any, next);

      const decoded = Buffer.from(
        (ctx as any).headers.authorization.slice(6),
        'base64',
      ).toString('utf8');
      const colonIndex = decoded.indexOf(':');
      expect(decoded.slice(0, colonIndex)).toBe(clientId);
      expect(decoded.slice(colonIndex + 1)).toBe(sha256(secret));
    });

    it('handles malformed Basic auth gracefully', async () => {
      const { ctx, next } = createMockContext({ authorization: 'Basic not-valid-base64!!!' });

      // Should not throw — let oidc-provider handle the error
      await middleware(ctx as any, next);
      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('non-Basic auth schemes', () => {
    it('does not modify Bearer auth headers', async () => {
      const original = 'Bearer some-token-value';
      const { ctx, next } = createMockContext({ authorization: original });

      await middleware(ctx as any, next);

      expect((ctx as any).headers.authorization).toBe(original);
      expect(next).toHaveBeenCalledOnce();
    });

    it('passes through requests without Authorization header', async () => {
      const { ctx, next } = createMockContext();

      await middleware(ctx as any, next);

      expect((ctx as any).headers.authorization).toBeUndefined();
      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('client_secret_post (body parameter)', () => {
    it('hashes client_secret in POST body', async () => {
      const secret = 'my-post-secret';
      const body = { client_id: 'my-client', client_secret: secret, grant_type: 'authorization_code' };
      const { ctx, next } = createMockContext({ body });

      await middleware(ctx as any, next);

      expect(body.client_secret).toBe(sha256(secret));
      expect(body.client_id).toBe('my-client'); // unchanged
      expect(next).toHaveBeenCalledOnce();
    });

    it('does not modify body when client_secret is missing', async () => {
      const body = { client_id: 'my-client', grant_type: 'authorization_code' };
      const { ctx, next } = createMockContext({ body });

      await middleware(ctx as any, next);

      expect(body).toEqual({ client_id: 'my-client', grant_type: 'authorization_code' });
      expect(next).toHaveBeenCalledOnce();
    });

    it('does not modify body when client_secret is empty string', async () => {
      const body = { client_id: 'my-client', client_secret: '' };
      const { ctx, next } = createMockContext({ body });

      await middleware(ctx as any, next);

      expect(body.client_secret).toBe('');
      expect(next).toHaveBeenCalledOnce();
    });

    it('does not modify body when client_secret is not a string', async () => {
      const body = { client_id: 'my-client', client_secret: 12345 };
      const { ctx, next } = createMockContext({ body: body as any });

      await middleware(ctx as any, next);

      expect(body.client_secret).toBe(12345); // unchanged
      expect(next).toHaveBeenCalledOnce();
    });
  });

  describe('combined Basic + body', () => {
    it('hashes both Basic auth and body secret when both present', async () => {
      const basicSecret = 'basic-secret';
      const postSecret = 'post-secret';
      const encoded = Buffer.from(`client-id:${basicSecret}`).toString('base64');
      const body = { client_secret: postSecret };
      const { ctx, next } = createMockContext({
        authorization: `Basic ${encoded}`,
        body,
      });

      await middleware(ctx as any, next);

      // Both should be hashed
      const decoded = Buffer.from(
        (ctx as any).headers.authorization.slice(6),
        'base64',
      ).toString('utf8');
      expect(decoded.split(':')[1]).toBe(sha256(basicSecret));
      expect(body.client_secret).toBe(sha256(postSecret));
      expect(next).toHaveBeenCalledOnce();
    });
  });

  it('always calls next()', async () => {
    const { ctx, next } = createMockContext();
    await middleware(ctx as any, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('SHA-256 hash is 64-character hex string', async () => {
    const secret = 'test-secret-for-hash-length';
    const hash = sha256(secret);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
