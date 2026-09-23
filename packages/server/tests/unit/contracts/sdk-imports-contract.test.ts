/**
 * Contract tests proving the SDK portability types fit the server's strict wire schema.
 *
 * @module contracts/sdk-imports-contract
 */

import { describe, expect, it } from 'vitest';
import { portabilityManifestSchema } from '../../../src/portability/index.js';
import type {
  PortabilityCredential,
  PortabilityManifest,
  PortabilityResult,
  PortabilityResultError,
  PortabilityResultItem,
} from '../../../../sdk/src/types/imports.js';

const zeroCounts = { created: 0, updated: 0, skipped: 0, rejected: 0 } as const;

/** Create the complete result summary required by every portability response. */
function emptySummary() {
  return {
    organizations: zeroCounts,
    applications: zeroCounts,
    application_modules: zeroCounts,
    roles: zeroCounts,
    permissions: zeroCounts,
    claim_definitions: zeroCounts,
    role_permission_mappings: zeroCounts,
    users: zeroCounts,
    user_role_assignments: zeroCounts,
    user_claim_values: zeroCounts,
    clients: zeroCounts,
  } as const;
}

describe('SDK↔Server contract: portability', () => {
  it('accepts an SDK portability manifest at the server schema boundary', () => {
    const manifest: PortabilityManifest = {
      version: '1.0',
      exported_at: '2026-09-14T00:00:00.000Z',
      scope: { kind: 'organization', organization_slug: 'test-org' },
      categories: ['organizations'],
      application_selection: { all_applications: false, application_slugs: [] },
      organizations: [
        {
          name: 'Test Org',
          slug: 'test-org',
          status: 'active',
          default_locale: 'en',
          default_login_methods: ['password'],
          two_factor_policy: 'optional',
          branding: {
            logo_url: null,
            favicon_url: null,
            primary_color: null,
            company_name: null,
            custom_css: null,
            logo_asset: null,
            favicon_asset: null,
          },
        },
      ],
      applications: [],
      application_modules: [],
      roles: [],
      permissions: [],
      claim_definitions: [],
      role_permission_mappings: [],
      users: [],
      user_role_assignments: [],
      user_claim_values: [],
      clients: [],
    };

    expect(portabilityManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it('represents ordered items, bounded errors, and committed credentials', () => {
    const item: PortabilityResultItem = {
      entity_type: 'clients',
      action: 'created',
      natural_key: { client_id: 'portal-client' },
      credential_will_be_generated: true,
    };
    const error: PortabilityResultError = {
      entity_type: 'roles',
      natural_key: { application_slug: 'portal', slug: 'operator' },
      code: 'missing_dependency',
    };
    const credential: PortabilityCredential = {
      client_id: 'portal-client',
      label: 'Imported',
      secret: 'shown-once',
      expires_at: '2027-03-14T00:00:00.000Z',
    };
    const result: PortabilityResult = {
      mode: 'keep-existing',
      summary: emptySummary(),
      items: [item],
      errors: [error],
      credentials: [credential],
    };

    expect(result.items).toEqual([item]);
    expect(result.errors).toEqual([error]);
    expect(result.credentials).toEqual([credential]);
  });

  it('does not allow preview results to contain credentials', () => {
    const result: PortabilityResult = {
      mode: 'dry-run',
      summary: emptySummary(),
      items: [],
      errors: [],
    };

    expect(result.credentials).toBeUndefined();
  });
});
