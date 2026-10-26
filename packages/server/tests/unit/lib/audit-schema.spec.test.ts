import { describe, expect, it } from 'vitest';

import {
  assertAuditSchemaMetadata,
  AuditSchemaError,
  type AuditSchemaMetadata,
} from '../../../src/lib/audit-schema.js';

/** Complete audit schema metadata for the current migration level. */
const completeMetadata: AuditSchemaMetadata = {
  columns: new Map([
    ['actor_type', 'NO'],
    ['actor_client_id', 'YES'],
    ['actor_client_name', 'YES'],
  ]),
  hasShapeConstraint: true,
};

describe('audit schema inspection', () => {
  it('should accept the complete current audit schema', () => {
    expect(() => assertAuditSchemaMetadata(completeMetadata)).not.toThrow();
  });

  it.each([
    [
      'the actor type column',
      {
        columns: new Map([
          ['actor_client_id', 'YES'],
          ['actor_client_name', 'YES'],
        ]),
        hasShapeConstraint: true,
      },
    ],
    [
      'a nullable actor type column',
      {
        columns: new Map([
          ['actor_type', 'YES'],
          ['actor_client_id', 'YES'],
          ['actor_client_name', 'YES'],
        ]),
        hasShapeConstraint: true,
      },
    ],
    [
      'the client identifier column',
      {
        columns: new Map([
          ['actor_type', 'NO'],
          ['actor_client_name', 'YES'],
        ]),
        hasShapeConstraint: true,
      },
    ],
    [
      'the shape constraint',
      {
        columns: completeMetadata.columns,
        hasShapeConstraint: false,
      },
    ],
  ] satisfies Array<[string, AuditSchemaMetadata]>)(
    'should reject an outdated schema missing %s',
    (_caseName, metadata) => {
      expect(() => assertAuditSchemaMetadata(metadata)).toThrow(AuditSchemaError);
      expect(() => assertAuditSchemaMetadata(metadata)).toThrow(
        /audit schema is not current/i,
      );
    },
  );

  it('should expose a safe machine-readable error code', () => {
    expect(() =>
      assertAuditSchemaMetadata({
        columns: new Map(),
        hasShapeConstraint: false,
      }),
    ).toThrow(expect.objectContaining({ code: 'audit_schema_outdated' }));
  });
});
