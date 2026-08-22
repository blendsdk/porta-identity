import { describe, expect, it } from 'vitest';
import { getAdministrativeDataCapability } from './administrative-data-adapter.js';
import {
  ADMINISTRATIVE_DATA_CAPABILITY_MISSING,
  ADMINISTRATIVE_DATA_ORACLE,
  type AdministrativeDataFixture,
  type AdministrativeDataObservation,
  type AdministrativeDataSpecDriver,
  type ExportEntityType,
  type JsonObject,
  type JsonValue,
} from './administrative-data-contract.js';

const capability = getAdministrativeDataCapability();
const capabilityRequired = process.env.PORTA_ADMINISTRATIVE_DATA_SPEC_REQUIRED === '1';

/** Execute behavior against one isolated product-backed driver. */
async function withDriver(
  behavior: (driver: AdministrativeDataSpecDriver) => Promise<void>,
): Promise<void> {
  if (!capability.available) {
    throw new Error(ADMINISTRATIVE_DATA_CAPABILITY_MISSING);
  }
  const driver = await capability.createDriver();
  try {
    await behavior(driver);
  } finally {
    await driver.dispose();
  }
}

/** Find one independently observed entity by its opaque identifier. */
function entityById(observation: AdministrativeDataObservation, id: string) {
  const entity = observation.entities.find((candidate) => candidate.id === id);
  expect(entity, `owned entity ${id} should be observable`).toBeDefined();
  return entity;
}

/** Create the smallest valid confidential-client manifest for an arranged tenant. */
function clientManifest(
  fixture: AdministrativeDataFixture,
  clientNames: readonly string[],
): JsonObject {
  return {
    version: ADMINISTRATIVE_DATA_ORACLE.import.manifestVersion,
    clients: clientNames.map((clientName) => ({
      client_name: clientName,
      application_slug: fixture.alphaApplicationSlug,
      organization_slug: fixture.alphaOrganizationSlug,
      client_type: 'confidential',
    })),
  };
}

/** Return the complete authority needed for one export entity. */
function exportPermissions(entityType: ExportEntityType): readonly string[] {
  return [
    ADMINISTRATIVE_DATA_ORACLE.export.dedicatedPermission,
    ADMINISTRATIVE_DATA_ORACLE.export.entityPermissions[entityType],
  ];
}

/** Build the exact scope required by each supported export entity. */
function exportScope(entityType: ExportEntityType, fixture: AdministrativeDataFixture) {
  if (entityType === 'organizations') return {};
  if (entityType === 'roles') {
    return {
      organizationId: fixture.alphaOrganizationId,
      applicationId: fixture.alphaApplicationId,
    };
  }
  if (entityType === 'audit') {
    return {
      organizationId: fixture.alphaOrganizationId,
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-31T23:59:59.999Z',
    };
  }
  return { organizationId: fixture.alphaOrganizationId };
}

/** Serialize all public and operational surfaces searched for protected values. */
function serializedSurfaces(...values: readonly unknown[]): string {
  return values.map((value) => JSON.stringify(value)).join('\n');
}

describe('administrative data requirement catalog', () => {
  // Bulk validation is whole-request atomic while admitted results remain ordered and partial.
  it('should freeze the compatibility-preserving bulk contract', () => {
    expect(ADMINISTRATIVE_DATA_ORACLE.bulk).toStrictEqual({
      maximumItems: 100,
      maximumReasonCharacters: 500,
      actions: {
        organization: ['activate', 'suspend', 'archive'],
        user: ['activate', 'deactivate', 'suspend', 'lock', 'unlock'],
      },
      envelopeFields: ['total', 'succeeded', 'failed', 'results'],
      concealedItemCode: 'not_found_or_not_authorized',
      stoppedItemCode: 'not_attempted',
    });
  });

  // Import accepts one version and limits overwrite to non-authority presentation fields.
  it('should freeze import modes, forbidden secrets, and overwrite fields', () => {
    expect(ADMINISTRATIVE_DATA_ORACLE.import.manifestVersion).toBe('1.0');
    expect(ADMINISTRATIVE_DATA_ORACLE.import.modes).toStrictEqual([
      'merge',
      'overwrite',
      'dry-run',
    ]);
    expect(ADMINISTRATIVE_DATA_ORACLE.import.prohibitedFieldNames).toContain('password_hash');
    expect(ADMINISTRATIVE_DATA_ORACLE.import.prohibitedFieldNames).toContain('client_secret');
    expect(ADMINISTRATIVE_DATA_ORACLE.import.prohibitedFieldNames).toContain('totp_secret');
    expect(ADMINISTRATIVE_DATA_ORACLE.import.mutableFields.client).toStrictEqual(['client_name']);
    expect(ADMINISTRATIVE_DATA_ORACLE.import.mutableFields.user).toStrictEqual([
      'given_name',
      'family_name',
      'locale',
    ]);
  });

  // Export is a closed, dual-authority, bounded, serialization-safe surface.
  it('should freeze export entities, dual authority, fields, bounds, and neutralization', () => {
    expect(ADMINISTRATIVE_DATA_ORACLE.export.entities).toStrictEqual([
      'organizations',
      'users',
      'clients',
      'roles',
      'audit',
    ]);
    expect(ADMINISTRATIVE_DATA_ORACLE.export.dedicatedPermission).toBe('admin:export:read');
    expect(ADMINISTRATIVE_DATA_ORACLE.export.maximumRows).toBe(10_000);
    expect(ADMINISTRATIVE_DATA_ORACLE.export.overflowCode).toBe('export_too_large');
    expect(ADMINISTRATIVE_DATA_ORACLE.export.formulaPrefixes).toStrictEqual(['=', '+', '-', '@']);
    expect(ADMINISTRATIVE_DATA_ORACLE.export.fieldAllowlists.audit).toStrictEqual([
      'id',
      'event_type',
      'event_category',
      'actor_id',
      'created_at',
      'safe_details',
    ]);
  });

  // Behavioral credit requires real public actions and independent side-effect observers.
  it('should fail closed only when product-backed observations are required', () => {
    if (capabilityRequired && !capability.available) {
      throw new Error(ADMINISTRATIVE_DATA_CAPABILITY_MISSING);
    }
    expect(capability.available || !capabilityRequired).toBe(true);
  });
});

if (capability.available) {
  describe('bulk administrative behavior', () => {
    // Invalid IDs, action, reason, or tenant scope reject before state and audit effects.
    it.each([
      [
        'duplicate identifiers',
        (fixture: AdministrativeDataFixture) => ({
          ids: [fixture.alphaUserIds[0], fixture.alphaUserIds[0]],
          action: 'deactivate',
          organizationId: fixture.alphaOrganizationId,
        }),
      ],
      [
        'invalid action',
        (fixture: AdministrativeDataFixture) => ({
          ids: [fixture.alphaUserIds[0]],
          action: 'destroy',
          organizationId: fixture.alphaOrganizationId,
        }),
      ],
      [
        'oversized reason',
        (fixture: AdministrativeDataFixture) => ({
          ids: [fixture.alphaUserIds[0]],
          action: 'deactivate',
          reason: 'r'.repeat(ADMINISTRATIVE_DATA_ORACLE.bulk.maximumReasonCharacters + 1),
          organizationId: fixture.alphaOrganizationId,
        }),
      ],
      [
        'missing tenant scope',
        (fixture: AdministrativeDataFixture) => ({
          ids: [fixture.alphaUserIds[0]],
          action: 'deactivate',
        }),
      ],
    ] as const)(
      'should reject %s for the whole request before mutation or audit',
      async (_label, requestFor) => {
        await withDriver(async (driver) => {
          const fixture = await driver.reset();
          const before = await driver.observe();
          const outcome = await driver.submitBulk('user', requestFor(fixture));

          expect(outcome.accepted).toBe(false);
          expect(outcome.results).toStrictEqual([]);
          expect(await driver.observe()).toStrictEqual(before);
        });
      },
    );

    // Missing and foreign users are indistinguishable while authorized users commit in order.
    it('should preserve ordered tenant-safe partial results with independent commits', async () => {
      await withDriver(async (driver) => {
        const fixture = await driver.reset();
        const before = await driver.observe();
        const ids = [
          fixture.alphaUserIds[0],
          fixture.missingUserId,
          fixture.bravoUserId,
          fixture.alphaUserIds[1],
        ];

        const outcome = await driver.submitBulk('user', {
          ids,
          action: 'deactivate',
          organizationId: fixture.alphaOrganizationId,
        });

        expect(outcome.accepted).toBe(true);
        expect(outcome.responseFields).toStrictEqual(
          ADMINISTRATIVE_DATA_ORACLE.bulk.envelopeFields,
        );
        expect(outcome.results.map((result) => result.id)).toStrictEqual(ids);
        expect(outcome.results.map((result) => result.code)).toStrictEqual([
          null,
          ADMINISTRATIVE_DATA_ORACLE.bulk.concealedItemCode,
          ADMINISTRATIVE_DATA_ORACLE.bulk.concealedItemCode,
          null,
        ]);
        expect(outcome).toMatchObject({ total: 4, succeeded: 2, failed: 2 });

        const after = await driver.observe();
        expect(entityById(after, fixture.bravoUserId)).toStrictEqual(
          entityById(before, fixture.bravoUserId),
        );
        expect(entityById(after, fixture.alphaUserIds[0])).not.toStrictEqual(
          entityById(before, fixture.alphaUserIds[0]),
        );
        expect(entityById(after, fixture.alphaUserIds[1])).not.toStrictEqual(
          entityById(before, fixture.alphaUserIds[1]),
        );
        expect(after.audits).toHaveLength(before.audits.length + 2);
      });
    });

    // Dependency loss preserves earlier commits and stops every remaining item.
    it('should stop after infrastructure failure and report committed and unattempted rows truthfully', async () => {
      await withDriver(async (driver) => {
        const fixture = await driver.reset();
        const before = await driver.observe();
        await driver.failBulkDependencyAfter(1);
        const ids = [fixture.alphaUserIds[0], fixture.alphaUserIds[1], fixture.missingUserId];

        const outcome = await driver.submitBulk('user', {
          ids,
          action: 'deactivate',
          organizationId: fixture.alphaOrganizationId,
        });

        expect(outcome.results.map((result) => result.code)).toStrictEqual([
          null,
          ADMINISTRATIVE_DATA_ORACLE.bulk.stoppedItemCode,
          ADMINISTRATIVE_DATA_ORACLE.bulk.stoppedItemCode,
        ]);
        expect(outcome.correlationId).toMatch(/^[0-9a-f-]{36}$/i);
        expect(serializedSurfaces(outcome)).not.toContain(fixture.dependencyErrorCanary);
        const after = await driver.observe();
        expect(entityById(after, fixture.alphaUserIds[0])).not.toStrictEqual(
          entityById(before, fixture.alphaUserIds[0]),
        );
        expect(entityById(after, fixture.alphaUserIds[1])).toStrictEqual(
          entityById(before, fixture.alphaUserIds[1]),
        );
      });
    });
  });

  describe('administrative import behavior', () => {
    // Merge skips an existing tenant-qualified key unchanged and creates the missing key.
    it('should merge by tenant-qualified natural key without changing existing rows', async () => {
      await withDriver(async (driver) => {
        const fixture = await driver.reset();
        const before = await driver.observe();
        const existingBefore = before.entities.find(
          (entity) => entity.naturalKey === fixture.existingClientNaturalKey,
        );
        const outcome = await driver.submitImport(
          'merge',
          clientManifest(fixture, [fixture.existingClientNaturalKey, fixture.newClientNaturalKey]),
          { organizationId: fixture.alphaOrganizationId },
        );

        expect(outcome.accepted).toBe(true);
        expect(outcome.skipped.map((item) => item.naturalKey)).toContain(
          fixture.existingClientNaturalKey,
        );
        expect(outcome.created.map((item) => item.naturalKey)).toContain(
          fixture.newClientNaturalKey,
        );
        expect(outcome.errors).toBeUndefined();
        const after = await driver.observe();
        expect(
          after.entities.find((entity) => entity.naturalKey === fixture.existingClientNaturalKey),
        ).toStrictEqual(existingBefore);
        expect(outcome.credentials).toHaveLength(1);
        const credential = outcome.credentials[0];
        expect(typeof credential.secretPlaintext).toBe('string');
        const secret = String(credential.secretPlaintext);
        expect(serializedSurfaces(outcome).split(secret)).toHaveLength(2);
        expect(serializedSurfaces(after.operationalOutput)).not.toContain(secret);
        expect(after.audits.at(-1)).toMatchObject({
          actorId: fixture.actorId,
          mode: 'merge',
          manifestVersion: ADMINISTRATIVE_DATA_ORACLE.import.manifestVersion,
          contentValues: [],
        });
        expect(after.audits.at(-1)?.manifestDigest).toMatch(/^[a-f0-9]{64}$/);
      });
    });

    // Overwrite may change only presentation/configuration and never moves authority or identity.
    it('should overwrite only presentation fields and reject credential-equivalent input', async () => {
      await withDriver(async (driver) => {
        const fixture = await driver.reset();
        const manifest = clientManifest(fixture, [fixture.existingClientNaturalKey]);
        const validManifest = {
          ...manifest,
          clients: [
            {
              client_name: fixture.existingClientNaturalKey,
              application_slug: fixture.alphaApplicationSlug,
              organization_slug: fixture.alphaOrganizationSlug,
              client_type: 'confidential',
            },
          ],
        };
        const outcome = await driver.submitImport('overwrite', validManifest, {
          organizationId: fixture.alphaOrganizationId,
        });
        expect(outcome.accepted).toBe(true);
        for (const update of outcome.updated) {
          expect(
            update.changedFields.every((field) =>
              ADMINISTRATIVE_DATA_ORACLE.import.mutableFields[update.entityType]?.includes(field),
            ),
          ).toBe(true);
        }

        const beforeImmutableAttempt = await driver.observe();
        const immutableChanges: readonly Record<string, JsonValue>[] = [
          { id: fixture.bravoApplicationId },
          { organization_slug: fixture.bravoOrganizationSlug },
          { application_slug: fixture.bravoApplicationSlug },
          { client_type: 'public' },
        ];
        for (const immutableChange of immutableChanges) {
          const prohibited = {
            ...validManifest,
            clients: [{ ...validManifest.clients[0], ...immutableChange }],
          };
          expect(
            (
              await driver.submitImport('overwrite', prohibited, {
                organizationId: fixture.alphaOrganizationId,
              })
            ).accepted,
          ).toBe(false);
          expect(await driver.observe()).toStrictEqual(beforeImmutableAttempt);
        }
      });
    });

    // Every credential-equivalent field rejects before mutation, audit, or disclosure.
    it.each(ADMINISTRATIVE_DATA_ORACLE.import.prohibitedFieldNames)(
      'should reject prohibited import field %s before mutation',
      async (fieldName) => {
        await withDriver(async (driver) => {
          const fixture = await driver.reset();
          const before = await driver.observe();
          const manifest = clientManifest(fixture, [fixture.newClientNaturalKey]);
          const outcome = await driver.submitImport(
            'overwrite',
            {
              ...manifest,
              [fieldName]: fixture.secretCanary,
            },
            { organizationId: fixture.alphaOrganizationId },
          );

          expect(outcome.accepted).toBe(false);
          expect(serializedSurfaces(outcome)).not.toContain(fixture.secretCanary);
          expect(await driver.observe()).toStrictEqual(before);
        });
      },
    );

    // Dry-run executes the same planner without identifiers, credentials, or side effects.
    it('should dry-run create, update, and skip plans without any durable or secret effect', async () => {
      await withDriver(async (driver) => {
        const fixture = await driver.reset();
        const before = await driver.observe();
        const outcome = await driver.submitImport(
          'dry-run',
          {
            ...clientManifest(fixture, [
              fixture.existingClientNaturalKey,
              fixture.newClientNaturalKey,
            ]),
            organizations: [
              {
                name: `${fixture.alphaOrganizationName} Updated`,
                slug: fixture.alphaOrganizationSlug,
              },
            ],
          },
          { organizationId: fixture.alphaOrganizationId },
        );

        expect(outcome.accepted).toBe(true);
        expect(outcome.errors).toBeUndefined();
        expect(outcome.created.length).toBeGreaterThan(0);
        expect(outcome.updated.length).toBeGreaterThan(0);
        expect(outcome.skipped.length).toBeGreaterThan(0);
        expect(
          outcome.credentials.every((credential) =>
            Object.hasOwn(credential, ADMINISTRATIVE_DATA_ORACLE.import.dryRunCredentialField),
          ),
        ).toBe(true);
        expect(serializedSurfaces(outcome)).not.toContain('secretPlaintext');
        expect(outcome.created.every((item) => item.publicIdentifier === undefined)).toBe(true);
        expect(await driver.observe()).toStrictEqual(before);
      });
    });

    // Every non-skip planning or runtime failure rejects or rolls back the complete manifest.
    it('should reject every planning or execution error atomically without disclosure', async () => {
      await withDriver(async (driver) => {
        const fixture = await driver.reset();
        const valid = clientManifest(fixture, [fixture.newClientNaturalKey]);
        await driver.arrangeImportCollision('collision-client');
        const invalidManifests: readonly JsonValue[] = [
          { ...valid, version: '0.9' },
          { ...valid, unknown_field: true },
          clientManifest(fixture, [fixture.newClientNaturalKey, fixture.newClientNaturalKey]),
          {
            ...valid,
            clients: [
              {
                client_name: fixture.newClientNaturalKey,
                application_slug: 'missing-parent',
                organization_slug: fixture.alphaOrganizationSlug,
                client_type: 'confidential',
              },
            ],
          },
          {
            ...valid,
            role_permission_mappings: [
              {
                role_slug: 'missing-role',
                permission_slugs: ['missing-permission'],
                application_slug: fixture.alphaApplicationSlug,
                organization_slug: fixture.alphaOrganizationSlug,
              },
            ],
          },
          clientManifest(fixture, ['collision-client']),
        ];

        for (const manifest of invalidManifests) {
          const before = await driver.observe();
          const outcome = await driver.submitImport('merge', manifest, {
            organizationId: fixture.alphaOrganizationId,
          });
          expect(outcome.accepted).toBe(false);
          expect(serializedSurfaces(outcome)).not.toContain(fixture.secretCanary);
          expect(await driver.observe()).toStrictEqual(before);
        }

        const foreignBefore = await driver.observe();
        const foreign = await driver.submitImport(
          'merge',
          {
            version: ADMINISTRATIVE_DATA_ORACLE.import.manifestVersion,
            clients: [
              {
                client_name: fixture.newClientNaturalKey,
                application_slug: fixture.bravoApplicationSlug,
                organization_slug: fixture.bravoOrganizationSlug,
                client_type: 'confidential',
              },
            ],
          },
          { organizationId: fixture.alphaOrganizationId },
        );
        expect(foreign.accepted).toBe(false);
        expect(await driver.observe()).toStrictEqual(foreignBefore);

        await driver.failImportAt(fixture.newClientNaturalKey);
        const runtimeBefore = await driver.observe();
        const runtime = await driver.submitImport('merge', valid, {
          organizationId: fixture.alphaOrganizationId,
        });
        expect(runtime.accepted).toBe(false);
        expect(serializedSurfaces(runtime)).not.toContain(fixture.dependencyErrorCanary);
        expect(await driver.observe()).toStrictEqual(runtimeBefore);
      });
    });
  });

  describe('administrative export behavior', () => {
    // Each entity requires dedicated export and read authority at its exact relationship scope.
    it.each(ADMINISTRATIVE_DATA_ORACLE.export.entities)(
      'should export allowlisted %s fields only under exact authority and scope',
      async (entityType) => {
        await withDriver(async (driver) => {
          const fixture = await driver.reset();
          const outcome = await driver.submitExport({
            entityType,
            format: 'json',
            permissions: exportPermissions(entityType),
            ...exportScope(entityType, fixture),
          });

          expect(outcome.accepted).toBe(true);
          expect(outcome.rowCount).toBe(outcome.rows.length);
          for (const row of outcome.rows) {
            expect(Object.keys(row).sort()).toStrictEqual(
              [...ADMINISTRATIVE_DATA_ORACLE.export.fieldAllowlists[entityType]].sort(),
            );
          }
          if (entityType !== 'organizations') {
            expect(outcome.sourceOrganizationIds).toStrictEqual([fixture.alphaOrganizationId]);
          }
          if (entityType === 'roles') {
            expect(outcome.sourceApplicationIds).toStrictEqual([fixture.alphaApplicationId]);
          }
          if (entityType === 'audit') {
            expect(serializedSurfaces(outcome.rows)).not.toMatch(
              /metadata|ip_address|user_agent|description|body|error/,
            );
          }
        });
      },
    );

    // Authorization and relationship failure reveals no count, rows, body, or foreign identity.
    it('should reject missing authority and foreign tenant or application scope without disclosure', async () => {
      await withDriver(async (driver) => {
        const fixture = await driver.reset();
        const attempts = [
          driver.submitExport({
            entityType: 'users',
            format: 'json',
            permissions: ['user:read'],
            organizationId: fixture.alphaOrganizationId,
          }),
          driver.submitExport({
            entityType: 'users',
            format: 'json',
            permissions: [ADMINISTRATIVE_DATA_ORACLE.export.dedicatedPermission],
            organizationId: fixture.alphaOrganizationId,
          }),
          driver.submitExport({
            entityType: 'users',
            format: 'json',
            permissions: exportPermissions('users'),
            organizationId: fixture.bravoOrganizationId,
          }),
          driver.submitExport({
            entityType: 'roles',
            format: 'json',
            permissions: exportPermissions('roles'),
            organizationId: fixture.alphaOrganizationId,
            applicationId: fixture.bravoApplicationId,
          }),
        ];

        for (const attempt of attempts) {
          const outcome = await attempt;
          expect(outcome).toMatchObject({
            accepted: false,
            rowCount: null,
            rows: [],
            responseBodyPresent: false,
          });
        }
      });
    });

    // The query probes one row beyond the public maximum and never truncates a response.
    it('should reject 10001 rows without a partial body or truncation', async () => {
      await withDriver(async (driver) => {
        const fixture = await driver.reset();
        await driver.arrangeExportRows('users', ADMINISTRATIVE_DATA_ORACLE.export.maximumRows + 1);
        const outcome = await driver.submitExport({
          entityType: 'users',
          format: 'json',
          permissions: exportPermissions('users'),
          organizationId: fixture.alphaOrganizationId,
        });
        expect(outcome).toMatchObject({
          accepted: false,
          code: ADMINISTRATIVE_DATA_ORACLE.export.overflowCode,
          rowCount: null,
          rows: [],
          responseBodyPresent: false,
        });
      });
    });

    // Spreadsheet formulas and private audit content stay absent after serialization and logging.
    it('should neutralize CSV formulas and exclude private audit material from every surface', async () => {
      await withDriver(async (driver) => {
        const fixture = await driver.reset();
        await driver.arrangeExportSafetyCanaries();
        const usersCsv = await driver.submitExport({
          entityType: 'users',
          format: 'csv',
          permissions: exportPermissions('users'),
          organizationId: fixture.alphaOrganizationId,
        });
        expect(usersCsv.accepted).toBe(true);
        for (const canary of fixture.formulaCanaries) {
          expect(usersCsv.csv).toContain(canary.trim());
        }
        for (const cell of usersCsv.csvCells) {
          const firstNonWhitespace = cell.trimStart().charAt(0);
          expect(ADMINISTRATIVE_DATA_ORACLE.export.formulaPrefixes).not.toContain(
            firstNonWhitespace,
          );
        }

        const auditCsv = await driver.submitExport({
          entityType: 'audit',
          format: 'csv',
          permissions: exportPermissions('audit'),
          organizationId: fixture.alphaOrganizationId,
          startDate: '2026-01-01T00:00:00.000Z',
          endDate: '2026-01-31T23:59:59.999Z',
        });
        const auditJson = await driver.submitExport({
          entityType: 'audit',
          format: 'json',
          permissions: exportPermissions('audit'),
          organizationId: fixture.alphaOrganizationId,
          startDate: '2026-01-01T00:00:00.000Z',
          endDate: '2026-01-31T23:59:59.999Z',
        });
        const observation = await driver.observe();
        const retained = serializedSurfaces(auditCsv, auditJson, observation);
        expect(retained).not.toContain(fixture.auditPrivateCanary);
        for (const field of ADMINISTRATIVE_DATA_ORACLE.export.forbiddenAuditFields) {
          expect(retained).not.toContain(`"${field}"`);
        }
      });
    });
  });
}
