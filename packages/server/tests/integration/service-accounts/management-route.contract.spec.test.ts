import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { verify } from '../../../src/clients/secret-service.js';
import { findServiceAccountByClientId } from '../../../src/service-accounts/index.js';
import { createTestClient } from '../helpers/factories.js';
import {
  lifecycleSecurityFingerprint, readLifecycleAccount, readLifecycleAudits, readLifecycleSecrets,
} from './lifecycle-fixtures.js';
import { createMachineHttpFixture, machineRequest } from './machine-http-fixtures.js';
import type { MachineHttpFixture } from './machine-http-fixtures.js';
import {
  expectHumanManagementAudit, expectManagementBinding, expectManagementError, managementPath, managementUnknownInputValues,
  requireManagementBinding, requireManagementFixture,
} from './management-route-fixtures.js';

// Human binding management creates dedicated identities and exposes only the approved wire fields.
describe.sequential('service-account management wire contract', () => {
  let fixture: MachineHttpFixture | undefined;
  afterEach(async () => {
    const current = fixture;
    fixture = undefined;
    await current?.close();
  });

  describe('initial provisioning', () => {
    beforeEach(async () => { fixture = await createMachineHttpFixture({ bound: false }); });

    it('should return 201 and a new normalized permanent account when first provisioned', async () => {
      const f = requireManagementFixture(fixture);
      const auditIds = (await readLifecycleAudits()).map((audit) => audit.id);
      const secrets = await readLifecycleSecrets(f.lifecycle.client.id);
      expect(secrets.length).toBeGreaterThan(0);
      const response = await machineRequest(f, {
        method: 'PUT', path: managementPath(f.lifecycle.client.id), token: f.humanToken(f.lifecycle.actor),
        body: { accountEmail: `  ${f.lifecycle.accountEmail.toUpperCase()}  `, targets: [f.lifecycle.target] },
      });
      expect(response.status).toBe(201);
      const binding = expectManagementBinding(response.body, {
        clientId: f.lifecycle.client.id, accountEmail: f.lifecycle.accountEmail,
        status: 'active', targets: [f.lifecycle.target],
      });
      const account = await readLifecycleAccount(binding.serviceAccountId);
      expect(account?.organizationId).toBe(f.lifecycle.adminOrganization.id);
      expect(account?.email).toBe(f.lifecycle.accountEmail);
      expect(account?.status).toBe('active');
      expect(account?.isServiceAccount).toBe(true);
      expect(account?.passwordAbsent).toBe(true);
      expect(account?.roles).toEqual([{
        id: f.lifecycle.serviceRole.id, applicationId: f.lifecycle.adminApplication.id,
        slug: 'porta-invite-service', permissions: ['admin:user:invite'],
      }]);
      const stored = await findServiceAccountByClientId(f.lifecycle.client.id);
      expect(stored?.id).toBe(binding.id);
      expect(stored?.accountId).toBe(binding.serviceAccountId);
      expect(binding.createdAt).toBe(stored?.createdAt.toISOString());
      expect(binding.updatedAt).toBe(stored?.updatedAt.toISOString());
      const retired = await readLifecycleSecrets(f.lifecycle.client.id);
      const originalSecretIds = new Set(secrets.map((secret) => secret.id));
      expect(retired.every((secret) => originalSecretIds.has(secret.id))).toBe(true);
      expect(retired.every((secret) => secret.status === 'revoked')).toBe(true);
      expect(f.mail.attempts).toBe(0);
      await expectHumanManagementAudit(f, auditIds, [
        f.lifecycle.client.id, binding.id, binding.serviceAccountId, f.lifecycle.organization.id,
      ]);
      expect(await verify(f.lifecycle.client.id, f.credential.plaintext)).toBe(false);
    });

    it('should reject a missing initial email without changing security state', async () => {
      const f = requireManagementFixture(fixture);
      const before = await lifecycleSecurityFingerprint();
      const response = await machineRequest(f, {
        method: 'PUT', path: managementPath(f.lifecycle.client.id), token: f.humanToken(f.lifecycle.actor),
        body: { targets: [f.lifecycle.target] },
      });
      expectManagementError(f, response, 400, [f.lifecycle.client.id]);
      expect(await lifecycleSecurityFingerprint()).toBe(before);
    });

    it.each([
      'userId', 'permissions', 'authorizationVersion', 'authorization_version', 'isServiceAccount',
      'is_service_account', 'status', 'serviceAccountId', 'password', 'clientSecret', 'unrecognized',
    ])('should reject unknown %s input with a fixed safe body and no mutation', async (field) => {
      const f = requireManagementFixture(fixture);
      const before = await lifecycleSecurityFingerprint();
      let fixedBody: string | undefined;
      for (const value of managementUnknownInputValues(field, f)) {
        const rejected = typeof value === 'string' ? [value]
          : Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
        const response = await machineRequest(f, {
          method: 'PUT', path: managementPath(f.lifecycle.client.id), token: f.humanToken(f.lifecycle.actor),
          body: { accountEmail: f.lifecycle.accountEmail, targets: [f.lifecycle.target], [field]: value },
        });
        expectManagementError(f, response, 400, [...rejected, f.lifecycle.accountEmail, f.lifecycle.client.id]);
        if (fixedBody !== undefined) expect(response.text === fixedBody).toBe(true);
        fixedBody = response.text;
        expect(await lifecycleSecurityFingerprint()).toBe(before);
      }
    });

    it.each(['target', 'role', 'claim'] as const)(
      'should reject unknown fields in a policy %s before any mutation', async (location) => {
        const f = requireManagementFixture(fixture);
        const before = await lifecycleSecurityFingerprint();
        const extra = { rejected: 'nested-management-value' };
        const target = {
          ...f.lifecycle.target, ...(location === 'target' ? extra : {}),
          allowedRoles: f.lifecycle.target.allowedRoles.map((pair) => ({
            ...pair, ...(location === 'role' ? extra : {}),
          })),
          allowedClaimDefinitions: f.lifecycle.target.allowedClaimDefinitions.map((pair) => ({
            ...pair, ...(location === 'claim' ? extra : {}),
          })),
        };
        const response = await machineRequest(f, {
          method: 'PUT', path: managementPath(f.lifecycle.client.id), token: f.humanToken(f.lifecycle.actor),
          body: { accountEmail: f.lifecycle.accountEmail, targets: [target] },
        });
        expectManagementError(f, response, 400, [extra.rejected, f.lifecycle.accountEmail]);
        expect(await lifecycleSecurityFingerprint()).toBe(before);
      },
    );

    it('should preserve 413 when the JSON body exceeds 100 KiB', async () => {
      const f = requireManagementFixture(fixture);
      const before = await lifecycleSecurityFingerprint();
      const response = await machineRequest(f, {
        method: 'PUT', path: managementPath(f.lifecycle.client.id), token: f.humanToken(f.lifecycle.actor),
        headers: { 'Content-Type': 'application/json' },
        rawBody: JSON.stringify({ accountEmail: f.lifecycle.accountEmail, padding: 'x'.repeat(100 * 1024) }),
      });
      expectManagementError(f, response, 413, [f.lifecycle.accountEmail, f.lifecycle.client.id]);
      expect(await lifecycleSecurityFingerprint()).toBe(before);
    });

    it('should address the internal UUID rather than a distinct UUID-shaped public OAuth ID', async () => {
      const f = requireManagementFixture(fixture);
      const client = await createTestClient(f.lifecycle.adminOrganization.id, f.lifecycle.adminApplication.id, {
        clientId: randomUUID(), grantTypes: ['client_credentials'], scope: 'admin:user:invite',
      });
      expect(client.clientId).not.toBe(client.id);
      const before = await lifecycleSecurityFingerprint();
      const input = { accountEmail: f.lifecycle.accountEmail, targets: [f.lifecycle.target] };
      const wrong = await machineRequest(f, {
        method: 'PUT', path: managementPath(client.clientId), token: f.humanToken(f.lifecycle.actor), body: input,
      });
      expectManagementError(f, wrong, 404, [client.clientId, input.accountEmail]);
      expect(await lifecycleSecurityFingerprint()).toBe(before);
      const correct = await machineRequest(f, {
        method: 'PUT', path: managementPath(client.id), token: f.humanToken(f.lifecycle.actor), body: input,
      });
      expect(correct.status).toBe(201);
      expectManagementBinding(correct.body, { ...input, clientId: client.id, status: 'active' });
    });
  });

  describe('existing owned binding', () => {
    beforeEach(async () => { fixture = await createMachineHttpFixture(); });

    it('should return the exact persisted binding and ISO dates on GET', async () => {
      const f = requireManagementFixture(fixture);
      const original = requireManagementBinding(f);
      const response = await machineRequest(f, {
        method: 'GET', path: managementPath(f.lifecycle.client.id), token: f.humanToken(f.lifecycle.actor),
      });
      expect(response.status).toBe(200);
      const binding = expectManagementBinding(response.body, original);
      expect(binding.id).toBe(original.id);
      expect(binding.serviceAccountId).toBe(original.serviceAccountId);
      expect(binding.createdAt).toBe(original.createdAt.toISOString());
      expect(binding.updatedAt).toBe(original.updatedAt.toISOString());
    });

    it('should fully replace policy with 200 while preserving owner and current credentials', async () => {
      const f = requireManagementFixture(fixture);
      const original = requireManagementBinding(f);
      const stored = await findServiceAccountByClientId(f.lifecycle.client.id);
      const secrets = await readLifecycleSecrets(f.lifecycle.client.id);
      const auditIds = (await readLifecycleAudits()).map((audit) => audit.id);
      const response = await machineRequest(f, {
        method: 'PUT', path: managementPath(f.lifecycle.client.id), token: f.humanToken(f.lifecycle.actor),
        body: { targets: [f.lifecycle.otherTarget] },
      });
      expect(response.status).toBe(200);
      const binding = expectManagementBinding(response.body, { ...original, targets: [f.lifecycle.otherTarget] });
      expect(binding.id).toBe(original.id);
      expect(binding.serviceAccountId).toBe(original.serviceAccountId);
      expect(binding.createdAt).toBe(original.createdAt.toISOString());
      const after = await findServiceAccountByClientId(f.lifecycle.client.id);
      expect(after?.targets).toEqual([f.lifecycle.otherTarget]);
      expect(after?.authorizationVersion).not.toBe(stored?.authorizationVersion);
      expect(await readLifecycleSecrets(f.lifecycle.client.id)).toEqual(secrets);
      expect(f.mail.attempts).toBe(0);
      await expectHumanManagementAudit(f, auditIds, [original.id, original.serviceAccountId, f.lifecycle.client.id]);
      expect(await verify(f.lifecycle.client.id, f.credential.plaintext)).toBe(true);
    });

    it('should accept the same normalized email without selecting another account', async () => {
      const f = requireManagementFixture(fixture);
      const original = requireManagementBinding(f);
      const response = await machineRequest(f, {
        method: 'PUT', path: managementPath(f.lifecycle.client.id), token: f.humanToken(f.lifecycle.actor),
        body: { accountEmail: ` ${original.accountEmail.toUpperCase()} `, targets: original.targets },
      });
      expect(response.status).toBe(200);
      expect(expectManagementBinding(response.body, original).serviceAccountId).toBe(original.serviceAccountId);
    });

    it('should mint a fresh internal version even for an identical active policy replacement', async () => {
      const f = requireManagementFixture(fixture);
      const before = await findServiceAccountByClientId(f.lifecycle.client.id);
      expect(before?.id).toBe(requireManagementBinding(f).id);
      const response = await machineRequest(f, {
        method: 'PUT', path: managementPath(f.lifecycle.client.id), token: f.humanToken(f.lifecycle.actor),
        body: { targets: requireManagementBinding(f).targets },
      });
      expect(response.status).toBe(200);
      expectManagementBinding(response.body, requireManagementBinding(f));
      const after = await findServiceAccountByClientId(f.lifecycle.client.id);
      expect(after?.id).toBe(requireManagementBinding(f).id);
      expect(after?.authorizationVersion).not.toBe(before?.authorizationVersion);
    });

    it('should revoke with an empty 204 and expose the same owned revoked binding on GET', async () => {
      const f = requireManagementFixture(fixture);
      const original = requireManagementBinding(f);
      const before = await findServiceAccountByClientId(f.lifecycle.client.id);
      const response = await machineRequest(f, {
        method: 'DELETE', path: managementPath(f.lifecycle.client.id), token: f.humanToken(f.lifecycle.actor),
      });
      expect(response.status).toBe(204);
      expect(response.text).toBe('');
      const stored = await findServiceAccountByClientId(f.lifecycle.client.id);
      if (!stored) throw new Error('Revocation must retain the binding');
      expect(stored.status).toBe('revoked');
      expect(stored.authorizationVersion).not.toBe(before?.authorizationVersion);
      const account = await readLifecycleAccount(original.serviceAccountId);
      expect(account?.status).toBe('inactive');
      expect(account?.isServiceAccount).toBe(true);
      const get = await machineRequest(f, {
        method: 'GET', path: managementPath(f.lifecycle.client.id), token: f.humanToken(f.lifecycle.actor),
      });
      expect(get.status).toBe(200);
      expect(expectManagementBinding(get.body, { ...original, status: 'revoked', targets: stored.targets }).id)
        .toBe(original.id);
    });

    it('should keep repeated successful revocation a lifecycle no-op', async () => {
      const f = requireManagementFixture(fixture);
      const request = { method: 'DELETE', path: managementPath(f.lifecycle.client.id), token: f.humanToken(f.lifecycle.actor) };
      expect((await machineRequest(f, request)).status).toBe(204);
      const before = await findServiceAccountByClientId(f.lifecycle.client.id);
      const account = await readLifecycleAccount(requireManagementBinding(f).serviceAccountId);
      const secrets = await readLifecycleSecrets(f.lifecycle.client.id);
      const repeated = await machineRequest(f, request);
      expect(repeated.status).toBe(204);
      expect(repeated.text).toBe('');
      expect(await findServiceAccountByClientId(f.lifecycle.client.id)).toEqual(before);
      expect(await readLifecycleAccount(requireManagementBinding(f).serviceAccountId)).toEqual(account);
      expect(await readLifecycleSecrets(f.lifecycle.client.id)).toEqual(secrets);
    });

    it('should restore only the same account with 200 and retire all current secrets without generating one', async () => {
      const f = requireManagementFixture(fixture);
      const original = requireManagementBinding(f);
      const revoke = await machineRequest(f, {
        method: 'DELETE', path: managementPath(f.lifecycle.client.id), token: f.humanToken(f.lifecycle.actor),
      });
      expect(revoke.status).toBe(204);
      const revoked = await findServiceAccountByClientId(f.lifecycle.client.id);
      const secrets = await readLifecycleSecrets(f.lifecycle.client.id);
      expect(secrets.length).toBeGreaterThan(0);
      const auditIds = (await readLifecycleAudits()).map((audit) => audit.id);
      const restored = await machineRequest(f, {
        method: 'PUT', path: managementPath(f.lifecycle.client.id), token: f.humanToken(f.lifecycle.actor),
        body: { targets: [f.lifecycle.otherTarget] },
      });
      expect(restored.status).toBe(200);
      const binding = expectManagementBinding(restored.body, { ...original, status: 'active', targets: [f.lifecycle.otherTarget] });
      expect(binding.id).toBe(original.id);
      expect(binding.serviceAccountId).toBe(original.serviceAccountId);
      const account = await readLifecycleAccount(original.serviceAccountId);
      expect(account?.status).toBe('active');
      expect(account?.isServiceAccount).toBe(true);
      expect(account?.roles?.map((role) => role.id)).toEqual([f.lifecycle.serviceRole.id]);
      const after = await findServiceAccountByClientId(f.lifecycle.client.id);
      expect(after?.status).toBe('active');
      expect(after?.accountId).toBe(original.serviceAccountId);
      expect(after?.authorizationVersion).not.toBe(revoked?.authorizationVersion);
      const retired = await readLifecycleSecrets(f.lifecycle.client.id);
      const originalSecretIds = new Set(secrets.map((secret) => secret.id));
      expect(retired.every((secret) => originalSecretIds.has(secret.id))).toBe(true);
      expect(retired.every((secret) => secret.status === 'revoked')).toBe(true);
      expect(f.mail.attempts).toBe(0);
      await expectHumanManagementAudit(f, auditIds, [original.id, original.serviceAccountId, f.lifecycle.client.id]);
      expect(await verify(f.lifecycle.client.id, f.credential.plaintext)).toBe(false);
    });
  });
});
