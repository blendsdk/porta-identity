/**
 * Contract test: SDK Bulk request shapes vs server Zod schemas.
 *
 * Validates that the SDK's request body shapes are accepted by the
 * server's bulkOrgStatusSchema and bulkUserStatusSchema.
 *
 * @module contracts/sdk-bulk-contract
 */

import { describe, it, expect } from 'vitest';
import { bulkOrgStatusSchema, bulkUserStatusSchema } from '../../../src/routes/bulk.js';
import type {
  BulkOrgStatusInput,
  BulkUserStatusInput,
  BulkOperationResult,
  BulkItemResult,
} from '../../../packages/porta-sdk/src/types/bulk.js';

describe('SDK↔Server contract: Bulk Operations', () => {
  describe('BulkOrgStatusInput request shape', () => {
    it('SDK shape passes server Zod validation', () => {
      const input: BulkOrgStatusInput = {
        ids: ['550e8400-e29b-41d4-a716-446655440000'],
        action: 'suspend',
        reason: 'Compliance review',
      };

      const result = bulkOrgStatusSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('supports all org actions', () => {
      for (const action of ['activate', 'suspend', 'archive'] as const) {
        const input: BulkOrgStatusInput = {
          ids: ['550e8400-e29b-41d4-a716-446655440000'],
          action,
        };
        const result = bulkOrgStatusSchema.safeParse(input);
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid org actions', () => {
      const invalid = {
        ids: ['550e8400-e29b-41d4-a716-446655440000'],
        action: 'delete',
      };
      const result = bulkOrgStatusSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('BulkUserStatusInput request shape', () => {
    it('SDK shape passes server Zod validation', () => {
      const input: BulkUserStatusInput = {
        ids: ['550e8400-e29b-41d4-a716-446655440000'],
        action: 'suspend',
        organizationId: '660e8400-e29b-41d4-a716-446655440000',
      };

      const result = bulkUserStatusSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('supports all user actions', () => {
      for (const action of ['activate', 'deactivate', 'suspend', 'lock', 'unlock'] as const) {
        const input: BulkUserStatusInput = {
          ids: ['550e8400-e29b-41d4-a716-446655440000'],
          action,
          organizationId: '660e8400-e29b-41d4-a716-446655440000',
        };
        const result = bulkUserStatusSchema.safeParse(input);
        expect(result.success).toBe(true);
      }
    });

    it('requires organizationId for user bulk', () => {
      const invalid = {
        ids: ['550e8400-e29b-41d4-a716-446655440000'],
        action: 'suspend',
        // missing organizationId
      };
      const result = bulkUserStatusSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('BulkOperationResult response coverage', () => {
    it('SDK type covers server response shape', () => {
      const serverResponse = {
        total: 2,
        succeeded: 1,
        failed: 1,
        results: [
          { id: 'uuid-1', success: true },
          { id: 'uuid-2', success: false, error: 'Not found' },
        ],
      };

      const _sdkResult: BulkOperationResult = serverResponse;
      expect(_sdkResult.total).toBe(2);
      expect(_sdkResult.succeeded).toBe(1);
      expect(_sdkResult.failed).toBe(1);
      expect(_sdkResult.results).toHaveLength(2);
    });

    it('BulkItemResult has id, success, optional error', () => {
      const success: BulkItemResult = { id: 'uuid-1', success: true };
      const failure: BulkItemResult = { id: 'uuid-2', success: false, error: 'reason' };
      expect(success.success).toBe(true);
      expect(failure.error).toBe('reason');
    });
  });
});
