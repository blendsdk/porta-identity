/**
 * System configuration admin API routes.
 *
 * All routes are under `/api/admin/config` and require admin
 * authorization with granular permissions.
 *
 * Route structure:
 *   GET    /                  — List the closed public catalog
 *   GET    /:key              — Read one authoritative catalog entry
 *   PUT    /                  — Atomically update a non-empty catalog batch
 *   PUT    /:key              — Update one native catalog value
 *
 * Internal rows and bootstrap secrets are never queried or projected. Public metadata comes
 * from the application catalog, not editable database descriptions or sensitivity flags.
 *
 * @module routes/config
 */

import Router from '@koa/router';
import type { Context } from 'koa';
import { z } from 'zod';
import { requireAdminAuth } from '../middleware/admin-auth.js';
import { requirePermission } from '../middleware/require-permission.js';
import { ADMIN_PERMISSIONS } from '../lib/admin-permissions.js';
import {
  afterDatabaseCommit,
  getDatabaseTransactionClient,
  getPool,
  runDatabaseTransaction,
} from '../lib/database.js';
import { writeAuditLogInTransaction } from '../lib/audit-log.js';
import { clearSystemConfigCache } from '../lib/system-config.js';
import {
  SYSTEM_CONFIG_CATALOG,
  findSystemConfigDefinition,
  validateSystemConfigValue,
} from '../lib/system-config-catalog.js';
import type { SystemConfigDefinition, SystemConfigValue } from '../lib/system-config-catalog.js';

/** Only stored content and its timestamp may contribute to public policy responses. */
interface ConfigRow {
  /** Exact identifier returned by the parameterized query. */
  key: string;
  /** JSONB content requiring validation against application-owned metadata. */
  value: unknown;
  /** PostgreSQL timestamp, accepted only when it describes a valid instant. */
  updated_at: Date | string;
}

/** Project authoritative rows in catalog order; missing, duplicate or corrupt rows fail closed. */
function projectConfigEntries(definitions: readonly SystemConfigDefinition[], rows: ConfigRow[]) {
  if (rows.length !== definitions.length) throw new Error('Configuration rows are unavailable');
  return definitions.map((definition) => {
    const matches = rows.filter((row) => row.key === definition.key);
    const row = matches[0];
    if (matches.length !== 1 || !row) throw new Error('Configuration row is unavailable');
    const value = validateSystemConfigValue(definition, row.value);
    const timestamp = row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at);
    if (value === undefined) throw new Error('Configuration value is invalid');
    if (!Number.isFinite(timestamp.getTime())) throw new Error('Configuration timestamp is invalid');
    return { ...definition, value, updatedAt: timestamp.toISOString() };
  });
}

/** Non-catalog names share one response without inspecting internal database existence. */
function configNotFound(ctx: Context): void {
  ctx.status = 404;
  ctx.body = { error: 'Configuration entry not found', code: 'config_entry_not_found' };
}

/** Storage failures never expose stored values, infrastructure or database diagnostics. */
function configUnavailable(ctx: Context): void {
  ctx.status = 503;
  ctx.body = {
    error: 'Configuration store is unavailable',
    code: 'config_store_unavailable',
    requestId: ctx.state.requestId,
  };
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

/**
 * Exact single-value envelope; the selected catalog definition validates the unknown scalar.
 * @example
 * updateConfigSchema.safeParse({ value: 1200 });
 */
export const updateConfigSchema = z.object({ value: z.unknown() }).strict();

/** Exact batch envelope; native value and non-empty catalog validation follow before mutation. */
const updateConfigBatchSchema = z.object({ values: z.record(z.string(), z.unknown()) }).strict();

/** Fixed validation response independent of submitted content. */
function configInvalid(ctx: Context): void {
  ctx.status = 400;
  ctx.body = { error: 'Configuration value is invalid', code: 'config_value_invalid' };
}

/** One completely validated native change, resolved before opening the transaction. */
interface ConfigChange {
  /** Application-owned metadata, never supplied by the caller. */
  definition: SystemConfigDefinition;
  /** Scalar satisfying that definition's exact type and inclusive bounds. */
  value: SystemConfigValue;
}

/**
 * Commit values and one minimal audit record together, then invalidate only the local cache.
 * Missing targets and invalid readback roll back instead of silently repairing catalog rows.
 */
async function commitConfigChanges(ctx: Context, changes: ConfigChange[], single: boolean) {
  try {
    const restartRequired = changes.some(
      ({ definition }) => definition.applicationMode === 'restart-required',
    );
    const data = await runDatabaseTransaction(async () => {
      const rows: ConfigRow[] = [];
      for (const { definition, value } of changes) {
        const updated = await getPool().query<ConfigRow>(
          `UPDATE system_config SET value = $1::jsonb, updated_at = NOW() WHERE key = $2
           RETURNING key, value, updated_at`,
          [JSON.stringify(value), definition.key],
        );
        if (updated.rowCount !== 1 || updated.rows.length !== 1)
          throw new Error('Configuration update is unavailable');
        // Validate each returned row against its target before it enters the response or commits.
        projectConfigEntries([definition], updated.rows);
        rows.push(...updated.rows);
      }
      const definitions = SYSTEM_CONFIG_CATALOG.filter((definition) =>
        changes.some((change) => change.definition.key === definition.key),
      );
      const entries = projectConfigEntries(definitions, rows);
      const client = getDatabaseTransactionClient();
      const actor = ctx.state.adminUser;
      if (!client || !actor) throw new Error('Configuration actor is unavailable');
      const liveActor = await client.query<{ id: string; organization_id: string }>(
        'SELECT id, organization_id FROM users WHERE id = $1',
        [actor.id],
      );
      const storedActor = liveActor.rows[0];
      if (liveActor.rows.length !== 1 || !storedActor)
        throw new Error('Configuration actor is unavailable');
      await writeAuditLogInTransaction(client, {
        organizationId: storedActor.organization_id,
        actorId: storedActor.id,
        eventType: 'admin.config.updated',
        eventCategory: 'admin',
        metadata: {
          keys: changes.map(({ definition }) => definition.key).sort(),
          restartRequired,
        },
      });
      await afterDatabaseCommit(async () => clearSystemConfigCache());
      return entries;
    });
    ctx.body = { data: single ? data[0] : data, restartRequired };
  } catch {
    configUnavailable(ctx);
  }
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Create the system config admin API router.
 *
 * All routes require admin authorization with granular permissions.
 * Reads are authoritative; updates own the existing transaction, specialized audit and local
 * post-commit cache boundary. Bootstrap settings and internal identifiers stay outside this API.
 *
 * @returns Koa router mounted at /api/admin/config
 * @example
 * app.use(createConfigRouter().routes());
 */
export function createConfigRouter(): Router {
  const router = new Router({ prefix: '/api/admin/config' });

  // Apply admin auth to all config routes
  router.use(requireAdminAuth());

  // ── GET / — List all config entries ───────────────────────────────
  router.get('/', requirePermission(ADMIN_PERMISSIONS.CONFIG_READ), async (ctx) => {
    try {
      const result = await getPool().query<ConfigRow>(
        'SELECT key, value, updated_at FROM system_config WHERE key = ANY($1::text[])',
        [SYSTEM_CONFIG_CATALOG.map((definition) => definition.key)],
      );
      ctx.body = { data: projectConfigEntries(SYSTEM_CONFIG_CATALOG, result.rows) };
    } catch {
      configUnavailable(ctx);
    }
  });

  // ── GET /:key — Get a specific config value ───────────────────────
  router.get('/:key', requirePermission(ADMIN_PERMISSIONS.CONFIG_READ), async (ctx) => {
    const definition = findSystemConfigDefinition(ctx.params.key);
    if (!definition) {
      configNotFound(ctx);
      return;
    }
    try {
      const result = await getPool().query<ConfigRow>(
        'SELECT key, value, updated_at FROM system_config WHERE key = $1',
        [definition.key],
      );
      ctx.body = { data: projectConfigEntries([definition], result.rows)[0] };
    } catch {
      configUnavailable(ctx);
    }
  });

  router.put('/', requirePermission(ADMIN_PERMISSIONS.CONFIG_UPDATE), async (ctx) => {
    const body: unknown = ctx.request.body;
    // Resolve names before validating values so internal and unknown names cannot be enumerated.
    if (typeof body === 'object' && body !== null && 'values' in body) {
      const values = body.values;
      if (typeof values === 'object' && values !== null && !Array.isArray(values)) {
        if (Object.keys(values).some((key) => !findSystemConfigDefinition(key))) {
          configNotFound(ctx);
          return;
        }
      }
    }
    const parsed = updateConfigBatchSchema.safeParse(body);
    if (!parsed.success || Object.keys(parsed.data.values).length === 0) {
      configInvalid(ctx);
      return;
    }
    const changes: ConfigChange[] = [];
    for (const [key, candidate] of Object.entries(parsed.data.values)) {
      const definition = findSystemConfigDefinition(key);
      if (!definition) {
        configNotFound(ctx);
        return;
      }
      const value = validateSystemConfigValue(definition, candidate);
      if (value === undefined) {
        configInvalid(ctx);
        return;
      }
      changes.push({ definition, value });
    }
    await commitConfigChanges(ctx, changes, false);
  });

  router.put('/:key', requirePermission(ADMIN_PERMISSIONS.CONFIG_UPDATE), async (ctx) => {
    const definition = findSystemConfigDefinition(ctx.params.key);
    if (!definition) {
      configNotFound(ctx);
      return;
    }
    const parsed = updateConfigSchema.safeParse(ctx.request.body);
    const value = parsed.success
      ? validateSystemConfigValue(definition, parsed.data.value)
      : undefined;
    if (value === undefined) {
      configInvalid(ctx);
      return;
    }
    await commitConfigChanges(ctx, [{ definition, value }], true);
  });

  return router;
}
