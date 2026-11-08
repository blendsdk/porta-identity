import { describe, expect, it } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import { revokeServiceAccount } from '../../../src/service-accounts/index.js';
import {
  bindClientHttpFixture,
  CLIENT_HTTP_BINDING_STATES,
  createOrdinaryClientHttpFixture,
  expectClientHttpAudit,
  expectClientHttpBinding,
  expectClientHttpForbidden,
  isClientHttpRecord,
  readClientHttpClient,
  readClientHttpObject,
  useClientHttpFixture,
} from './client-http-fixtures.js';
import { lifecycleSecurityFingerprint, readLifecycleAudits } from './lifecycle-fixtures.js';

/** Existing status operations must enforce ownership before even a no-op mutation. */
const STATUS_OPERATIONS = ['deactivate', 'activate'] as const;

describe('existing client HTTP configuration authority', () => {
  const current = useClientHttpFixture();

  it.each(CLIENT_HTTP_BINDING_STATES)(
    'should allow a live human Super Admin to update a client with an %s binding',
    async (state) => {
      const fixture = current();
      const binding = await bindClientHttpFixture(fixture, state);
      const previousAudits = (await readLifecycleAudits()).map((entry) => entry.id);
      const clientName = 'HTTP Super Admin update';
      const response = await fixture.request(
        fixture.actor, 'PUT', `/api/admin/clients/${fixture.client.id}`, { clientName },
      );
      expect(response.status).toBe(200);
      const body = await readClientHttpObject(response);
      expect(Object.keys(body)).toEqual(['data']);
      if (!isClientHttpRecord(body.data)) throw new Error('Client update must return a data object');
      expect(body.data.id).toBe(fixture.client.id);
      expect(body.data.clientName).toBe(clientName);
      expect((await readClientHttpClient(fixture.client.id))?.clientName).toBe(clientName);
      await expectClientHttpBinding(fixture, binding, state);
      await expectClientHttpAudit(fixture, previousAudits);
    },
  );

  it('should deny App Admin updates for active and revoked bindings without changing security state', async () => {
    const fixture = current();
    await bindClientHttpFixture(fixture);
    let firstEnvelope: string | undefined;
    for (const state of CLIENT_HTTP_BINDING_STATES) {
      if (state === 'revoked') await revokeServiceAccount(fixture.client.id, fixture.actor);
      const before = await lifecycleSecurityFingerprint();
      const response = await fixture.request(
        fixture.appAdmin, 'PUT', `/api/admin/clients/${fixture.client.id}`,
        { clientName: 'Denied bound-client update' },
      );
      const envelope = await expectClientHttpForbidden(fixture, response, before);
      if (firstEnvelope) expect(envelope).toBe(firstEnvelope);
      firstEnvelope = envelope;
    }
  });

  it('should preserve ordinary unbound client update rights for App Admin', async () => {
    const fixture = current();
    const client = await createOrdinaryClientHttpFixture(fixture);
    const clientName = 'HTTP ordinary App Admin update';
    const response = await fixture.request(
      fixture.appAdmin, 'PUT', `/api/admin/clients/${client.id}`, { clientName },
    );
    expect(response.status).toBe(200);
    const body = await readClientHttpObject(response);
    expect(Object.keys(body)).toEqual(['data']);
    if (!isClientHttpRecord(body.data)) throw new Error('Client update must return a data object');
    expect(body.data.id).toBe(client.id);
    expect(body.data.clientName).toBe(clientName);
    expect((await readClientHttpClient(client.id))?.clientName).toBe(clientName);
  });

  it('should recheck live Super Admin membership for an already issued human token', async () => {
    const fixture = current();
    await bindClientHttpFixture(fixture);
    const authorized = await fixture.request(
      fixture.actor, 'PUT', `/api/admin/clients/${fixture.client.id}`,
      { clientName: 'Before administrative role removal' },
    );
    expect(authorized.status).toBe(200);
    await readClientHttpObject(authorized);
    await getPool().query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [
      fixture.actor.id, fixture.appAdminRole.id,
    ]);
    await getPool().query('DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2', [
      fixture.actor.id, fixture.superRole.id,
    ]);
    const before = await lifecycleSecurityFingerprint();
    const response = await fixture.request(
      fixture.actor, 'PUT', `/api/admin/clients/${fixture.client.id}`,
      { clientName: 'Denied stale Super Admin authority' },
    );
    await expectClientHttpForbidden(fixture, response, before);
  });
});

describe('existing client HTTP lifecycle authority', () => {
  const current = useClientHttpFixture();

  it.each(CLIENT_HTTP_BINDING_STATES)(
    'should allow a live human Super Admin to deactivate a client with an %s binding',
    async (state) => {
      const fixture = current();
      const binding = await bindClientHttpFixture(fixture, state);
      const previousAudits = (await readLifecycleAudits()).map((entry) => entry.id);
      const response = await fixture.request(
        fixture.actor, 'POST', `/api/admin/clients/${fixture.client.id}/deactivate`,
      );
      expect(response.status).toBe(204);
      expect(await response.text()).toBe('');
      expect((await readClientHttpClient(fixture.client.id))?.status).toBe('inactive');
      await expectClientHttpBinding(fixture, binding, 'revoked');
      await expectClientHttpAudit(fixture, previousAudits);
    },
  );

  it('should activate an inactive bound client without restoring its same revoked owned account', async () => {
    const fixture = current();
    const binding = await bindClientHttpFixture(fixture);
    const preparation = await fixture.request(
      fixture.actor, 'POST', `/api/admin/clients/${fixture.client.id}/deactivate`,
    );
    expect(preparation.status).toBe(204);
    expect((await readClientHttpClient(fixture.client.id))?.status).toBe('inactive');
    await expectClientHttpBinding(fixture, binding, 'revoked');
    const previousAudits = (await readLifecycleAudits()).map((entry) => entry.id);
    const response = await fixture.request(
      fixture.actor, 'POST', `/api/admin/clients/${fixture.client.id}/activate`,
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect((await readClientHttpClient(fixture.client.id))?.status).toBe('active');
    await expectClientHttpBinding(fixture, binding, 'revoked');
    await expectClientHttpAudit(fixture, previousAudits);
  });

  it.each(STATUS_OPERATIONS)(
    'should deny App Admin %s for active and revoked bindings without changing security state',
    async (operation) => {
      const fixture = current();
      await bindClientHttpFixture(fixture);
      let firstEnvelope: string | undefined;
      for (const state of CLIENT_HTTP_BINDING_STATES) {
        if (state === 'revoked') {
          await revokeServiceAccount(fixture.client.id, fixture.actor);
          if (operation === 'activate') {
            await getPool().query(
              "UPDATE clients SET status = 'inactive' WHERE id = $1", [fixture.client.id],
            );
          }
        }
        const before = await lifecycleSecurityFingerprint();
        const response = await fixture.request(
          fixture.appAdmin, 'POST', `/api/admin/clients/${fixture.client.id}/${operation}`,
        );
        const envelope = await expectClientHttpForbidden(fixture, response, before);
        if (firstEnvelope) expect(envelope).toBe(firstEnvelope);
        firstEnvelope = envelope;
      }
    },
  );

  it.each(STATUS_OPERATIONS)(
    'should preserve ordinary unbound client %s rights for App Admin',
    async (operation) => {
      const fixture = current();
      const client = await createOrdinaryClientHttpFixture(fixture);
      if (operation === 'activate') {
        await getPool().query("UPDATE clients SET status = 'inactive' WHERE id = $1", [client.id]);
      }
      const response = await fixture.request(
        fixture.appAdmin, 'POST', `/api/admin/clients/${client.id}/${operation}`,
      );
      expect(response.status).toBe(204);
      expect(await response.text()).toBe('');
      expect((await readClientHttpClient(client.id))?.status).toBe(
        operation === 'activate' ? 'active' : 'inactive',
      );
    },
  );
});
