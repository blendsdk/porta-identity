/**
 * Specification tests for client actor display in the audit list.
 */

import { describe, expect, it } from 'vitest';
import type { AuditEntry } from '@portaidentity/sdk';
import { auditActor } from '../../src/commands/audit.js';

function entry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: 'audit-1',
    eventType: 'user.created',
    eventCategory: 'admin',
    actorId: null,
    organizationId: 'org-1',
    userId: 'user-1',
    description: null,
    metadata: null,
    ipAddress: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('audit client actor display', () => {
  it('shows the client name and identifier', () => {
    expect(
      auditActor(
        entry({
          actorType: 'client',
          actorClientId: 'bff-client',
          actorClientName: 'Acme BFF',
        }),
      ),
    ).toBe('Acme BFF (bff-client)');
  });

  it('shows the client identifier when the name is missing', () => {
    expect(
      auditActor(
        entry({ actorType: 'client', actorClientId: 'bff-client', actorClientName: null }),
      ),
    ).toBe('bff-client');
  });

  it('keeps user actor display unchanged and uses a placeholder for a missing actor', () => {
    expect(auditActor(entry({ actorType: 'user', actorId: 'user-1' }))).toBe('user-1');
    expect(auditActor(entry({ actorType: 'system' }))).toBe('—');
  });
});
