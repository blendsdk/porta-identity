import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { expect } from 'vitest';

import { getPool } from '../../../src/lib/database.js';
import { findServiceAccountByClientId } from '../../../src/service-accounts/index.js';
import type { ServiceAccountBinding } from '../../../src/service-accounts/index.js';
import {
  LIFECYCLE_BINDING_KEYS,
  readLifecycleAccount,
  readLifecycleAudits,
} from './lifecycle-fixtures.js';
import { isRecord } from './machine-http-fixtures.js';
import type { MachineHttpFixture, MachineHttpResponse } from './machine-http-fixtures.js';

/** The complete public method set for the client binding subresource. */
export const MANAGEMENT_METHODS = ['GET', 'PUT', 'DELETE'] as const;

/** UUIDs in a successful projection are canonical lowercase identifiers. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The approved non-secret values used to check a complete wire projection. */
type ExpectedBinding = Pick<ServiceAccountBinding, 'clientId' | 'accountEmail' | 'status' | 'targets'>;

/** Identity and timestamps returned only after checking the complete wire object. */
export interface ManagementBindingObservation {
  /** Binding identity, which must survive replacement, revocation and restoration. */
  id: string;
  /** Real owned user identity, never an identity supplied in the request. */
  serviceAccountId: string;
  /** Original creation instant encoded as an ISO string. */
  createdAt: string;
  /** Current update instant encoded as an ISO string. */
  updatedAt: string;
}

/** Fail clearly if setup did not produce a fixture; never reuse a previous test's listener. */
export function requireManagementFixture(fixture: MachineHttpFixture | undefined): MachineHttpFixture {
  if (!fixture) throw new Error('The owned management HTTP fixture is unavailable');
  return fixture;
}

/** Require the explicitly bound fixture variant without inventing an account identity. */
export function requireManagementBinding(fixture: MachineHttpFixture): ServiceAccountBinding {
  if (!fixture.binding) throw new Error('This management scenario requires an owned binding');
  return fixture.binding;
}

/**
 * Build the subresource path from the internal client UUID, not its public OAuth identifier.
 * @example managementPath('e42008a2-8381-4bb4-a771-27b544c260ec')
 */
export function managementPath(clientId: string): string {
  return `/api/admin/clients/${encodeURIComponent(clientId)}/service-account`;
}

/**
 * Use plausible values for forbidden fields, so rejection cannot pass merely on a wrong value type.
 * Credential samples remain in memory and are never placed in test names or failure messages.
 */
export function managementUnknownInputValues(field: string, fixture: MachineHttpFixture): readonly unknown[] {
  switch (field) {
    case 'userId':
    case 'serviceAccountId':
      return [fixture.lifecycle.actor.id, randomUUID()];
    case 'authorizationVersion':
    case 'authorization_version':
      return [randomUUID(), randomUUID()];
    case 'permissions':
      return [[], ['admin:user:invite']];
    case 'isServiceAccount':
    case 'is_service_account':
      return [false, true];
    case 'status':
      return ['active', 'revoked'];
    case 'clientSecret':
      return [fixture.credential.plaintext, `${fixture.credential.plaintext}-unrecognized`];
    default:
      return ['Rejected-Management-Value-1!', 'Rejected-Management-Value-2!'];
  }
}

/** Check an ISO instant without printing an unexpected value in an assertion failure. */
function isIsoInstant(value: string): boolean {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

/**
 * Check every public field and return only identity/timestamp observations for later requests.
 * Exact key checks reject credential, internal-classification and authorization-version leaks.
 * Malformed bodies are never included in thrown errors or whole-body assertion dumps.
 */
export function expectManagementBinding(
  body: Record<string, unknown>,
  expected: ExpectedBinding,
): ManagementBindingObservation {
  expect(Object.keys(body).sort()).toEqual(['data']);
  const data = body.data;
  if (!isRecord(data)) throw new Error('Expected a public binding object');
  expect(Object.keys(data).sort()).toEqual([...LIFECYCLE_BINDING_KEYS]);
  const { id, serviceAccountId, createdAt, updatedAt } = data;
  if (typeof id !== 'string' || typeof serviceAccountId !== 'string'
    || typeof createdAt !== 'string' || typeof updatedAt !== 'string') {
    throw new Error('Expected string binding identities and ISO timestamps');
  }
  expect(UUID_PATTERN.test(id), 'Binding identity must be a canonical UUID').toBe(true);
  expect(UUID_PATTERN.test(serviceAccountId), 'Owned identity must be a canonical UUID').toBe(true);
  expect(data.clientId === expected.clientId, 'Client identity must match the internal UUID').toBe(true);
  expect(data.accountEmail === expected.accountEmail, 'Owned email must match its normalized value').toBe(true);
  expect(data.status === expected.status, 'Binding status must match its lifecycle state').toBe(true);
  expect(isDeepStrictEqual(data.targets, expected.targets), 'Policy must have exactly its approved fields')
    .toBe(true);
  expect(isIsoInstant(createdAt), 'Creation time must be an ISO instant').toBe(true);
  expect(isIsoInstant(updatedAt), 'Update time must be an ISO instant').toBe(true);
  return { id, serviceAccountId, createdAt, updatedAt };
}

/**
 * Assert a safe error without assuming undocumented message text or printing rejected values.
 * Callers compare responses within one failure category to prove its body is fixed.
 */
export function expectManagementError(
  fixture: MachineHttpFixture,
  response: MachineHttpResponse,
  status: number,
  forbiddenValues: readonly string[] = [],
): void {
  expect(response.status).toBe(status);
  // The outer body parser owns 413; this route must not impose a new envelope on that boundary.
  if (status !== 413) {
    expect(Object.keys(response.body).length, 'Errors must retain their JSON envelope').toBeGreaterThan(0);
  }
  expect('data' in response.body).toBe(false);
  const text = response.text.toLowerCase();
  const privateValues = [
    fixture.credential.plaintext, fixture.lifecycle.oldSecret, fixture.lifecycle.client.id,
    fixture.lifecycle.client.clientId, fixture.lifecycle.accountEmail, fixture.lifecycle.actor.id,
    fixture.lifecycle.actor.email, fixture.binding?.id ?? '', fixture.binding?.serviceAccountId ?? '',
    ...forbiddenValues,
  ];
  for (const value of privateValues) {
    if (value.length > 0) {
      expect(text.includes(value.toLowerCase()), 'Errors must not echo request or credential values')
        .toBe(false);
    }
  }
  const internalDetails = /sqlstate|node_modules|postgres(?:ql)?:\/\/|redis:\/\/|\/(?:home|tmp|usr)\/|\bat\s+\S+\s+\([^)]*:\d+:\d+\)|\bselect\s+.+\s+from\b|\binsert\s+into\b|\bupdate\s+\S+\s+set\b|\bdelete\s+from\b/;
  expect(internalDetails.test(text), 'Errors must not disclose SQL, stacks or internal paths').toBe(false);
}

/**
 * Observe human mutation attribution before a credential verification can add a system audit.
 * Only opaque audit IDs and boolean checks are exposed to assertion failures.
 */
export async function expectHumanManagementAudit(
  fixture: MachineHttpFixture,
  previousIds: readonly string[],
  identifiers: readonly string[],
): Promise<void> {
  const previous = new Set(previousIds);
  const added = (await readLifecycleAudits()).filter((audit) => !previous.has(audit.id));
  expect(added.length, 'A successful security mutation must have durable audit evidence')
    .toBeGreaterThan(0);
  expect(added.every((audit) => audit.actorId === fixture.lifecycle.actor.id)).toBe(true);
  for (const identifier of identifiers) {
    expect(added.some((audit) => audit.details.includes(identifier)), 'Audit must identify its resource')
      .toBe(true);
  }
  for (const secret of [fixture.credential.plaintext, fixture.lifecycle.oldSecret]) {
    expect(added.every((audit) => !audit.details.includes(secret)), 'Audit must not contain credentials')
      .toBe(true);
  }
}

/**
 * Observe the retained ownership marker after production account deletion.
 * Inspect the complete binding row for deleted-account PII, but never return or print that row.
 */
export async function expectLostOwnerMarker(
  fixture: MachineHttpFixture,
  bindingId: string,
  deletedAccountId: string,
) {
  const stored = await findServiceAccountByClientId(fixture.lifecycle.client.id);
  if (!stored) throw new Error('A lost owner must leave its binding marker');
  expect(stored.id).toBe(bindingId);
  expect(stored.clientId).toBe(fixture.lifecycle.client.id);
  expect(stored.accountId).toBeNull();
  expect(stored.status).toBe('revoked');
  expect(stored.targets).toEqual([]);
  expect(await readLifecycleAccount(deletedAccountId)).toBeNull();
  const rows = await getPool().query<{ serialized: string }>(
    'SELECT to_jsonb(b)::text AS serialized FROM client_service_accounts b WHERE client_id = $1',
    [fixture.lifecycle.client.id],
  );
  expect(rows.rows.length).toBe(1);
  const serialized = rows.rows[0]?.serialized;
  if (!serialized) throw new Error('Expected one retained binding row');
  expect(serialized.includes(fixture.lifecycle.accountEmail), 'Marker must not retain account email')
    .toBe(false);
  expect(serialized.includes(deletedAccountId), 'Marker must not retain its deleted owner reference')
    .toBe(false);
  return stored;
}
