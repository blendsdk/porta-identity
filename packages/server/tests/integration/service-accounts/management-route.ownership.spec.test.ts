import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { activateClient, deactivateClient } from '../../../src/clients/index.js';
import { runDatabaseTransaction } from '../../../src/lib/database.js';
import { findServiceAccountByClientId, setServiceAccount } from '../../../src/service-accounts/index.js';
import { deleteUser } from '../../../src/users/service.js';
import { createTestClient, createTestUser } from '../helpers/factories.js';
import {
  lifecycleSecurityFingerprint, readLifecycleAccount, readLifecycleSecrets, withRejectedLifecycleAudit,
} from './lifecycle-fixtures.js';
import { createMachineHttpFixture, machineRequest, readMachineUserCount } from './machine-http-fixtures.js';
import type { MachineHttpFixture } from './machine-http-fixtures.js';
import {
  MANAGEMENT_METHODS, expectLostOwnerMarker, expectManagementBinding, expectManagementError,
  managementPath, requireManagementBinding, requireManagementFixture,
} from './management-route-fixtures.js';

// Ownership is immutable: missing bindings, ineligible clients and lost owners are distinct states.
describe.sequential('service-account management HTTP ownership', () => {
  let fixture: MachineHttpFixture | undefined;
  afterEach(async () => {
    const current = fixture;
    fixture = undefined;
    await current?.close();
  });

  describe('no existing binding', () => {
    beforeEach(async () => { fixture = await createMachineHttpFixture({ bound: false }); });

    it('should return 404 on GET when an existing client has no binding', async () => {
      const f = requireManagementFixture(fixture);
      const before = await lifecycleSecurityFingerprint();
      const response = await machineRequest(f, {
        method: 'GET', path: managementPath(f.lifecycle.client.id), token: f.humanToken(f.lifecycle.actor),
      });
      expectManagementError(f, response, 404, [f.lifecycle.client.id]);
      expect(await lifecycleSecurityFingerprint()).toBe(before);
    });

    it('should return an empty 204 for unbound eligible DELETE without creating an owner', async () => {
      const f = requireManagementFixture(fixture);
      const secrets = await readLifecycleSecrets(f.lifecycle.client.id);
      const response = await machineRequest(f, {
        method: 'DELETE', path: managementPath(f.lifecycle.client.id), token: f.humanToken(f.lifecycle.actor),
      });
      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      expect(await findServiceAccountByClientId(f.lifecycle.client.id)).toBeNull();
      expect(await readMachineUserCount(f.lifecycle.adminOrganization.id, f.lifecycle.accountEmail)).toBe(0);
      expect(await readLifecycleSecrets(f.lifecycle.client.id)).toEqual(secrets);
    });

    it.each(MANAGEMENT_METHODS)('should return safe 404 for %s of a nonexistent internal client UUID', async (method) => {
      const f = requireManagementFixture(fixture);
      const missing = randomUUID();
      const before = await lifecycleSecurityFingerprint();
      const response = await machineRequest(f, {
        method, path: managementPath(missing), token: f.humanToken(f.lifecycle.actor),
        body: method === 'PUT' ? { accountEmail: f.lifecycle.accountEmail, targets: [f.lifecycle.target] } : undefined,
      });
      expectManagementError(f, response, 404, [missing, f.lifecycle.accountEmail]);
      expect(await lifecycleSecurityFingerprint()).toBe(before);
    });

    it.each(MANAGEMENT_METHODS)('should return safe 400 for a malformed client UUID on %s', async (method) => {
      const f = requireManagementFixture(fixture);
      const invalid = 'rejected-non-uuid-client';
      const before = await lifecycleSecurityFingerprint();
      const response = await machineRequest(f, {
        method, path: managementPath(invalid), token: f.humanToken(f.lifecycle.actor),
        body: method === 'PUT' ? { accountEmail: f.lifecycle.accountEmail, targets: [f.lifecycle.target] } : undefined,
      });
      expectManagementError(f, response, 400, [invalid, f.lifecycle.accountEmail]);
      expect(await lifecycleSecurityFingerprint()).toBe(before);
    });

    describe.each(['inactive', 'tenant-owned', 'other application', 'public', 'missing grant', 'no secret authentication'] as const)(
      '%s client', (kind) => {
        it.each(['PUT', 'DELETE'] as const)('should return 400 on unbound %s without promotion', async (method) => {
          const f = requireManagementFixture(fixture);
          let client = f.lifecycle.client;
          if (kind === 'inactive') {
            await runDatabaseTransaction(() => deactivateClient(client.id, f.lifecycle.actor.id));
          } else {
            client = await createTestClient(
              kind === 'tenant-owned' ? f.lifecycle.organization.id : f.lifecycle.adminOrganization.id,
              kind === 'other application' ? f.lifecycle.application.id : f.lifecycle.adminApplication.id,
              {
                grantTypes: kind === 'missing grant' ? ['authorization_code'] : ['client_credentials'],
                clientType: kind === 'public' ? 'public' : 'confidential',
                tokenEndpointAuthMethod: kind === 'public' || kind === 'no secret authentication'
                  ? 'none' : 'client_secret_basic',
                scope: 'admin:user:invite',
              },
            );
          }
          const before = await lifecycleSecurityFingerprint();
          const response = await machineRequest(f, {
            method, path: managementPath(client.id), token: f.humanToken(f.lifecycle.actor),
            body: method === 'PUT' ? { accountEmail: f.lifecycle.accountEmail, targets: [f.lifecycle.target] } : undefined,
          });
          expectManagementError(f, response, 400, [client.id, f.lifecycle.accountEmail]);
          expect(await lifecycleSecurityFingerprint()).toBe(before);
          expect(await findServiceAccountByClientId(client.id)).toBeNull();
        });
      },
    );

    it.each(['human account', 'another client owner'] as const)(
      'should return 409 rather than adopting an existing %s', async (ownerKind) => {
        const f = requireManagementFixture(fixture);
        let existingId: string;
        if (ownerKind === 'human account') {
          existingId = (await createTestUser(f.lifecycle.adminOrganization.id, { email: f.lifecycle.accountEmail })).id;
        } else {
          const other = await createTestClient(f.lifecycle.adminOrganization.id, f.lifecycle.adminApplication.id, {
            grantTypes: ['client_credentials'], scope: 'admin:user:invite',
          });
          existingId = (await setServiceAccount(other.id, {
            accountEmail: f.lifecycle.accountEmail, targets: [f.lifecycle.target],
          }, f.lifecycle.actor)).serviceAccountId;
        }
        const before = await lifecycleSecurityFingerprint();
        const response = await machineRequest(f, {
          method: 'PUT', path: managementPath(f.lifecycle.client.id), token: f.humanToken(f.lifecycle.actor),
          body: { accountEmail: ` ${f.lifecycle.accountEmail.toUpperCase()} `, targets: [f.lifecycle.target] },
        });
        expectManagementError(f, response, 409, [f.lifecycle.accountEmail, existingId, f.lifecycle.client.id]);
        expect(await lifecycleSecurityFingerprint()).toBe(before);
        expect(await findServiceAccountByClientId(f.lifecycle.client.id)).toBeNull();
        expect(await readMachineUserCount(f.lifecycle.adminOrganization.id, f.lifecycle.accountEmail)).toBe(1);
      },
    );

    it('should roll back provisioning and secret retirement when its durable audit fails', async () => {
      const f = requireManagementFixture(fixture);
      const before = await lifecycleSecurityFingerprint();
      await withRejectedLifecycleAudit(async () => {
        const response = await machineRequest(f, {
          method: 'PUT', path: managementPath(f.lifecycle.client.id), token: f.humanToken(f.lifecycle.actor),
          body: { accountEmail: f.lifecycle.accountEmail, targets: [f.lifecycle.target] },
        });
        expectManagementError(f, response, 503, [f.lifecycle.accountEmail, f.lifecycle.client.id, f.credential.plaintext]);
      });
      expect(await lifecycleSecurityFingerprint()).toBe(before);
      expect(await findServiceAccountByClientId(f.lifecycle.client.id)).toBeNull();
      expect(f.mail.attempts).toBe(0);
    });
  });

  describe('existing owner', () => {
    beforeEach(async () => { fixture = await createMachineHttpFixture(); });

    it.each(['active', 'revoked'] as const)('should reject a different email on an %s binding with 400 and no reassignment', async (status) => {
      const f = requireManagementFixture(fixture);
      if (status === 'revoked') {
        expect((await machineRequest(f, {
          method: 'DELETE', path: managementPath(f.lifecycle.client.id), token: f.humanToken(f.lifecycle.actor),
        })).status).toBe(204);
      }
      const before = await lifecycleSecurityFingerprint();
      let fixedBody: string | undefined;
      for (const email of ['replacement-one@test.example.com', 'replacement-two@test.example.com']) {
        const response = await machineRequest(f, {
          method: 'PUT', path: managementPath(f.lifecycle.client.id), token: f.humanToken(f.lifecycle.actor),
          body: { accountEmail: email, targets: [f.lifecycle.otherTarget] },
        });
        expectManagementError(f, response, 400, [email, f.lifecycle.accountEmail, f.lifecycle.client.id]);
        if (fixedBody !== undefined) expect(response.text === fixedBody).toBe(true);
        fixedBody = response.text;
        expect(await lifecycleSecurityFingerprint()).toBe(before);
      }
    });

    it('should permit idempotent DELETE of an existing revoked binding after client eligibility loss', async () => {
      const f = requireManagementFixture(fixture);
      await runDatabaseTransaction(() => deactivateClient(f.lifecycle.client.id, f.lifecycle.actor.id));
      const before = await findServiceAccountByClientId(f.lifecycle.client.id);
      expect(before?.status).toBe('revoked');
      const account = await readLifecycleAccount(requireManagementBinding(f).serviceAccountId);
      const response = await machineRequest(f, {
        method: 'DELETE', path: managementPath(f.lifecycle.client.id), token: f.humanToken(f.lifecycle.actor),
      });
      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      expect(await findServiceAccountByClientId(f.lifecycle.client.id)).toEqual(before);
      expect(await readLifecycleAccount(requireManagementBinding(f).serviceAccountId)).toEqual(account);
    });

    it('should keep the owned account revoked when ordinary client activation repairs eligibility', async () => {
      const f = requireManagementFixture(fixture);
      const original = requireManagementBinding(f);
      await runDatabaseTransaction(() => deactivateClient(f.lifecycle.client.id, f.lifecycle.actor.id));
      await runDatabaseTransaction(() => activateClient(f.lifecycle.client.id, f.lifecycle.actor.id));
      const stored = await findServiceAccountByClientId(f.lifecycle.client.id);
      if (!stored) throw new Error('Client repair must retain its owned binding');
      expect(stored.status).toBe('revoked');
      expect(stored.accountId).toBe(original.serviceAccountId);
      const account = await readLifecycleAccount(original.serviceAccountId);
      expect(account?.status).toBe('inactive');
      expect(account?.isServiceAccount).toBe(true);
      const response = await machineRequest(f, {
        method: 'GET', path: managementPath(f.lifecycle.client.id), token: f.humanToken(f.lifecycle.actor),
      });
      expect(response.status).toBe(200);
      expectManagementBinding(response.body, { ...original, status: 'revoked', targets: stored.targets });
    });
  });

  describe('physically lost owner', () => {
    beforeEach(async () => {
      fixture = await createMachineHttpFixture();
      const f = requireManagementFixture(fixture);
      const binding = requireManagementBinding(f);
      await deleteUser(f.lifecycle.adminOrganization.id, binding.serviceAccountId, {
        kind: 'user', userId: f.lifecycle.actor.id,
      });
      await expectLostOwnerMarker(f, binding.id, binding.serviceAccountId);
    });

    it('should return 409 on GET rather than hiding or reconstructing a lost owner', async () => {
      const f = requireManagementFixture(fixture);
      const before = await lifecycleSecurityFingerprint();
      const response = await machineRequest(f, {
        method: 'GET', path: managementPath(f.lifecycle.client.id), token: f.humanToken(f.lifecycle.actor),
      });
      expectManagementError(f, response, 409, [f.lifecycle.accountEmail, requireManagementBinding(f).serviceAccountId]);
      expect(await lifecycleSecurityFingerprint()).toBe(before);
    });

    it.each(['omitted', 'same', 'different'] as const)('should preserve lost-owner 409 when PUT email is %s', async (emailKind) => {
      const f = requireManagementFixture(fixture);
      const email = emailKind === 'same' ? f.lifecycle.accountEmail : 'replacement-owner@test.example.com';
      const before = await lifecycleSecurityFingerprint();
      const response = await machineRequest(f, {
        method: 'PUT', path: managementPath(f.lifecycle.client.id), token: f.humanToken(f.lifecycle.actor),
        body: { targets: [f.lifecycle.target], ...(emailKind === 'omitted' ? {} : { accountEmail: email }) },
      });
      expectManagementError(f, response, 409, [email, f.lifecycle.accountEmail, f.lifecycle.client.id]);
      expect(await lifecycleSecurityFingerprint()).toBe(before);
      const binding = requireManagementBinding(f);
      await expectLostOwnerMarker(f, binding.id, binding.serviceAccountId);
    });

    it('should return empty 204 without erasing the non-restorable marker on repeated DELETE', async () => {
      const f = requireManagementFixture(fixture);
      const binding = requireManagementBinding(f);
      const marker = await expectLostOwnerMarker(f, binding.id, binding.serviceAccountId);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await machineRequest(f, {
          method: 'DELETE', path: managementPath(f.lifecycle.client.id), token: f.humanToken(f.lifecycle.actor),
        });
        expect(response.status).toBe(204);
        expect(response.text).toBe('');
        expect(await expectLostOwnerMarker(f, binding.id, binding.serviceAccountId)).toEqual(marker);
      }
      expect(await readMachineUserCount(f.lifecycle.adminOrganization.id, f.lifecycle.accountEmail)).toBe(0);
      const stillLost = await machineRequest(f, {
        method: 'GET', path: managementPath(f.lifecycle.client.id), token: f.humanToken(f.lifecycle.actor),
      });
      expectManagementError(f, stillLost, 409, [f.lifecycle.accountEmail, binding.serviceAccountId]);
    });
  });
});
