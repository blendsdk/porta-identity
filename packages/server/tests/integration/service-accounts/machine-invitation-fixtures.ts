import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { getPool } from '../../../src/lib/database.js';
import { setServiceAccount } from '../../../src/service-accounts/index.js';
import type { ServiceAccountBinding } from '../../../src/service-accounts/index.js';
import {
  createMachineHttpFixture,
  isRecord,
  issueMachineToken,
  machineRequest,
  readMachineInvitation,
  readMachineUserCount,
} from './machine-http-fixtures.js';
import type {
  MachineHttpFixture, MachineHttpResponse, MachineInvitation,
} from './machine-http-fixtures.js';

/** Native authority and real application state belonging to one invitation test. */
export interface MachineInvitationSession {
  /** Full application, native provider and owned database identities. */
  fixture: MachineHttpFixture;
  /** Binding returned by the real policy operation before native issuance. */
  binding: ServiceAccountBinding;
  /** Opaque native token kept in memory and excluded from assertion dumps. */
  token: string;
  /** Original authoritative version, retained even when a later revocation changes storage. */
  authorizationVersion: string;
}

/** Existing business and outer mutation audit fields, without credential-bearing columns. */
export interface MachineInvitationAudit {
  /** Unique audit identity used to distinguish setup from the observed request. */
  id: string;
  /** Organization selected by the existing business or generic audit convention. */
  organizationId: string | null;
  /** Legacy human attribution column; machine mutations must leave it null. */
  userId: string | null;
  /** Explicit human actor identity; machine mutations must leave it null. */
  actorId: string | null;
  /** Existing actor discriminator, independently checked by each lane. */
  actorType: string;
  /** Public OAuth client identifier, never the internal client row UUID. */
  actorClientId: string | null;
  /** Client name used by the existing client audit projection. */
  actorClientName: string | null;
  /** Existing invitation or generic mutation event identifier. */
  eventType: string;
  /** Native JSON metadata, narrowed before its fields are inspected. */
  metadata: unknown;
}

/** Obtain a genuine scoped token, optionally using a replacement secret after restoration. */
export async function issueInvitationToken(fixture: MachineHttpFixture, secret?: string): Promise<string> {
  const issued = await issueMachineToken(fixture, secret === undefined ? undefined : { secret });
  expect(issued.status).toBe(200);
  const token = issued.body.access_token;
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('Native issuance did not return an access token');
  }
  return token;
}

/**
 * Prepare two permitted organizations through the actual policy service, then issue a native token.
 * Setup failures close the owned listener before propagating; no authority is mocked.
 */
export async function createInvitationSession(): Promise<MachineInvitationSession> {
  const fixture = await createMachineHttpFixture();
  try {
    const binding = await setServiceAccount(fixture.lifecycle.client.id, {
      targets: [fixture.lifecycle.target, fixture.lifecycle.otherTarget],
    }, fixture.lifecycle.actor);
    const version = await getPool().query<{ authorizationVersion: string }>(
      'SELECT authorization_version AS "authorizationVersion" FROM client_service_accounts WHERE client_id = $1',
      [fixture.lifecycle.client.id],
    );
    const authorizationVersion = version.rows[0]?.authorizationVersion;
    if (typeof authorizationVersion !== 'string') {
      throw new Error('The prepared binding has no authoritative version');
    }
    const token = await issueInvitationToken(fixture);
    return { fixture, binding, token, authorizationVersion };
  } catch (error) {
    await fixture.close();
    throw error;
  }
}

/** Send to the actual invitation route without changing authentication or transaction ownership. */
export async function postMachineInvitation(
  session: MachineInvitationSession, email: string,
  organizationId = session.fixture.lifecycle.organization.id,
): Promise<MachineHttpResponse> {
  return machineRequest(session.fixture, {
    method: 'POST', path: `/api/admin/organizations/${organizationId}/users/invite`,
    token: session.token, body: { email },
  });
}

/**
 * Verify exact public creation fields, final delivery reporting and independent persistence.
 * Only non-secret projection fields are compared, so failures cannot print native credentials.
 */
export async function expectMachineInvitationCreated(
  session: Pick<MachineInvitationSession, 'fixture'>, response: MachineHttpResponse, email: string,
  delivery: 'sent' | 'failed' | 'unknown' = 'sent',
  organizationId = session.fixture.lifecycle.organization.id,
): Promise<MachineInvitation> {
  expect(response.status).toBe(201);
  const data = response.body.data;
  if (!isRecord(data)) throw new Error('Invitation response did not contain an object');
  expect(Object.keys(response.body)).toEqual(['data']);
  expect(Object.keys(data).sort()).toEqual([
    'email', 'emailDelivery', 'expiresAt', 'invitationId', 'invitationSent',
  ]);
  expect(data.email).toBe(email);
  expect(data.emailDelivery).toBe(delivery);
  expect(data.invitationSent).toBe(delivery === 'sent');
  const invitationId = data.invitationId;
  const expiresAt = data.expiresAt;
  if (typeof invitationId !== 'string' || typeof expiresAt !== 'string') {
    throw new Error('Invitation result has an invalid identifier or expiry');
  }
  expect(new Date(expiresAt).toISOString()).toBe(expiresAt);
  const invitation = await readMachineInvitation(organizationId, email);
  if (!invitation) throw new Error('Successful invitation was not committed');
  expect(invitation.id).toBe(invitationId);
  expect(await readMachineUserCount(organizationId, email)).toBe(0);
  return invitation;
}

/** A rejected request must not leave an invitation or eagerly create the requested user. */
export async function expectMachineInvitationAbsent(
  session: MachineInvitationSession, email: string,
  organizationId = session.fixture.lifecycle.organization.id,
): Promise<void> {
  expect((await readMachineInvitation(organizationId, email)) === null).toBe(true);
  expect(await readMachineUserCount(organizationId, email)).toBe(0);
}

/** Assert fixed safe failure boundaries using booleans rather than credential-bearing dumps. */
export function expectSafeMachineFailure(
  session: MachineInvitationSession, response: MachineHttpResponse, status: number,
): void {
  expect(response.status).toBe(status);
  const internal = /\b(?:SELECT|INSERT|UPDATE|DELETE|SQLSTATE)\b|node_modules|\/(?:home|tmp)\/|urn:porta:service-account|authorization_version|\bat\s+\S+.*:\d+:\d+/i;
  expect(internal.test(response.text)).toBe(false);
  for (const sensitive of [
    session.token, session.fixture.credential.plaintext, session.authorizationVersion,
    session.binding.id, session.binding.serviceAccountId,
  ]) {
    expect(response.text.includes(sensitive)).toBe(false);
  }
}

/** Read only the two existing mutation events; unrelated authentication and email audits remain intact. */
export async function readInvitationAudits(): Promise<MachineInvitationAudit[]> {
  const result = await getPool().query<MachineInvitationAudit>(`
    SELECT id, organization_id AS "organizationId", user_id AS "userId", actor_id AS "actorId",
      actor_type AS "actorType", actor_client_id AS "actorClientId",
      actor_client_name AS "actorClientName", event_type AS "eventType", metadata
    FROM audit_log WHERE event_type = ANY($1::text[]) ORDER BY id
  `, [['user.invited', 'admin.mutation.committed']]);
  return result.rows;
}

/** Check both machine actors against the original validated binding, never later revoked state. */
export function expectMachineInvitationAudits(
  session: MachineInvitationSession, rows: MachineInvitationAudit[],
): void {
  expect(rows.map((row) => row.eventType).sort()).toEqual([
    'admin.mutation.committed', 'user.invited',
  ]);
  for (const row of rows) {
    expect(row.actorType).toBe('client');
    expect(row.actorId).toBeNull();
    expect(row.userId).toBeNull();
    expect(row.actorClientId).toBe(session.fixture.lifecycle.client.clientId);
    expect(row.actorClientName).toBe(session.fixture.lifecycle.client.clientName);
    if (!isRecord(row.metadata)) throw new Error('Mutation audit metadata is not an object');
    expect(row.metadata.serviceAccountId).toBe(session.binding.serviceAccountId);
    expect(row.metadata.bindingId).toBe(session.binding.id);
    expect(row.metadata.authorizationVersion).toBe(session.authorizationVersion);
    const encoded = JSON.stringify(row.metadata) ?? '';
    expect(encoded.includes(session.token)).toBe(false);
    expect(encoded.includes(session.fixture.credential.plaintext)).toBe(false);
    if (row.eventType === 'user.invited') {
      expect(row.organizationId).toBe(session.fixture.lifecycle.organization.id);
    } else {
      expect(row.metadata.method).toBe('POST');
      expect(typeof row.metadata.routeTemplate === 'string' && row.metadata.routeTemplate.length > 0).toBe(true);
    }
  }
}

/**
 * Reject only the final generic event in real PostgreSQL after all fixture setup has completed.
 * DDL identifiers cannot use SQL parameters, so their suffix comes only from generated UUID hex.
 * Both owned objects are removed even when the request or an assertion fails.
 */
export async function withRejectedFinalInvitationAudit(work: () => Promise<void>): Promise<void> {
  const suffix = randomUUID().replaceAll('-', '');
  const functionName = `machine_invitation_audit_${suffix}`;
  const triggerName = `machine_invitation_final_${suffix}`;
  let functionCreated = false;
  let triggerCreated = false;
  try {
    await getPool().query(`
      CREATE FUNCTION ${functionName}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.event_type = 'admin.mutation.committed' THEN
          RAISE EXCEPTION USING ERRCODE = '08006', MESSAGE = 'Audit storage unavailable';
        END IF;
        RETURN NEW;
      END $$
    `);
    functionCreated = true;
    await getPool().query(`
      CREATE TRIGGER ${triggerName} BEFORE INSERT ON audit_log
      FOR EACH ROW EXECUTE FUNCTION ${functionName}()
    `);
    triggerCreated = true;
    await work();
  } finally {
    try {
      if (triggerCreated) await getPool().query(`DROP TRIGGER ${triggerName} ON audit_log`);
    } finally {
      if (functionCreated) await getPool().query(`DROP FUNCTION ${functionName}()`);
    }
  }
}
