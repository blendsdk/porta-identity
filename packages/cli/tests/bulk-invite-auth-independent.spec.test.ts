/** Lazy SDK authentication cannot prove whether an invitation reached the server. */
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { createPortaClient } from '@portaidentity/sdk';
import type { InviteUserInput, InviteUserResult } from '@portaidentity/sdk';
import { createCliAuth, createNodeTransport } from '@portaidentity/sdk/node';
import type { StoredCredentials } from '@portaidentity/sdk/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseBulkRecipients, prepareBulkInvitations } from '../src/bulk-invite-input.js';
import { getBulkInviteExitCode, runBulkInvitations } from '../src/bulk-invite.js';
import { createEmptyHome, removeEmptyHome } from './helpers/json-error-contract.js';

const marker = 'SYNTHETICMARKER';
const server = 'https://porta.example.test';
const organizationId = '11111111-1111-4111-8111-111111111111';
let home: string;

beforeEach(async () => {
  home = await createEmptyHome();
  vi.stubEnv('HOME', home);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected HTTP request')));
});

afterEach(async () => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await removeEmptyHome(home);
});

/** Return an in-memory snapshot only; no credential file is created or accessed. */
function credentials(expired: boolean): StoredCredentials {
  return {
    server,
    orgSlug: 'porta-admin',
    clientId: 'porta-cli',
    accessToken: `${marker}_access`,
    refreshToken: `${marker}_refresh`,
    idToken: `${marker}_id`,
    expiresAt: expired ? '2000-01-01T00:00:00.000Z' : '2099-01-01T00:00:00.000Z',
    userInfo: { sub: 'synthetic-subject', email: 'operator@example.test' },
  };
}

/** Prepare two recipients while retaining the duplicate counter and physical line numbers. */
function preparedRecipients() {
  return prepareBulkInvitations(
    parseBulkRecipients('Alice@example.com\nalice@example.com\nbob@example.com\n'),
    { org: organizationId },
  );
}

/** Build the real public client with an external, exact-path filesystem stub. */
function clientWithCredentials(snapshot?: StoredCredentials) {
  const credentialsPath = join(home, 'never-created-credentials.json');
  const read = vi.spyOn(fs, 'readFile').mockImplementation(async (path) => {
    expect(path).toBe(credentialsPath);
    if (!snapshot) throw Object.assign(new Error(marker), { code: 'ENOENT' });
    return JSON.stringify(snapshot);
  });
  syncBuiltinESMExports();
  const client = createPortaClient({
    transport: createNodeTransport({
      baseUrl: server,
      auth: createCliAuth({ credentialsPath }),
    }),
  });
  return { client, read };
}

/** Construct an external JSON response, including hostile diagnostics when testing failure. */
function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Supply ordinary OAuth refresh fields without introducing another authentication API. */
function refreshedTokens(): Response {
  return jsonResponse({
    access_token: `${marker}_renewed_access`,
    refresh_token: `${marker}_renewed_refresh`,
    token_type: 'Bearer',
    expires_in: 3600,
  });
}

/** Every acknowledged creation has exactly the five public invitation-result fields. */
function creation(email: string): InviteUserResult {
  return {
    invitationId: '22222222-2222-4222-8222-222222222222',
    email,
    invitationSent: true,
    emailDelivery: 'sent',
    expiresAt: '2099-01-01T00:00:00.000Z',
  };
}

/** Distinguish invitation dispatch from refresh using the external JSON request body. */
function invitationHttpCalls(fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>) {
  return fetch.mock.calls.filter(([, init]) => {
    if (typeof init?.body !== 'string') return false;
    try {
      const body: unknown = JSON.parse(init.body);
      return typeof body === 'object' && body !== null && 'email' in body;
    } catch {
      return false;
    }
  });
}

describe('independent public SDK authentication outcomes', () => {
  it.each(['missing', 'refresh400', 'refresh500', 'refreshTransport'] as const)(
    'should count one unknown SDK attempt and stop without status for %s',
    async (scenario) => {
      const { client, read } = clientWithCredentials(
        scenario === 'missing' ? undefined : credentials(true),
      );
      const fetch = vi.fn<typeof globalThis.fetch>();
      if (scenario === 'refreshTransport' || scenario === 'missing') {
        fetch.mockRejectedValue(new TypeError(marker));
      } else {
        fetch.mockResolvedValue(
          jsonResponse({ error: marker, details: marker }, scenario === 'refresh400' ? 400 : 500),
        );
      }
      vi.stubGlobal('fetch', fetch);
      const invite = vi.fn((input: InviteUserInput) => client.users.invite(input));

      const report = await runBulkInvitations(preparedRecipients(), invite);

      expect(report).toStrictEqual({
        summary: {
          inputRecords: 3, uniqueRecipients: 2, duplicates: 1, attempted: 1,
          created: 0, sent: 0, deliveryFailed: 0, deliveryUnknown: 0,
          rejected: 0, unknown: 1, unattempted: 1,
        },
        results: [
          {
            line: 1, email: 'Alice@example.com', outcome: 'unknown',
            error: { code: 'OUTCOME_UNKNOWN', message: 'The invitation outcome is unknown.' },
          },
          { line: 3, email: 'bob@example.com', outcome: 'unattempted' },
        ],
        stopReason: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' },
      });
      expect(getBulkInviteExitCode(report)).toBe(2);
      expect(invite).toHaveBeenCalledExactlyOnceWith({
        organizationId, email: 'Alice@example.com',
      });
      expect(read).toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledTimes(scenario === 'missing' ? 0 : 1);
      // The fixture knows no invitation HTTP call ran; the runner still has only an opaque error.
      expect(invitationHttpCalls(fetch)).toHaveLength(0);
      expect(JSON.stringify(report)).not.toContain(marker);
    },
  );

  it('should stop with an unknown row and no status when refreshed invitation still returns 401', async () => {
    const { client } = clientWithCredentials(credentials(false));
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockRejectedValue(new Error('Unexpected extra HTTP request'))
      .mockResolvedValueOnce(jsonResponse({ error: marker }, 401))
      .mockResolvedValueOnce(refreshedTokens())
      .mockResolvedValueOnce(jsonResponse({ error: marker, details: marker }, 401));
    vi.stubGlobal('fetch', fetch);
    const invite = vi.fn((input: InviteUserInput) => client.users.invite(input));

    const report = await runBulkInvitations(preparedRecipients(), invite);

    expect(report.results).toStrictEqual([
      {
        line: 1, email: 'Alice@example.com', outcome: 'unknown',
        error: { code: 'OUTCOME_UNKNOWN', message: 'The invitation outcome is unknown.' },
      },
      { line: 3, email: 'bob@example.com', outcome: 'unattempted' },
    ]);
    expect(report.stopReason).toStrictEqual({
      code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.',
    });
    expect(report.summary).toStrictEqual({
      inputRecords: 3, uniqueRecipients: 2, duplicates: 1, attempted: 1,
      created: 0, sent: 0, deliveryFailed: 0, deliveryUnknown: 0,
      rejected: 0, unknown: 1, unattempted: 1,
    });
    expect(getBulkInviteExitCode(report)).toBe(2);
    expect(invite).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(invitationHttpCalls(fetch)).toHaveLength(2);
    expect(JSON.stringify(report)).not.toContain(marker);
  });

  it('should count recovered HTTP retries as one SDK attempt and continue after valid creation', async () => {
    const { client } = clientWithCredentials(credentials(false));
    const alice = creation('Alice@example.com');
    const bob = creation('bob@example.com');
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockRejectedValue(new Error('Unexpected extra HTTP request'))
      .mockResolvedValueOnce(jsonResponse({ error: marker }, 401))
      .mockResolvedValueOnce(refreshedTokens())
      .mockResolvedValueOnce(jsonResponse(alice, 201))
      .mockResolvedValueOnce(jsonResponse(bob, 201));
    vi.stubGlobal('fetch', fetch);
    const invite = vi.fn((input: InviteUserInput) => client.users.invite(input));

    const report = await runBulkInvitations(preparedRecipients(), invite);

    expect(report).toStrictEqual({
      summary: {
        inputRecords: 3, uniqueRecipients: 2, duplicates: 1, attempted: 2,
        created: 2, sent: 2, deliveryFailed: 0, deliveryUnknown: 0,
        rejected: 0, unknown: 0, unattempted: 0,
      },
      results: [
        { line: 1, email: 'Alice@example.com', outcome: 'created', invitation: alice },
        { line: 3, email: 'bob@example.com', outcome: 'created', invitation: bob },
      ],
      stopReason: null,
    });
    expect(getBulkInviteExitCode(report)).toBe(0);
    expect(invite.mock.calls).toStrictEqual([
      [{ organizationId, email: 'Alice@example.com' }],
      [{ organizationId, email: 'bob@example.com' }],
    ]);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(invitationHttpCalls(fetch)).toHaveLength(3);
    expect(JSON.stringify(report)).not.toContain(marker);
  });
});
