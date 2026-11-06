import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from '../../../src/auth/index.js';
import { replaceInvitation } from '../../../src/auth/token-repository.js';
import { getPool } from '../../../src/lib/database.js';
import { createTestRole } from '../helpers/factories.js';
import type { LifecycleFixture } from './lifecycle-fixtures.js';
import {
  captureReservedRoleMail,
  createReservedRoleFixture,
  readReservedRoleCsrf,
  resetReservedRoleRuntime,
  startReservedRoleApp,
} from './reserved-role-fixtures.js';
import type { ReservedRoleApp } from './reserved-role-fixtures.js';

/** Human account observation deliberately excludes password hash contents. */
interface AcceptedHuman {
  /** Newly created ordinary identity. */
  id: string;
  /** Accepted invitations activate the ordinary human account. */
  status: string;
  /** Permanent classification must remain human. */
  isServiceAccount: boolean;
  /** Acceptance sets a password without exposing its stored hash. */
  hasPassword: boolean;
  /** Possession of the invitation verifies the invited email. */
  emailVerified: boolean;
}

describe('old invitation reserved-role assignments through public acceptance', () => {
  let fixture: LifecycleFixture;
  let app: ReservedRoleApp | undefined;

  beforeEach(async () => {
    fixture = await createReservedRoleFixture();
    captureReservedRoleMail();
    app = await startReservedRoleApp(fixture.actor.id);
  });

  afterEach(async () => {
    await resetReservedRoleRuntime(app);
    app = undefined;
  });

  // Old unavailable assignments are skipped, not granted or turned into service ownership.
  it.each(['reserved only', 'reserved with ordinary assignments', 'ordinary assignments only'] as const)(
    'should accept %s as a human and preserve every valid ordinary assignment',
    async (assignments) => {
      if (!app) throw new Error('Missing owned application listener');
      const sameSlug = await createTestRole(fixture.application.id, {
        name: 'Synthetic ordinary same-slug acceptance role',
        slug: 'porta-invite-service',
      });
      const reserved = { applicationId: fixture.adminApplication.id, roleId: fixture.serviceRole.id };
      const ordinary = [
        ...fixture.target.allowedRoles,
        { applicationId: fixture.application.id, roleId: sameSlug.id },
      ];
      const expectedRoles = assignments === 'reserved only' ? [] : ordinary;
      const roles = assignments === 'reserved only'
        ? [reserved]
        : assignments === 'ordinary assignments only' ? ordinary : [reserved, ...ordinary];
      const token = randomBytes(32).toString('hex');
      const email = `synthetic-accept-${randomBytes(8).toString('hex')}@test.example.com`;

      // Persist an already-issued artifact directly so current invitation admission cannot mask acceptance.
      await replaceInvitation({
        organizationId: fixture.target.organizationId,
        applicationId: null,
        email,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        givenName: null,
        familyName: null,
        locale: null,
        details: { roles },
        invitedBy: fixture.actor.id,
      });
      const acceptanceUrl = `${app.baseUrl}/${fixture.organization.slug}/auth/accept-invite/${token}`;
      const form = await fetch(`${acceptanceUrl}?step=password`, { redirect: 'manual' });
      expect(form.status).toBe(200);
      expect(form.headers.get('content-type')).toContain('text/html');
      const cookies = form.headers.getSetCookie().map((cookie) => cookie.split(';', 1)[0]).join('; ');
      expect(cookies.length).toBeGreaterThan(0);
      const csrf = readReservedRoleCsrf(await form.text());
      const password = `Synthetic!Aa9${randomBytes(18).toString('hex')}`;

      const accepted = await fetch(acceptanceUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Cookie: cookies,
        },
        body: new URLSearchParams({ password, confirmPassword: password, _csrf: csrf }),
        redirect: 'manual',
      });

      expect(accepted.status).toBe(200);
      expect(accepted.headers.get('content-type')).toContain('text/html');
      const page = await accepted.text();
      expect(page).not.toMatch(/\bis_service_account\b|\bisServiceAccount\b/);
      const users = await getPool().query<AcceptedHuman>(`
        SELECT id, status, is_service_account AS "isServiceAccount",
               (password_hash IS NOT NULL) AS "hasPassword", email_verified AS "emailVerified"
        FROM users WHERE organization_id = $1 AND email = $2
      `, [fixture.target.organizationId, email]);
      expect(users.rows).toHaveLength(1);
      const human = users.rows[0];
      expect(human).toMatchObject({
        status: 'active',
        isServiceAccount: false,
        hasPassword: true,
        emailVerified: true,
      });
      const memberships = await getPool().query<{ applicationId: string; roleId: string }>(`
        SELECT r.application_id AS "applicationId", r.id AS "roleId"
        FROM user_roles ur JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = $1 ORDER BY r.id
      `, [human.id]);
      expect(memberships.rows).toEqual([...expectedRoles].sort((left, right) => left.roleId.localeCompare(right.roleId)));
      expect(memberships.rows.some((role) => role.roleId === fixture.serviceRole.id)).toBe(false);
      const invitations = await getPool().query<{ consumed: boolean }>(`
        SELECT (used_at IS NOT NULL) AS consumed FROM invitation_tokens
        WHERE organization_id = $1 AND email = $2
      `, [fixture.target.organizationId, email]);
      expect(invitations.rows).toEqual([{ consumed: true }]);
      const bindings = await getPool().query<{ count: number }>(
        'SELECT count(*)::int AS count FROM client_service_accounts',
      );
      expect(bindings.rows).toEqual([{ count: 0 }]);
      const permissions = await getPool().query<{ slug: string }>(`
        SELECT p.slug FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
        WHERE rp.role_id = $1 ORDER BY p.slug
      `, [fixture.serviceRole.id]);
      expect(permissions.rows).toEqual([{ slug: 'admin:user:invite' }]);
    },
  );
});
