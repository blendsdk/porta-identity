/**
 * Test-only audit fixture helper.
 *
 * Direct fixture inserts must classify the actor explicitly so they cannot
 * create rows that violate the production actor shape. Pass either the shared
 * pool or a transaction client.
 */

/** Minimal query boundary accepted by the audit fixture helper. */
export interface AuditInsertTarget {
  query(text: string, values?: unknown[]): Promise<unknown>;
}

/** Audit fixture fields needed by tests. */
export interface AuditFixtureEntry {
  organizationId?: string | null;
  userId?: string | null;
  actorId?: string | null;
  actorType?: 'user' | 'client' | 'system';
  actorClientId?: string | null;
  actorClientName?: string | null;
  eventType: string;
  eventCategory: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
  createdAt?: Date;
}

/**
 * Insert one audit fixture row with a complete actor classification.
 *
 * @param target - Pool or transaction client used by the test
 * @param entry - Fixture fields
 */
export async function insertAuditFixture(
  target: AuditInsertTarget,
  entry: AuditFixtureEntry,
): Promise<void> {
  const actorType =
    entry.actorType ?? (entry.actorId ? 'user' : entry.actorClientId ? 'client' : 'system');
  const actorId = actorType === 'user' ? (entry.actorId ?? null) : null;
  const actorClientId = actorType === 'client' ? (entry.actorClientId ?? null) : null;
  const actorClientName = actorType === 'client' ? (entry.actorClientName ?? null) : null;

  await target.query(
    `INSERT INTO audit_log (
       organization_id, user_id, actor_id, actor_type, actor_client_id, actor_client_name,
       event_type, event_category, description, metadata, created_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)`,
    [
      entry.organizationId ?? null,
      entry.userId ?? null,
      actorId,
      actorType,
      actorClientId,
      actorClientName,
      entry.eventType,
      entry.eventCategory,
      entry.description ?? null,
      JSON.stringify(entry.metadata ?? {}),
      entry.createdAt ?? new Date(),
    ],
  );
}
