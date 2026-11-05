import { describe, expect, it } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import { revokeServiceAccount } from '../../../src/service-accounts/index.js';
import { createTestUser } from '../helpers/factories.js';
import {
  bindClientHttpFixture,
  CLIENT_HTTP_BINDING_STATES,
  createOrdinaryClientHttpFixture,
  expectClientHttpAudit,
  expectClientHttpForbidden,
  readClientHttpClient,
  useClientHttpFixture,
} from './client-http-fixtures.js';
import {
  lifecycleSecurityFingerprint,
  readLifecycleAccount,
  readLifecycleAudits,
} from './lifecycle-fixtures.js';

describe('existing client and owned-user HTTP deletion authority', () => {
  const current = useClientHttpFixture();

  it('should deny App Admin deletion of active and revoked bound clients without changing security state', async () => {
    const fixture = current();
    await bindClientHttpFixture(fixture);
    let firstEnvelope: string | undefined;
    for (const state of CLIENT_HTTP_BINDING_STATES) {
      if (state === 'revoked') await revokeServiceAccount(fixture.client.id, fixture.actor);
      const before = await lifecycleSecurityFingerprint();
      const response = await fixture.request(
        fixture.appAdmin, 'DELETE', `/api/admin/clients/${fixture.client.id}`,
      );
      const envelope = await expectClientHttpForbidden(fixture, response, before);
      if (firstEnvelope) expect(envelope).toBe(firstEnvelope);
      firstEnvelope = envelope;
    }
  });

  it('should deny User Admin physical deletion of active and revoked owned accounts without changing security state', async () => {
    const fixture = current();
    const binding = await bindClientHttpFixture(fixture);
    let firstEnvelope: string | undefined;
    for (const state of CLIENT_HTTP_BINDING_STATES) {
      if (state === 'revoked') await revokeServiceAccount(fixture.client.id, fixture.actor);
      const before = await lifecycleSecurityFingerprint();
      const response = await fixture.request(
        fixture.userAdmin, 'DELETE',
        `/api/admin/organizations/${fixture.adminOrganization.id}/users/${binding.serviceAccountId}`,
      );
      const envelope = await expectClientHttpForbidden(fixture, response, before);
      if (firstEnvelope) expect(envelope).toBe(firstEnvelope);
      firstEnvelope = envelope;
    }
  });

  it.each(CLIENT_HTTP_BINDING_STATES)(
    'should let a live human Super Admin delete a client with an %s binding',
    async (state) => {
      const fixture = current();
      const binding = await bindClientHttpFixture(fixture, state);
      const previousAudits = (await readLifecycleAudits()).map((entry) => entry.id);
      const response = await fixture.request(
        fixture.actor, 'DELETE', `/api/admin/clients/${fixture.client.id}`,
      );
      expect(response.status).toBe(204);
      expect(await response.text()).toBe('');
      expect(await readClientHttpClient(fixture.client.id)).toBeNull();
      const survivingAccount = await readLifecycleAccount(binding.serviceAccountId);
      expect(survivingAccount).not.toBeNull();
      if (survivingAccount) {
        expect(survivingAccount.isServiceAccount).toBe(true);
        expect(survivingAccount.status).toBe('inactive');
      }
      await expectClientHttpAudit(fixture, previousAudits);
    },
  );

  it.each(CLIENT_HTTP_BINDING_STATES)(
    'should let a live human Super Admin delete an %s owned account while retaining its revoked marker',
    async (state) => {
      const fixture = current();
      const binding = await bindClientHttpFixture(fixture, state);
      const previousAudits = (await readLifecycleAudits()).map((entry) => entry.id);
      const response = await fixture.request(
        fixture.actor, 'DELETE',
        `/api/admin/organizations/${fixture.adminOrganization.id}/users/${binding.serviceAccountId}`,
      );
      expect(response.status).toBe(204);
      expect(await response.text()).toBe('');
      expect(await readLifecycleAccount(binding.serviceAccountId)).toBeNull();
      const marker = await getPool().query<{ id: string; status: string }>(
        'SELECT id, status FROM client_service_accounts WHERE client_id = $1',
        [fixture.client.id],
      );
      expect(marker.rows).toEqual([{ id: binding.id, status: 'revoked' }]);
      expect(await readClientHttpClient(fixture.client.id)).not.toBeNull();
      await expectClientHttpAudit(fixture, previousAudits);
    },
  );

  it('should preserve ordinary unbound client deletion rights for App Admin', async () => {
    const fixture = current();
    const client = await createOrdinaryClientHttpFixture(fixture);
    const response = await fixture.request(fixture.appAdmin, 'DELETE', `/api/admin/clients/${client.id}`);
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(await readClientHttpClient(client.id)).toBeNull();
  });

  it('should preserve ordinary human-user deletion rights for User Admin in the same organization', async () => {
    const fixture = current();
    const user = await createTestUser(fixture.adminOrganization.id);
    const response = await fixture.request(
      fixture.userAdmin, 'DELETE',
      `/api/admin/organizations/${fixture.adminOrganization.id}/users/${user.id}`,
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(await readLifecycleAccount(user.id)).toBeNull();
  });
});
