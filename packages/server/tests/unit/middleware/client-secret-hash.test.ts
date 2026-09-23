import { describe, expect, it, vi } from 'vitest';

import { clientSecretHash } from '../../../src/middleware/client-secret-hash.js';

/** Create the minimal untrusted context used to verify safe provider delegation. */
function context(options: {
  authorization?: string;
  body?: Record<string, unknown>;
}) {
  const headers: Record<string, string | undefined> = {
    authorization: options.authorization,
  };
  return {
    headers,
    req: { headers: { ...headers } },
    request: { body: options.body ?? {} },
    state: {},
  };
}

describe('client-secret bridge provider delegation', () => {
  it('should leave Basic credentials untouched without resolved tenant authority', async () => {
    const authorization = `Basic ${Buffer.from('client:secret').toString('base64')}`;
    const ctx = context({ authorization });
    const next = vi.fn().mockResolvedValue(undefined);

    await clientSecretHash()(ctx as never, next);

    expect(ctx.headers.authorization).toBe(authorization);
    expect(ctx.req.headers.authorization).toBe(authorization);
    expect(next).toHaveBeenCalledOnce();
  });

  it('should leave post credentials untouched without resolved tenant authority', async () => {
    const body = { client_id: 'client', client_secret: 'secret' };
    const ctx = context({ body });
    const next = vi.fn().mockResolvedValue(undefined);

    await clientSecretHash()(ctx as never, next);

    expect(body.client_secret).toBe('secret');
    expect(next).toHaveBeenCalledOnce();
  });

  it('should leave malformed Basic credentials to oidc-provider', async () => {
    const ctx = context({ authorization: 'Basic !!!not-base64!!!' });
    const next = vi.fn().mockResolvedValue(undefined);

    await clientSecretHash()(ctx as never, next);

    expect(ctx.headers.authorization).toBe('Basic !!!not-base64!!!');
    expect(next).toHaveBeenCalledOnce();
  });

  it('should leave simultaneous Basic and post mechanisms untouched', async () => {
    const authorization = `Basic ${Buffer.from('client:basic-secret').toString('base64')}`;
    const body = { client_id: 'client', client_secret: 'post-secret' };
    const ctx = context({ authorization, body });
    const next = vi.fn().mockResolvedValue(undefined);

    await clientSecretHash()(ctx as never, next);

    expect(ctx.headers.authorization).toBe(authorization);
    expect(body.client_secret).toBe('post-secret');
    expect(next).toHaveBeenCalledOnce();
  });
});
