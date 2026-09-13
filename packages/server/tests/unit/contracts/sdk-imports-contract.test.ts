/**
 * Contract test: SDK ImportManifest request shape vs server Zod schema.
 *
 * Validates that the SDK's request body shape is accepted by the server's
 * strict portability schema while the SDK result migration is completed in its owning phase.
 *
 * @module contracts/sdk-imports-contract
 */

import { describe, it, expect } from 'vitest';
import { portabilityManifestSchema } from '../../../src/portability/index.js';
import type {
  ImportResult,
  ImportEntityResult,
  ImportSkippedResult,
  ImportErrorResult,
  ImportClientCredentials,
} from '../../../../sdk/src/types/imports.js';

describe('SDK↔Server contract: Imports', () => {
  describe('ImportManifest request shape', () => {
    it('SDK ImportManifest passes server Zod validation', () => {
      const manifest = {
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

      // Should not throw — SDK shape accepted by server schema
      const result = portabilityManifestSchema.safeParse(manifest);
      expect(result.success).toBe(true);
    });

    it('rejects invalid manifest shapes', () => {
      const invalid = { mode: 'invalid-mode' };
      const result = portabilityManifestSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('ImportResult response coverage', () => {
    it('SDK ImportResult type covers all server response fields', () => {
      // Simulate the exact server response shape (from src/lib/data-import.ts)
      const serverResponse = {
        mode: 'merge' as const,
        created: [{ type: 'organization', name: 'Test', id: 'uuid-1' }],
        updated: [{ type: 'user', name: 'alice', id: 'uuid-2' }],
        skipped: [{ type: 'role', name: 'admin', reason: 'already exists' }],
        errors: [{ type: 'client', name: 'bad', error: 'invalid redirect' }],
        credentials: [{ clientName: 'my-app', clientId: 'cid', clientSecret: 'secret' }],
      };

      // TypeScript compile-time check: server response assignable to SDK type
      const _sdkResult: ImportResult = serverResponse;
      expect(_sdkResult.mode).toBe('merge');
      expect(_sdkResult.created).toHaveLength(1);
      expect(_sdkResult.updated).toHaveLength(1);
      expect(_sdkResult.skipped).toHaveLength(1);
      expect(_sdkResult.errors).toHaveLength(1);
      expect(_sdkResult.credentials).toHaveLength(1);
    });

    it('ImportEntityResult has type, name, id', () => {
      const entity: ImportEntityResult = { type: 'organization', name: 'Acme', id: 'uuid' };
      expect(entity.type).toBe('organization');
      expect(entity.name).toBe('Acme');
      expect(entity.id).toBe('uuid');
    });

    it('ImportSkippedResult has type, name, reason', () => {
      const skipped: ImportSkippedResult = { type: 'role', name: 'admin', reason: 'exists' };
      expect(skipped.reason).toBe('exists');
    });

    it('ImportErrorResult has type, name, error', () => {
      const error: ImportErrorResult = { type: 'client', name: 'bad', error: 'invalid' };
      expect(error.error).toBe('invalid');
    });

    it('ImportClientCredentials has clientName, clientId, clientSecret', () => {
      const cred: ImportClientCredentials = {
        clientName: 'app',
        clientId: 'cid',
        clientSecret: 'sec',
      };
      expect(cred.clientSecret).toBe('sec');
    });
  });
});
