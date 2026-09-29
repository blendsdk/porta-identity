/**
 * Specification tests for exporting one user's administrative record.
 *
 * The export document reads the live schema. Claim values are joined with
 * their definitions so every entry carries the definition's claim name and
 * application. The administrative route returns the document inside a
 * `{ data }` envelope to an administrator holding `admin:user:read`.
 */
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import Koa from 'koa';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/middleware/admin-auth.js', () => ({
  requireAdminAuth: () => async (_ctx: object, next: () => Promise<void>) => next(),
}));

import { upsertValue } from '../../../src/custom-claims/repository.js';
import { createUserRouter } from '../../../src/routes/users.js';
import { exportUserData } from '../../../src/users/gdpr.js';
import { seedBaseData, truncateAllTables } from '../helpers/database.js';
import {
  createTestApplication,
  createTestClaimDefinition,
  createTestOrganization,
  createTestUser,
} from '../helpers/factories.js';
import { flushTestRedis } from '../helpers/redis.js';

/**
 * Call the export route with only the authenticated administrator substituted.
 * The router, its permission check, and its tenant guard run unchanged against
 * the real test database.
 *
 * @param organizationId - Organization path parameter owning the target user
 * @param userId - User path parameter to export
 * @returns The completed Koa context carrying status, body, and response headers
 */
async function requestExport(organizationId: string, userId: string) {
  const incoming = new IncomingMessage(new Socket());
  incoming.method = 'GET';
  incoming.url = `/api/admin/organizations/${organizationId}/users/${userId}/export`;
  const context = new Koa().createContext(incoming, new ServerResponse(incoming));
  context.state = {
    requestId: 'gdpr-export-request',
    adminUser: {
      id: '10000000-0000-4000-8000-000000000001',
      email: 'export-operator@example.test',
      organizationId,
      roles: [],
      permissions: ['admin:user:read'],
    },
  };
  await createUserRouter().routes()(context, async () => undefined);
  return context;
}

describe('user data export', () => {
  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    await flushTestRedis();
  });

  describe('exportUserData', () => {
    // A stored claim value appears with the claim name and application taken
    // from its definition, not from the value row.
    it('should derive a custom claim entry from the claim definition when the user has a claim value', async () => {
      const organization = await createTestOrganization();
      const application = await createTestApplication();
      const definition = await createTestClaimDefinition(application.id, {
        claimName: 'department',
      });
      const user = await createTestUser(organization.id);
      await upsertValue(user.id, definition.id, 'engineering');

      const result = await exportUserData(user);

      expect(result.customClaims).toEqual([
        {
          claimName: definition.claimName,
          value: 'engineering',
          applicationId: application.id,
        },
      ]);
    });

    // Claim entries are ordered by claim name so the exported document is stable.
    it('should order custom claim entries by claim name when the user has several claim values', async () => {
      const organization = await createTestOrganization();
      const application = await createTestApplication();
      const later = await createTestClaimDefinition(application.id, { claimName: 'zulu_claim' });
      const earlier = await createTestClaimDefinition(application.id, {
        claimName: 'alpha_claim',
      });
      const user = await createTestUser(organization.id);
      await upsertValue(user.id, later.id, 'last');
      await upsertValue(user.id, earlier.id, 'first');

      const result = await exportUserData(user);

      expect(result.customClaims).toEqual([
        { claimName: 'alpha_claim', value: 'first', applicationId: application.id },
        { claimName: 'zulu_claim', value: 'last', applicationId: application.id },
      ]);
    });

    // A user without stored claim values still receives a complete document.
    it('should return an empty custom claims list when the user has no claim values', async () => {
      const organization = await createTestOrganization();
      const user = await createTestUser(organization.id);

      const result = await exportUserData(user);

      expect(result.customClaims).toEqual([]);
    });
  });

  describe('GET /api/admin/organizations/:orgId/users/:userId/export', () => {
    // The route wraps the export document in the standard `{ data }` envelope.
    it('should answer 200 with the export envelope when the target user has claim values', async () => {
      const organization = await createTestOrganization();
      const application = await createTestApplication();
      const definition = await createTestClaimDefinition(application.id, {
        claimName: 'department',
      });
      const user = await createTestUser(organization.id);
      await upsertValue(user.id, definition.id, 'engineering');

      const context = await requestExport(organization.id, user.id);

      expect(context.status).toBe(200);
      expect(context.body).toEqual({
        data: expect.objectContaining({
          customClaims: [
            {
              claimName: definition.claimName,
              value: 'engineering',
              applicationId: application.id,
            },
          ],
        }),
      });
    });

    // The route succeeds for a user with no claims and returns an empty list.
    it('should answer 200 with an empty custom claims list when the target user has no claim values', async () => {
      const organization = await createTestOrganization();
      const user = await createTestUser(organization.id);

      const context = await requestExport(organization.id, user.id);

      expect(context.status).toBe(200);
      expect(context.body).toEqual({
        data: expect.objectContaining({ customClaims: [] }),
      });
    });
  });
});
