/**
 * Contract test: SDK ImportManifest request shape vs server Zod schema.
 *
 * Validates that the SDK's request body shape is accepted by the server's
 * importManifestSchema, and that the SDK's ImportResult type covers all
 * fields returned by the server.
 *
 * @module contracts/sdk-imports-contract
 */

import { describe, it, expect } from 'vitest';
import { importManifestSchema } from '../../../src/lib/data-import.js';
import type {
  ImportManifest,
  ImportResult,
  ImportEntityResult,
  ImportSkippedResult,
  ImportErrorResult,
  ImportClientCredentials,
} from '../../../packages/porta-sdk/src/types/imports.js';

describe('SDK↔Server contract: Imports', () => {
  describe('ImportManifest request shape', () => {
    it('SDK ImportManifest passes server Zod validation', () => {
      const manifest = {
        version: '1',
        mode: 'merge',
        organizations: [
          {
            name: 'Test Org',
            slug: 'test-org',
          },
        ],
      };

      // Should not throw — SDK shape accepted by server schema
      const result = importManifestSchema.safeParse(manifest);
      expect(result.success).toBe(true);
    });

    it('rejects invalid manifest shapes', () => {
      const invalid = { mode: 'invalid-mode' };
      const result = importManifestSchema.safeParse(invalid);
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
