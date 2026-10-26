/**
 * Implementation-level audit actor display checks.
 */

import { describe, expect, it } from 'vitest';
import type { AuditEntry } from '@portaidentity/sdk';
import { auditActor } from '../../src/commands/audit.js';

function entry(overrides: Partial<AuditEntry>): AuditEntry {
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

describe('audit actor implementation', () => {
  it('keeps the ID-only and missing-actor fallbacks', () => {
    expect(auditActor(entry({ actorType: 'client', actorClientId: 'bff' }))).toBe('bff');
    expect(auditActor(entry({ actorType: 'client' }))).toBe('—');
    expect(auditActor(entry({ actorType: 'user', actorId: 'user-1' }))).toBe('user-1');
  });
});
