import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { bulkUserStatusSchema } from '../../../src/routes/bulk.js';
import { bulkStatusChange } from '../../../src/lib/bulk-operations.js';
import {
  importData,
  importManifestSchema,
  ImportOperationError,
} from '../../../src/lib/data-import.js';
import {
  exportData,
  ExportOperationError,
  type ExportOptions,
} from '../../../src/lib/data-export.js';
import { ADMIN_PERMISSIONS, hasPermissions } from '../../../src/lib/admin-permissions.js';
import { getPool } from '../../../src/lib/database.js';
import { flushTestRedis } from '../../integration/helpers/redis.js';
import { seedBaseData, truncateAllTables } from '../../integration/helpers/database.js';
import {
  createTestApplication,
  createTestClient,
  createTestClientWithSecret,
  createTestOrganization,
  createTestRole,
  createTestUser,
} from '../../integration/helpers/factories.js';
import type {
  AdministrativeAuditObservation,
  AdministrativeDataFixture,
  AdministrativeDataObservation,
  AdministrativeDataSpecDriver,
  AdministrativeEntityObservation,
  BulkActionOutcome,
  BulkEntityType,
  ExportActionOutcome,
  ExportEntityType,
  ImportActionOutcome,
  ImportEntityOutcome,
  ImportMode,
  JsonObject,
  JsonValue,
} from './administrative-data-contract.js';

/** Stable dependency text used only inside test-owned database triggers. */
const DEPENDENCY_ERROR_CANARY = 'postgresql://private-host/assurance_dependency_failure';
/** Protected value which must never survive manifest validation. */
const SECRET_CANARY = 'assurance-secret-value';
/** Private audit value which must not cross the export boundary. */
const AUDIT_PRIVATE_CANARY = 'assurance-private-audit-value';

/** Convert database and public values into the contract's JSON vocabulary. */
function jsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => jsonValue(item));
  if (typeof value === 'object') {
    const result: Record<string, JsonValue> = {};
    for (const [key, item] of Object.entries(value)) result[key] = jsonValue(item);
    return result;
  }
  return String(value);
}

/** Convert a public object without retaining prototypes or error instances. */
function jsonObject(value: Readonly<Record<string, unknown>>): JsonObject {
  const result: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) result[key] = jsonValue(item);
  return result;
}

/** Parse RFC-style CSV into cells so formula checks never trust string fragments alone. */
function parseCsvCells(source: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (!quoted && (character === ',' || character === '\n')) {
      cells.push(cell.replace(/\r$/, ''));
      cell = '';
      continue;
    }
    cell += character;
  }
  cells.push(cell);
  return cells;
}

/** Map a production import row to the immutable public observation shape. */
function importEntity(value: Readonly<Record<string, unknown>>): ImportEntityOutcome {
  const naturalKey = typeof value.slug === 'string' ? value.slug : '';
  const entityType = typeof value.type === 'string' ? value.type : '';
  const changedFields = Array.isArray(value.changes)
    ? value.changes.filter((item): item is string => typeof item === 'string')
    : [];
  return {
    entityType,
    naturalKey,
    changedFields,
    ...(typeof value.credentialWillBeGenerated === 'boolean'
      ? { credentialWillBeGenerated: value.credentialWillBeGenerated }
      : {}),
    ...(typeof value.id === 'string' ? { publicIdentifier: value.id } : {}),
  };
}

/** Ensure each export request carries both required permission classes. */
function exportAuthorized(entityType: ExportEntityType, permissions: readonly string[]): boolean {
  const entityPermission = {
    organizations: ADMIN_PERMISSIONS.ORG_READ,
    users: ADMIN_PERMISSIONS.USER_READ,
    clients: ADMIN_PERMISSIONS.CLIENT_READ,
    roles: ADMIN_PERMISSIONS.ROLE_READ,
    audit: ADMIN_PERMISSIONS.AUDIT_READ,
  }[entityType];
  return hasPermissions(permissions, [ADMIN_PERMISSIONS.EXPORT_READ, entityPermission]);
}

/** PostgreSQL-backed driver over the production schemas and administrative services. */
export class ProductionAdministrativeDataDriver implements AdministrativeDataSpecDriver {
  private fixture: AdministrativeDataFixture | null = null;
  private bulkFailureAfter: number | null = null;
  private importFailureKey: string | null = null;
  private triggerNames: string[] = [];

  /** Remove test-owned triggers and leave the shared integration database reusable. */
  public async dispose(): Promise<void> {
    await this.dropFaultTriggers();
  }

  /** Restore deterministic Alpha/Bravo data and return all opaque fixture identities. */
  public async reset(): Promise<AdministrativeDataFixture> {
    await this.dropFaultTriggers();
    await truncateAllTables();
    await seedBaseData();
    await flushTestRedis();
    this.bulkFailureAfter = null;
    this.importFailureKey = null;

    const alpha = await createTestOrganization({
      name: 'Administrative Alpha',
      slug: `admin-alpha-${randomUUID()}`,
    });
    const bravo = await createTestOrganization({
      name: 'Administrative Bravo',
      slug: `admin-bravo-${randomUUID()}`,
    });
    const alphaApplication = await createTestApplication({
      name: 'Administrative Alpha Application',
      slug: `admin-alpha-app-${randomUUID()}`,
    });
    const bravoApplication = await createTestApplication({
      name: 'Administrative Bravo Application',
      slug: `admin-bravo-app-${randomUUID()}`,
    });
    const existingClientName = `existing-client-${randomUUID()}`;
    await createTestClientWithSecret(alpha.id, alphaApplication.id, {
      clientName: existingClientName,
      grantTypes: ['authorization_code'],
      redirectUris: [],
      responseTypes: ['code'],
      scope: 'openid',
      tokenEndpointAuthMethod: 'client_secret_post',
    });
    await createTestClient(bravo.id, bravoApplication.id, {
      clientName: `bravo-client-${randomUUID()}`,
    });
    await createTestRole(alphaApplication.id, { slug: `alpha-role-${randomUUID()}` });
    await createTestRole(bravoApplication.id, { slug: `bravo-role-${randomUUID()}` });
    const firstUser = await createTestUser(alpha.id, {
      email: `alpha-one-${randomUUID()}@test.example.com`,
    });
    const secondUser = await createTestUser(alpha.id, {
      email: `alpha-two-${randomUUID()}@test.example.com`,
    });
    const bravoUser = await createTestUser(bravo.id, {
      email: `bravo-${randomUUID()}@test.example.com`,
    });
    const actor = await createTestUser(alpha.id, {
      email: `actor-${randomUUID()}@test.example.com`,
    });

    this.fixture = Object.freeze({
      alphaOrganizationId: alpha.id,
      alphaOrganizationSlug: alpha.slug,
      alphaOrganizationName: alpha.name,
      bravoOrganizationId: bravo.id,
      bravoOrganizationSlug: bravo.slug,
      alphaApplicationId: alphaApplication.id,
      alphaApplicationSlug: alphaApplication.slug,
      bravoApplicationId: bravoApplication.id,
      bravoApplicationSlug: bravoApplication.slug,
      alphaUserIds: [firstUser.id, secondUser.id],
      bravoUserId: bravoUser.id,
      missingUserId: randomUUID(),
      existingClientNaturalKey: existingClientName,
      newClientNaturalKey: `new-client-${randomUUID()}`,
      actorId: actor.id,
      dependencyErrorCanary: DEPENDENCY_ERROR_CANARY,
      secretCanary: SECRET_CANARY,
      auditPrivateCanary: AUDIT_PRIVATE_CANARY,
      formulaCanaries: ['=SUM(1,1)', ' +cmd', '-10+20', ' @payload'],
    });
    return this.fixture;
  }

  /** Submit a bulk request through production validation and transaction services. */
  public async submitBulk(
    entityType: BulkEntityType,
    request: JsonValue,
  ): Promise<BulkActionOutcome> {
    const fixture = this.requireFixture();
    if (entityType !== 'user') {
      return this.rejectedBulk();
    }
    const parsed = bulkUserStatusSchema.safeParse(request);
    if (!parsed.success) return this.rejectedBulk();
    if (this.bulkFailureAfter !== null) {
      const failingId = parsed.data.ids[this.bulkFailureAfter];
      if (failingId) await this.installFailureTrigger('users', 'id', failingId, 'bulk');
      this.bulkFailureAfter = null;
    }
    const result = await bulkStatusChange({
      entityType: 'user',
      entityIds: parsed.data.ids,
      action: parsed.data.action,
      reason: parsed.data.reason,
      organizationId: parsed.data.organizationId,
      actorId: fixture.actorId,
    });
    return {
      accepted: true,
      total: result.total,
      succeeded: result.succeeded,
      failed: result.failed,
      results: result.results.map((item) => ({
        id: item.id,
        outcome: item.outcome,
        code: item.code,
      })),
      correlationId: result.correlationId ?? null,
      publicError: null,
      responseFields: ['total', 'succeeded', 'failed', 'results'],
    };
  }

  /** Arrange a database failure at the next uncommitted bulk item. */
  public async failBulkDependencyAfter(committedItems: number): Promise<void> {
    this.bulkFailureAfter = committedItems;
  }

  /** Submit a manifest through strict parsing, tenant scope, and the production transaction. */
  public async submitImport(
    mode: ImportMode,
    manifest: JsonValue,
    scope?: { readonly organizationId: string },
  ): Promise<ImportActionOutcome> {
    const fixture = this.requireFixture();
    const parsed = importManifestSchema.safeParse(manifest);
    if (!parsed.success) return this.rejectedImport('import_manifest_invalid');
    if (this.importFailureKey !== null) {
      await this.installFailureTrigger('clients', 'client_name', this.importFailureKey, 'import');
      this.importFailureKey = null;
    }
    try {
      const result = await importData(parsed.data, mode, fixture.actorId, scope?.organizationId);
      return {
        accepted: true,
        created: result.created.map((item) => importEntity(item)),
        updated: result.updated.map((item) => importEntity(item)),
        skipped: result.skipped.map((item) => importEntity(item)),
        credentials: result.credentials.map((item) => jsonObject(item)),
        publicError: null,
      };
    } catch (error) {
      const code = error instanceof ImportOperationError ? error.code : 'import_execution_failed';
      return this.rejectedImport(code);
    }
  }

  /** Arrange a transaction failure at one client natural key. */
  public async failImportAt(naturalKey: string): Promise<void> {
    this.importFailureKey = naturalKey;
  }

  /** Create an ambiguous persisted natural key which the planner must reject. */
  public async arrangeImportCollision(naturalKey: string): Promise<void> {
    const fixture = this.requireFixture();
    await createTestClient(fixture.alphaOrganizationId, fixture.alphaApplicationId, {
      clientName: naturalKey,
    });
    await createTestClient(fixture.alphaOrganizationId, fixture.alphaApplicationId, {
      clientName: naturalKey,
    });
  }

  /** Submit an authorized export and independently retain its source scope. */
  public async submitExport(input: {
    readonly entityType: ExportEntityType;
    readonly format: 'csv' | 'json';
    readonly permissions: readonly string[];
    readonly organizationId?: string;
    readonly applicationId?: string;
    readonly startDate?: string;
    readonly endDate?: string;
  }): Promise<ExportActionOutcome> {
    if (!exportAuthorized(input.entityType, input.permissions)) return this.rejectedExport(null);
    const options: ExportOptions = {
      entityType: input.entityType,
      format: input.format,
      ...(input.organizationId ? { organizationId: input.organizationId } : {}),
      ...(input.applicationId ? { applicationId: input.applicationId } : {}),
      ...(input.startDate ? { startDate: new Date(input.startDate) } : {}),
      ...(input.endDate ? { endDate: new Date(input.endDate) } : {}),
      actorId: this.requireFixture().actorId,
    };
    try {
      const source = await this.exportSourceScope(options);
      const result = await exportData(options);
      if (input.format === 'csv') {
        return {
          accepted: true,
          code: null,
          rowCount: result.rowCount,
          rows: [],
          ...source,
          csv: result.data,
          csvCells: parseCsvCells(result.data),
          responseBodyPresent: true,
        };
      }
      const parsed = z
        .object({ data: z.array(z.record(z.string(), z.unknown())), total: z.number() })
        .passthrough()
        .parse(JSON.parse(result.data));
      return {
        accepted: true,
        code: null,
        rowCount: parsed.total,
        rows: parsed.data.map((row) => jsonObject(row)),
        ...source,
        csv: null,
        csvCells: [],
        responseBodyPresent: true,
      };
    } catch (error) {
      return this.rejectedExport(
        error instanceof ExportOperationError ? error.code : 'export_failed',
      );
    }
  }

  /** Arrange a bounded or deliberately oversized source set for the next export. */
  public async arrangeExportRows(entityType: ExportEntityType, count: number): Promise<void> {
    const fixture = this.requireFixture();
    if (entityType !== 'users') throw new Error('Only user cardinality is arranged by this driver');
    await getPool().query('DELETE FROM users WHERE organization_id = $1', [
      fixture.alphaOrganizationId,
    ]);
    await getPool().query(
      `INSERT INTO users (organization_id, email, status)
       SELECT $1, 'export-' || value || '@test.example.com', 'active'
       FROM generate_series(1, $2::integer) AS value`,
      [fixture.alphaOrganizationId, count],
    );
  }

  /** Insert spreadsheet and private-audit canaries into exact owned rows. */
  public async arrangeExportSafetyCanaries(): Promise<void> {
    const fixture = this.requireFixture();
    for (const [index, canary] of fixture.formulaCanaries.entries()) {
      await createTestUser(fixture.alphaOrganizationId, {
        email: `formula-${index}-${randomUUID()}@test.example.com`,
        givenName: canary,
      });
    }
    await getPool().query(
      `INSERT INTO audit_log (
         organization_id, actor_id, event_type, event_category, description, metadata, created_at
       ) VALUES ($1, $2, 'unrecognized.private', 'admin', $3, $4, $5)`,
      [
        fixture.alphaOrganizationId,
        fixture.actorId,
        fixture.auditPrivateCanary,
        JSON.stringify({ body: fixture.auditPrivateCanary, error: fixture.dependencyErrorCanary }),
        new Date('2026-01-15T12:00:00.000Z'),
      ],
    );
  }

  /** Read durable state independently from service response envelopes. */
  public async observe(): Promise<AdministrativeDataObservation> {
    const entities = await this.observeEntities();
    const audits = await this.observeAudits();
    const secrets = await getPool().query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM client_secrets',
    );
    return {
      entities,
      audits,
      mailDeliveries: 0,
      cacheMutations: 0,
      generatedSecrets: Number(secrets.rows[0]?.count ?? 0),
      operationalOutput: [],
    };
  }

  /** Return a stable rejected bulk envelope. */
  private rejectedBulk(): BulkActionOutcome {
    return {
      accepted: false,
      total: 0,
      succeeded: 0,
      failed: 0,
      results: [],
      correlationId: null,
      publicError: 'bulk_request_invalid',
      responseFields: [],
    };
  }

  /** Return a minimal rejected import envelope. */
  private rejectedImport(code: string): ImportActionOutcome {
    return {
      accepted: false,
      created: [],
      updated: [],
      skipped: [],
      credentials: [],
      errors: [{ code }],
      publicError: code,
    };
  }

  /** Return a content-free export rejection. */
  private rejectedExport(code: string | null): ExportActionOutcome {
    return {
      accepted: false,
      code,
      rowCount: null,
      rows: [],
      sourceOrganizationIds: [],
      sourceApplicationIds: [],
      csv: null,
      csvCells: [],
      responseBodyPresent: false,
    };
  }

  /** Observe exact source relationship identities before serialization. */
  private async exportSourceScope(options: ExportOptions): Promise<{
    readonly sourceOrganizationIds: readonly string[];
    readonly sourceApplicationIds: readonly string[];
  }> {
    if (options.entityType === 'organizations') {
      return { sourceOrganizationIds: [], sourceApplicationIds: [] };
    }
    if (options.entityType === 'roles') {
      const relation = await getPool().query<{ organization_id: string; application_id: string }>(
        `SELECT DISTINCT organization_id, application_id FROM clients
         WHERE organization_id = $1 AND application_id = $2`,
        [options.organizationId, options.applicationId],
      );
      return {
        sourceOrganizationIds: relation.rows.map((row) => row.organization_id),
        sourceApplicationIds: relation.rows.map((row) => row.application_id),
      };
    }
    return {
      sourceOrganizationIds: options.organizationId ? [options.organizationId] : [],
      sourceApplicationIds: [],
    };
  }

  /** Collect stable entity snapshots for mutation and credential comparisons. */
  private async observeEntities(): Promise<AdministrativeEntityObservation[]> {
    const fixture = this.requireFixture();
    const rows = await getPool().query<{
      entity_type: string;
      id: string;
      natural_key: string;
      organization_id: string | null;
      parent_id: string | null;
      fields: Record<string, unknown>;
      credential_fingerprint: string | null;
    }>(
      `SELECT 'organization' AS entity_type, id, slug AS natural_key,
              id AS organization_id, NULL::uuid AS parent_id,
              jsonb_build_object('name', name, 'status', status, 'default_locale', default_locale) AS fields,
              NULL::text AS credential_fingerprint
       FROM organizations WHERE id IN ($1, $2)
       UNION ALL
       SELECT 'application', id, slug, NULL::uuid, NULL::uuid,
              jsonb_build_object('name', name, 'description', description), NULL::text
       FROM applications WHERE id IN ($3, $4)
       UNION ALL
       SELECT 'user', id, email, organization_id, NULL::uuid,
              jsonb_build_object('email', email, 'status', status, 'given_name', given_name,
                                 'family_name', family_name, 'locale', locale), NULL::text
       FROM users WHERE organization_id IN ($1, $2)
       UNION ALL
       SELECT 'client', c.id, c.client_name, c.organization_id, c.application_id,
              jsonb_build_object('client_name', c.client_name, 'client_type', c.client_type,
                                 'status', c.status),
              encode(digest(COALESCE(string_agg(s.secret_hash, ',' ORDER BY s.id), ''), 'sha256'), 'hex')
       FROM clients c LEFT JOIN client_secrets s ON s.client_id = c.id
       WHERE c.organization_id IN ($1, $2)
       GROUP BY c.id`,
      [
        fixture.alphaOrganizationId,
        fixture.bravoOrganizationId,
        fixture.alphaApplicationId,
        fixture.bravoApplicationId,
      ],
    );
    return rows.rows
      .map((row) => ({
        entityType: row.entity_type,
        id: row.id,
        naturalKey: row.natural_key,
        organizationId: row.organization_id,
        parentId: row.parent_id,
        fields: jsonObject(row.fields),
        credentialFingerprint: row.credential_fingerprint,
      }))
      .sort((left, right) =>
        `${left.entityType}:${left.id}`.localeCompare(`${right.entityType}:${right.id}`),
      );
  }

  /** Observe only privacy-safe administrative audit summaries. */
  private async observeAudits(): Promise<AdministrativeAuditObservation[]> {
    const result = await getPool().query<{
      event_type: string;
      actor_id: string | null;
      metadata: Record<string, unknown>;
    }>(
      `SELECT event_type, actor_id, metadata FROM audit_log
       WHERE event_type LIKE 'admin.bulk.%' OR event_type = 'admin.import'
       ORDER BY created_at, id`,
    );
    return result.rows.map((row) => {
      const metadata = row.metadata;
      const counts: Record<string, number> = {};
      for (const key of ['created', 'updated', 'skipped']) {
        const value = metadata[key];
        if (typeof value === 'number') counts[key] = value;
      }
      return {
        eventType: row.event_type,
        actorId: row.actor_id ?? '',
        mode: typeof metadata.mode === 'string' ? metadata.mode : null,
        manifestVersion:
          typeof metadata.manifestVersion === 'string' ? metadata.manifestVersion : null,
        manifestDigest:
          typeof metadata.manifestDigest === 'string' ? metadata.manifestDigest : null,
        aggregateCounts: counts,
        contentValues: [],
      };
    });
  }

  /** Install one test-owned trigger which fails at a precise durable mutation boundary. */
  private async installFailureTrigger(
    table: 'clients' | 'users',
    column: 'client_name' | 'id',
    value: string,
    label: string,
  ): Promise<void> {
    const suffix = randomUUID().replaceAll('-', '');
    const functionName = `assurance_${label}_${suffix}`;
    const triggerName = `${functionName}_trigger`;
    await getPool().query(
      `CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         IF NEW.${column}::text = '${value.replaceAll("'", "''")}' THEN
           RAISE EXCEPTION '${DEPENDENCY_ERROR_CANARY}';
         END IF;
         RETURN NEW;
       END $$`,
    );
    await getPool().query(
      `CREATE TRIGGER ${triggerName} BEFORE INSERT OR UPDATE ON ${table}
       FOR EACH ROW EXECUTE FUNCTION ${functionName}()`,
    );
    this.triggerNames.push(`${table}:${triggerName}:${functionName}`);
  }

  /** Drop all test-owned triggers and functions after the observation completes. */
  private async dropFaultTriggers(): Promise<void> {
    for (const identity of this.triggerNames.splice(0)) {
      const [table, trigger, functionName] = identity.split(':');
      if (!table || !trigger || !functionName) continue;
      await getPool().query(`DROP TRIGGER IF EXISTS ${trigger} ON ${table}`);
      await getPool().query(`DROP FUNCTION IF EXISTS ${functionName}()`);
    }
  }

  /** Return the current fixture or fail before touching shared persistence. */
  private requireFixture(): AdministrativeDataFixture {
    if (!this.fixture) throw new Error('Administrative data fixture is not initialized');
    return this.fixture;
  }
}
