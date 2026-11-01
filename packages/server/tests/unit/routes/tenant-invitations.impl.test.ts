/** Real application wiring must keep tenant cancellation independent of Admin API authority. */
import { randomUUID } from 'node:crypto';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { describe, expect, it } from 'vitest';
import Koa from 'koa';
import { createApp } from '../../../src/server.js';
import { createTenantInvitationsRouter } from '../../../src/routes/tenant-invitations.js';

/** Use Koa's ordinary HTTP initialization for an unmatched in-memory request. */
function context(path: string) {
  const incoming = new IncomingMessage(new Socket());
  incoming.method = 'DELETE';
  incoming.url = path;
  const response = new ServerResponse(incoming);
  response.statusCode = 404;
  return new Koa().createContext(incoming, response);
}

describe('tenant invitation route implementation', () => {
  it('fails closed before any database access when its provider was not initialized', async () => {
    const ctx = context(`/api/organizations/${randomUUID()}/invitations/${randomUUID()}`);
    await createTenantInvitationsRouter().routes()(ctx, async () => undefined);
    expect(ctx.status).toBe(500);
    expect(ctx.body).toEqual({ error: 'Server configuration error' });
  });

  it('does not create a control-plane cancellation route', async () => {
    const ctx = context(`/api/admin/organizations/${randomUUID()}/invitations/${randomUUID()}`);
    await createTenantInvitationsRouter().routes()(ctx, async () => undefined);
    expect(ctx.status).toBe(404);
    expect(ctx.body).toBeUndefined();
  });

  it('mounts the tenant route in the actual application with fail-closed provider handling', async () => {
    const server = createApp().listen(0, '127.0.0.1');
    try {
      await new Promise<void>((resolve) => server.once('listening', resolve));
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Expected an ephemeral test listener');
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/organizations/${randomUUID()}/invitations/${randomUUID()}`,
        { method: 'DELETE' },
      );
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: 'Server configuration error' });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
