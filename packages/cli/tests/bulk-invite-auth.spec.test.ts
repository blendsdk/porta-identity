/** Lazy SDK authentication cannot prove invitation dispatch or turn SDK recovery into extra attempts. */
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { createPortaClient } from '@portaidentity/sdk';
import { createCliAuth, createNodeTransport } from '@portaidentity/sdk/node';
import type { StoredCredentials } from '@portaidentity/sdk/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBulkInviteExitCode, runBulkInvitations } from '../src/bulk-invite.js';
import { createEmptyHome, removeEmptyHome } from './helpers/json-error-contract.js';

const org = '11111111-1111-4111-8111-111111111111';
const marker = 'SENSITIVE_MARKER';
const server = 'https://porta.example.test';
const prepared = {
  inputRecords: 2, duplicates: 0,
  recipients: ['alice@example.com', 'bob@example.com'].map((email, index) => ({
    line: index + 1, email, input: { organizationId: org, email },
  })),
};
let root: string;

/** The snapshot exists only in memory; even the synthetic credential path is never written. */
function credentials(expired: boolean): StoredCredentials {
  return {
    server, orgSlug: 'porta-admin', clientId: 'porta-cli', accessToken: `${marker}_access`,
    refreshToken: `${marker}_refresh`, idToken: `${marker}_id`,
    expiresAt: expired ? '2000-01-01T00:00:00.000Z' : new Date(Date.now() + 3_600_000).toISOString(),
    userInfo: { sub: 'synthetic-subject', email: 'operator@example.test' },
  };
}

/** A fetch response is the external HTTP boundary; SDK auth and transport remain real. */
function response(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(async () => {
  root = await createEmptyHome();
  vi.stubEnv('HOME', root);
  vi.stubEnv('XDG_CONFIG_HOME', root);
  vi.spyOn(fs, 'writeFile').mockRejectedValue(new Error('Credential writes are outside this fixture'));
});
afterEach(async () => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  try { expect(await fs.readdir(root)).toStrictEqual([]); }
  finally { await removeEmptyHome(root); }
});

describe('opaque lazy authentication failures', () => {
  it.each(['missing', 'refresh400', 'refresh500', 'transport'] as const)
    ('should stop unknown without status for %s even when the fixture knows no invitation HTTP ran', async (scenario) => {
      const credentialsPath = join(root, 'never-created-credentials.json');
      const read = vi.spyOn(fs, 'readFile');
      if (scenario === 'missing') {
        read.mockRejectedValue(Object.assign(new Error(marker), { code: 'ENOENT' }));
      } else {
        read.mockResolvedValue(JSON.stringify(credentials(true)));
      }
      syncBuiltinESMExports();
      const http = vi.fn<typeof fetch>();
      if (scenario === 'transport') http.mockRejectedValue(new TypeError(marker));
      else http.mockResolvedValue(response({ error: marker }, scenario === 'refresh500' ? 500 : 400));
      vi.stubGlobal('fetch', http);
      const auth = createCliAuth({ credentialsPath });
      const client = createPortaClient({ transport: createNodeTransport({ baseUrl: server, auth }) });
      const invite = vi.fn(client.users.invite);
      const report = await runBulkInvitations(prepared, invite);
      expect(report).toStrictEqual({
        summary: {
          inputRecords: 2, uniqueRecipients: 2, duplicates: 0, attempted: 1,
          created: 0, sent: 0, deliveryFailed: 0, deliveryUnknown: 0, rejected: 0, unknown: 1, unattempted: 1,
        },
        results: [
          { line: 1, email: 'alice@example.com', outcome: 'unknown',
            error: { code: 'OUTCOME_UNKNOWN', message: 'The invitation outcome is unknown.' } },
          { line: 2, email: 'bob@example.com', outcome: 'unattempted' },
        ],
        stopReason: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' },
      });
      expect(getBulkInviteExitCode(report)).toBe(2);
      expect(invite).toHaveBeenCalledExactlyOnceWith(prepared.recipients[0]!.input);
      expect(http).toHaveBeenCalledTimes(scenario === 'missing' ? 0 : 1);
      for (const [, init] of http.mock.calls) {
        expect(String(init?.body)).toContain('grant_type=refresh_token');
      }
      expect(read).toHaveBeenCalled();
      for (const [path] of read.mock.calls) expect(path).toBe(credentialsPath);
      expect(JSON.stringify(report)).not.toContain(marker);
    });
});

describe('SDK-owned HTTP authentication recovery', () => {
  it('should count a recovered invitation as one SDK attempt despite two invitation HTTP requests', async () => {
    const credentialsPath = join(root, 'never-created-credentials.json');
    vi.spyOn(fs, 'readFile').mockResolvedValue(JSON.stringify(credentials(false)));
    syncBuiltinESMExports();
    const invitation = {
      invitationId: '33333333-3333-4333-8333-333333333333', email: 'alice@example.com',
      invitationSent: true, emailDelivery: 'sent', expiresAt: '2026-12-01T12:00:00.000Z',
    };
    const http = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response({ error: marker }, 401))
      .mockResolvedValueOnce(response({ access_token: `${marker}_new`, expires_in: 3600 }))
      .mockResolvedValueOnce(response(invitation));
    vi.stubGlobal('fetch', http);
    const auth = createCliAuth({ credentialsPath });
    const client = createPortaClient({ transport: createNodeTransport({ baseUrl: server, auth }) });
    const invite = vi.fn(client.users.invite);
    const report = await runBulkInvitations({ ...prepared, inputRecords: 1, recipients: prepared.recipients.slice(0, 1) }, invite);
    expect(invite).toHaveBeenCalledOnce();
    expect(http).toHaveBeenCalledTimes(3);
    expect(String(http.mock.calls[0]?.[0])).toBe(String(http.mock.calls[2]?.[0]));
    expect(String(http.mock.calls[1]?.[0])).not.toBe(String(http.mock.calls[0]?.[0]));
    expect(report.summary).toStrictEqual({
      inputRecords: 1, uniqueRecipients: 1, duplicates: 0, attempted: 1,
      created: 1, sent: 1, deliveryFailed: 0, deliveryUnknown: 0, rejected: 0, unknown: 0, unattempted: 0,
    });
    expect(report.results).toStrictEqual([{ line: 1, email: 'alice@example.com', outcome: 'created', invitation }]);
    expect(report.stopReason).toBeNull();
    expect(getBulkInviteExitCode(report)).toBe(0);
    expect(JSON.stringify(report)).not.toContain(marker);
  });
});
