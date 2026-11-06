import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setServiceAccount } from '../../../src/service-accounts/index.js';
import { createTestClaimDefinition } from '../helpers/factories.js';
import {
  createMachineHttpFixture,
  isRecord,
  issueMachineToken,
  machineRequest,
  readMachineInvitation,
  readMachineUserCount,
} from './machine-http-fixtures.js';
import { expectMachineInvitationCreated, readInvitationAudits } from './machine-invitation-fixtures.js';

/** Real full-application fixture with an owned native machine credential. */
type MachineFixture = Awaited<ReturnType<typeof createMachineHttpFixture>>;
/** HTTP observations exclude native credential responses. */
type MachineResponse = Awaited<ReturnType<typeof machineRequest>>;
/** The request limit counts UTF-8 bytes, not JavaScript string characters. */
const MAX_BODY_BYTES = 100 * 1024;
/** Public validation errors must not reveal database, runtime or machine metadata internals. */
const INTERNAL_ERROR = /\b(?:SELECT|INSERT|UPDATE|DELETE|SQLSTATE)\b|node_modules|\/(?:home|tmp)\/|urn:porta:service-account|authorization_version|\bat\s+\S+.*:\d+:\d+/i;

describe.sequential('machine invitation request validation', () => {
  let fixture: MachineFixture | undefined;
  let token = '';
  let jsonClaimId = '';
  /** Rejection cases cannot add to the successful control's committed effects. */
  let setupAuditIds = new Set<string>();
  let setupMailAttempts = 0;

  /** Fail safely if fixture setup failed before a request could be made. */
  function currentFixture(): MachineFixture {
    if (!fixture) throw new Error('Machine invitation fixture is not ready');
    return fixture;
  }

  /** Preserve raw JSON when exercising parser and byte-limit boundaries. */
  async function request(body: Record<string, unknown>, rawBody?: string): Promise<MachineResponse> {
    const f = currentFixture();
    return machineRequest(f, {
      method: 'POST', path: `/api/admin/organizations/${f.lifecycle.organization.id}/users/invite`,
      token, ...(rawBody === undefined ? { body } : { rawBody }),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /** Use an explicitly JSON-typed live definition for arbitrary supported JSON values. */
  function jsonClaimBody(email: string, value: unknown) {
    if (!jsonClaimId) throw new Error('The JSON claim definition is not ready');
    return { email, claims: [{
      applicationId: currentFixture().lifecycle.application.id, claimDefinitionId: jsonClaimId, value,
    }] };
  }

  /** Keep raw numeric and nesting syntax intact rather than normalizing it before HTTP parsing. */
  function rawJsonClaim(email: string, valueEncoding: string): string {
    const body = jsonClaimBody(email, null);
    const applicationId = JSON.stringify(currentFixture().lifecycle.application.id);
    const definitionId = JSON.stringify(jsonClaimId);
    return `{"email":${JSON.stringify(body.email)},"claims":[`
      + `{"applicationId":${applicationId},"claimDefinitionId":${definitionId},"value":${valueEncoding}}]}`;
  }

  /** Fill a real string claim with UTF-8 text so character counts cannot stand in for request bytes. */
  function stringClaimAtBytes(email: string, bytes: number) {
    const { lifecycle } = currentFixture();
    const body = { email, claims: [{
      applicationId: lifecycle.application.id, claimDefinitionId: lifecycle.claim.id, value: '',
    }] };
    const capacity = bytes - Buffer.byteLength(JSON.stringify(body), 'utf8');
    const glyph = '雪';
    const glyphBytes = Buffer.byteLength(glyph, 'utf8');
    const value = glyph.repeat(Math.floor(capacity / glyphBytes)) + 'x'.repeat(capacity % glyphBytes);
    body.claims[0] = {
      applicationId: lifecycle.application.id, claimDefinitionId: lifecycle.claim.id, value,
    };
    return { raw: JSON.stringify(body), value };
  }

  /** Read only the requested claim projection; unrelated invitation details remain unspecified. */
  async function storedClaimValue(email: string, definitionId: string): Promise<unknown> {
    const f = currentFixture();
    const invitation = await readMachineInvitation(f.lifecycle.organization.id, email);
    if (!invitation || !Array.isArray(invitation.details.claims)) throw new Error('Stored claims are missing');
    const claims: unknown[] = invitation.details.claims;
    expect(claims.length).toBe(1);
    const claim = claims.find((entry) => isRecord(entry) && entry.claimDefinitionId === definitionId);
    if (!isRecord(claim)) throw new Error('The requested claim definition was not persisted');
    expect(claim.applicationId).toBe(f.lifecycle.application.id);
    expect(claim.claimDefinitionId).toBe(definitionId);
    return claim.value;
  }

  /**
   * Let the native serializer select a failing depth while the HTTP byte limit bounds fixture growth.
   *
   * The first depth that overflows this test process's call stack is not necessarily unencodable in
   * the server handler, which runs with a different remaining stack. After the shape first fails,
   * keep growing it to the largest power-of-two depth that still fits the request byte limit, so any
   * realistic handler stack also fails natively instead of accepting the request.
   */
  function unencodableJsonRequest(email: string): string {
    let selected: string | undefined;
    for (let depth = 1; ; depth *= 2) {
      const raw = rawJsonClaim(email, '['.repeat(depth) + '0' + ']'.repeat(depth));
      if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) break;
      const parsed: unknown = JSON.parse(raw);
      try {
        JSON.stringify(parsed);
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        selected = raw;
        continue;
      }
      if (selected) break;
    }
    if (!selected) throw new Error('This runtime has no native encoding failure within the request byte limit');
    return selected;
  }

  /** Rejection must not echo input, token material or internal error context. */
  async function expectRejected(
    response: MachineResponse, email: string, status = 400,
  ): Promise<void> {
    expect(response.status).toBe(status);
    expect(INTERNAL_ERROR.test(response.text)).toBe(false);
    expect(response.text.includes(token)).toBe(false);
    expect(response.text.includes(currentFixture().credential.plaintext)).toBe(false);
    expect(response.text.includes('invalid-input-marker')).toBe(false);
    const organizationId = currentFixture().lifecycle.organization.id;
    expect((await readMachineInvitation(organizationId, email)) === null).toBe(true);
    expect(await readMachineUserCount(organizationId, email)).toBe(0);
    expect(currentFixture().mail.attempts).toBe(setupMailAttempts);
    expect((await readInvitationAudits()).filter((row) => !setupAuditIds.has(row.id)).length).toBe(0);
  }

  /** Check persistence without dumping a response or invitation on failure. */
  async function expectCreated(response: MachineResponse, email: string): Promise<void> {
    await expectMachineInvitationCreated({ fixture: currentFixture() }, response, email);
  }

  beforeEach(async () => {
    fixture = await createMachineHttpFixture();
    const jsonClaim = await createTestClaimDefinition(fixture.lifecycle.application.id, { claimType: 'json' });
    jsonClaimId = jsonClaim.id;
    const target = {
      ...fixture.lifecycle.target,
      allowedClaimDefinitions: [...fixture.lifecycle.target.allowedClaimDefinitions, {
        applicationId: fixture.lifecycle.application.id, claimDefinitionId: jsonClaimId,
      }],
    };
    await setServiceAccount(
      fixture.lifecycle.client.id, { targets: [target] }, fixture.lifecycle.actor,
    );
    const issued = await issueMachineToken(fixture);
    expect(issued.status).toBe(200);
    const accessToken = issued.body.access_token;
    if (typeof accessToken !== 'string' || accessToken.length === 0) {
      throw new Error('Native issuance did not return an access token');
    }
    token = accessToken;
    const email = `validation-control-${randomUUID()}@test.example`;
    await expectCreated(await request(jsonClaimBody(email, { ready: true })), email);
    expect(await storedClaimValue(email, jsonClaimId)).toEqual({ ready: true });
    setupAuditIds = new Set((await readInvitationAudits()).map((row) => row.id));
    setupMailAttempts = fixture.mail.attempts;
  });

  afterEach(async () => {
    const ownedFixture = fixture;
    fixture = undefined;
    token = '';
    jsonClaimId = '';
    await ownedFixture?.close();
  });

  it.each([
    { name: 'missing email', input: { email: undefined } },
    { name: 'non-string email', input: { email: 42 } },
    { name: 'invalid email', input: { email: 'invalid-input-marker' } },
    { name: 'non-array roles', input: { roles: {} } },
    { name: 'non-array claims', input: { claims: {} } },
    { name: 'null role entry', input: { roles: [null] } },
    { name: 'incomplete role pair', input: { roles: [{}] } },
    { name: 'incomplete claim pair', input: { claims: [{}] } },
    { name: 'non-string given name', input: { givenName: {} } },
    { name: 'non-string family name', input: { familyName: [] } },
    { name: 'non-string personal message', input: { personalMessage: {} } },
    { name: 'non-string locale', input: { locale: {} } },
  ])('should return a fixed safe validation failure for $name', async ({ input }) => {
    const email = `invalid-${randomUUID()}@test.example`;
    const reference = await request({ email: 'invalid-input-marker-reference' });
    await expectRejected(reference, 'invalid-input-marker-reference');
    const response = await request({ email, ...input });
    await expectRejected(response, email);
    expect(JSON.stringify(response.body) === JSON.stringify(reference.body)).toBe(true);
  });

  it.each(['role application', 'role identity', 'claim application', 'claim identity'] as const)(
    'should reject an invalid %s UUID before invitation persistence', async (field) => {
      const f = currentFixture();
      const email = `invalid-id-${randomUUID()}@test.example`;
      const response = await request({
        email, roles: [{
          applicationId: field === 'role application' ? 'invalid-input-marker' : f.lifecycle.application.id,
          roleId: field === 'role identity' ? 'invalid-input-marker' : f.lifecycle.role.id,
        }],
        claims: [{
          applicationId: field === 'claim application' ? 'invalid-input-marker' : f.lifecycle.application.id,
          claimDefinitionId: field === 'claim identity' ? 'invalid-input-marker' : f.lifecycle.claim.id,
          value: 'ordinary',
        }],
      });
      await expectRejected(response, email);
    },
  );

  it('should accept a valid string claim filling the complete request byte allowance', async () => {
    const f = currentFixture();
    const email = `maximum-${randomUUID()}@test.example`;
    const { raw, value } = stringClaimAtBytes(email, MAX_BODY_BYTES);
    expect(Buffer.byteLength(raw, 'utf8')).toBe(MAX_BODY_BYTES);
    expect(raw.length < MAX_BODY_BYTES).toBe(true);
    await expectCreated(await request({}, raw), email);
    expect(await storedClaimValue(email, f.lifecycle.claim.id) === value).toBe(true);
  });

  it('should reject a valid JSON body exceeding the byte allowance without mutation', async () => {
    const email = `oversized-${randomUUID()}@test.example`;
    const { raw } = stringClaimAtBytes(email, MAX_BODY_BYTES + 1);
    expect(Buffer.byteLength(raw, 'utf8')).toBe(MAX_BODY_BYTES + 1);
    expect(raw.length < MAX_BODY_BYTES).toBe(true);
    await expectRejected(await request({}, raw), email, 413);
  });

  it('should preserve supported mixed JSON values without treating object keys as control fields', async () => {
    const email = `mixed-json-${randomUUID()}@test.example`;
    // A computed key keeps __proto__ as JSON data instead of changing the fixture's prototype.
    const value = {
      nested: [null, false, true, 0, -12.5, 'quote" slash\\ newline\n unicode雪', [], {}],
      object: { constructor: 'literal-key', ['__proto__']: { retained: true } },
    };
    await expectCreated(await request(jsonClaimBody(email, value)), email);
    expect(await storedClaimValue(email, jsonClaimId)).toEqual(value);
  });

  it.each(['1e309', '-1e309'])(
    'should reject a nested non-finite value parsed from valid JSON exponent %s', async (exponent) => {
      const email = `non-finite-${randomUUID()}@test.example`;
      const parsed: unknown = JSON.parse(exponent);
      expect(typeof parsed === 'number' && !Number.isFinite(parsed)).toBe(true);
      const raw = rawJsonClaim(email, `{"nested":[null,{"overflow":${exponent}}]}`);
      expect(Buffer.byteLength(raw, 'utf8') <= MAX_BODY_BYTES).toBe(true);
      expect(isRecord(JSON.parse(raw))).toBe(true);
      await expectRejected(await request({}, raw), email);
    },
  );

  it('should preserve deep valid JSON independently qualified by native full-request encoding', async () => {
    const email = `deep-json-${randomUUID()}@test.example`;
    // This depth is a positive fixture, not an application nesting limit.
    const valueEncoding = '['.repeat(1024) + '{"leaf":"retained"}' + ']'.repeat(1024);
    const raw = rawJsonClaim(email, valueEncoding);
    expect(Buffer.byteLength(raw, 'utf8') <= MAX_BODY_BYTES).toBe(true);
    expect(typeof JSON.stringify(JSON.parse(raw))).toBe('string');
    await expectCreated(await request({}, raw), email);
    expect(JSON.stringify(await storedClaimValue(email, jsonClaimId)) === valueEncoding).toBe(true);
  });

  it('should reject a natively unencodable complete request without a custom nesting limit', async () => {
    const email = `unencodable-${randomUUID()}@test.example`;
    const raw = unencodableJsonRequest(email);
    expect(Buffer.byteLength(raw, 'utf8') <= MAX_BODY_BYTES).toBe(true);
    await expectRejected(await request({}, raw), email);
  });
});
