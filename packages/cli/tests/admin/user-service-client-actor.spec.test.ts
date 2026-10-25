/**
 * Specification tests for client actor display in the Admin user history.
 */

import { describe, expect, it, vi } from 'vitest';
import { createAdminUserOperations } from '../../src/admin/user-service.js';

const organizationId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const actorId = '33333333-3333-4333-8333-333333333333';

function domain(getHistory: ReturnType<typeof vi.fn>) {
  return {
    list: vi.fn(),
    get: vi.fn(),
    getHistory,
    invitePreview: vi.fn(),
    create: vi.fn(),
    invite: vi.fn(),
    update: vi.fn(),
    setPassword: vi.fn(),
    clearPassword: vi.fn(),
    verifyEmail: vi.fn(),
    deactivate: vi.fn(),
    activate: vi.fn(),
    delete: vi.fn(),
  };
}

describe('user history client actor display', () => {
  it('renders client, user, and system actors and degrades unsafe client text', async () => {
    const getHistory = vi.fn().mockResolvedValue({
      data: [
        {
          id: '44444444-4444-4444-8444-444444444441',
          eventType: 'user.created',
          actorId: null,
          actorType: 'client',
          actorClientId: 'bff-client',
          actorClientName: 'Acme BFF',
          metadata: null,
          createdAt: '2026-08-29T12:00:00.000Z',
        },
        {
          id: '44444444-4444-4444-8444-444444444442',
          eventType: 'user.updated',
          actorId: null,
          actorType: 'client',
          actorClientId: 'bff-unsafe',
          actorClientName: 'Evil\u001b[31m',
          metadata: null,
          createdAt: '2026-08-29T11:00:00.000Z',
        },
        {
          id: '44444444-4444-4444-8444-444444444443',
          eventType: 'user.deactivated',
          actorId,
          actorType: 'user',
          metadata: null,
          createdAt: '2026-08-29T10:00:00.000Z',
        },
        {
          id: '44444444-4444-4444-8444-444444444444',
          eventType: 'user.auto_unlocked',
          actorId: null,
          actorType: 'system',
          metadata: null,
          createdAt: '2026-08-29T09:00:00.000Z',
        },
      ],
      hasMore: false,
      nextCursor: null,
    });
    const operations = createAdminUserOperations(() => domain(getHistory));

    const result = await operations.getHistory(organizationId, userId);

    expect(result).toEqual({
      kind: 'success',
      value: {
        entries: [
          {
            eventType: 'user.created',
            actor: 'Acme BFF (bff-client)',
            createdAt: '2026-08-29T12:00:00.000Z',
          },
          { eventType: 'user.updated', actor: 'bff-unsafe', createdAt: '2026-08-29T11:00:00.000Z' },
          { eventType: 'user.deactivated', actor: actorId, createdAt: '2026-08-29T10:00:00.000Z' },
          {
            eventType: 'user.auto_unlocked',
            actor: 'System',
            createdAt: '2026-08-29T09:00:00.000Z',
          },
        ],
        hasMore: false,
      },
    });
    expect(JSON.stringify(result)).not.toContain('\u001b');
  });
});
