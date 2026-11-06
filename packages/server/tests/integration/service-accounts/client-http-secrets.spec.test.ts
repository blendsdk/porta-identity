import { describe, expect, it } from 'vitest';
import { revokeServiceAccount } from '../../../src/service-accounts/index.js';
import {
  bindClientHttpFixture,
  CLIENT_HTTP_BINDING_STATES,
  createOrdinaryClientHttpFixture,
  expectClientHttpAudit,
  expectClientHttpBinding,
  expectClientHttpForbidden,
  expectClientHttpSecretUsable,
  prepareClientHttpSecret,
  readClientHttpSecret,
  useClientHttpFixture,
} from './client-http-fixtures.js';
import {
  lifecycleSecurityFingerprint,
  readLifecycleAudits,
  readLifecycleSecrets,
} from './lifecycle-fixtures.js';

describe('existing client HTTP secret generation authority', () => {
  const current = useClientHttpFixture();

  it.each(CLIENT_HTTP_BINDING_STATES)(
    'should let a live human Super Admin generate a usable secret for an %s binding',
    async (state) => {
      const fixture = current();
      const binding = await bindClientHttpFixture(fixture, state);
      const previousAudits = (await readLifecycleAudits()).map((entry) => entry.id);
      const label = 'HTTP bound-client credential';
      const response = await fixture.request(
        fixture.actor, 'POST', `/api/admin/clients/${fixture.client.id}/secrets`, { label },
      );
      expect(response.status).toBe(201);
      const secret = await readClientHttpSecret(response);
      expect(secret.clientId).toBe(fixture.client.id);
      expect(secret.label).toBe(label);
      await expectClientHttpAudit(fixture, previousAudits);
      await expectClientHttpSecretUsable(fixture.client.id, secret.plaintext);
      const stored = (await readLifecycleSecrets(fixture.client.id)).find((entry) => entry.id === secret.id);
      expect(stored?.status).toBe('active');
      await expectClientHttpBinding(fixture, binding, state);
    },
  );

  it('should deny App Admin secret generation for active and revoked bindings without changing security state', async () => {
    const fixture = current();
    await bindClientHttpFixture(fixture);
    let firstEnvelope: string | undefined;
    for (const state of CLIENT_HTTP_BINDING_STATES) {
      if (state === 'revoked') await revokeServiceAccount(fixture.client.id, fixture.actor);
      const before = await lifecycleSecurityFingerprint();
      const response = await fixture.request(
        fixture.appAdmin, 'POST', `/api/admin/clients/${fixture.client.id}/secrets`, {},
      );
      const envelope = await expectClientHttpForbidden(fixture, response, before);
      if (firstEnvelope) expect(envelope).toBe(firstEnvelope);
      firstEnvelope = envelope;
    }
  });

  it('should preserve usable ordinary unbound client secret generation for App Admin', async () => {
    const fixture = current();
    const client = await createOrdinaryClientHttpFixture(fixture);
    const label = 'HTTP ordinary-client credential';
    const response = await fixture.request(
      fixture.appAdmin, 'POST', `/api/admin/clients/${client.id}/secrets`, { label },
    );
    expect(response.status).toBe(201);
    const secret = await readClientHttpSecret(response);
    expect(secret.clientId).toBe(client.id);
    expect(secret.label).toBe(label);
    await expectClientHttpSecretUsable(client.id, secret.plaintext);
    const stored = (await readLifecycleSecrets(client.id)).find((entry) => entry.id === secret.id);
    expect(stored?.status).toBe('active');
  });
});

describe('existing client HTTP secret revocation authority', () => {
  const current = useClientHttpFixture();

  it.each(CLIENT_HTTP_BINDING_STATES)(
    'should let a live human Super Admin revoke a live secret for an %s binding',
    async (state) => {
      const fixture = current();
      const binding = await bindClientHttpFixture(fixture, state);
      const secretId = await prepareClientHttpSecret(fixture, fixture.client.id);
      const previousAudits = (await readLifecycleAudits()).map((entry) => entry.id);
      const response = await fixture.request(
        fixture.actor, 'POST', `/api/admin/clients/${fixture.client.id}/secrets/${secretId}/revoke`,
      );
      expect(response.status).toBe(204);
      expect(await response.text()).toBe('');
      const stored = (await readLifecycleSecrets(fixture.client.id)).find((entry) => entry.id === secretId);
      expect(stored?.status === 'active').toBe(false);
      await expectClientHttpBinding(fixture, binding, state);
      await expectClientHttpAudit(fixture, previousAudits);
    },
  );

  it('should deny App Admin live-secret revocation for active and revoked bindings without changing security state', async () => {
    const fixture = current();
    await bindClientHttpFixture(fixture);
    let firstEnvelope: string | undefined;
    for (const state of CLIENT_HTTP_BINDING_STATES) {
      if (state === 'revoked') await revokeServiceAccount(fixture.client.id, fixture.actor);
      // First binding retires older credentials, so prepare a live replacement as a human afterwards.
      const secretId = await prepareClientHttpSecret(fixture, fixture.client.id);
      const before = await lifecycleSecurityFingerprint();
      const response = await fixture.request(
        fixture.appAdmin, 'POST', `/api/admin/clients/${fixture.client.id}/secrets/${secretId}/revoke`,
      );
      const envelope = await expectClientHttpForbidden(fixture, response, before);
      if (firstEnvelope) expect(envelope).toBe(firstEnvelope);
      firstEnvelope = envelope;
    }
  });

  it('should preserve ordinary unbound client secret revocation for App Admin', async () => {
    const fixture = current();
    const client = await createOrdinaryClientHttpFixture(fixture);
    const secretId = await prepareClientHttpSecret(fixture, client.id);
    const response = await fixture.request(
      fixture.appAdmin, 'POST', `/api/admin/clients/${client.id}/secrets/${secretId}/revoke`,
    );
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    const stored = (await readLifecycleSecrets(client.id)).find((entry) => entry.id === secretId);
    expect(stored?.status === 'active').toBe(false);
  });
});
