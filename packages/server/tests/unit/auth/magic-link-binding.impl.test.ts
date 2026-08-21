import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetPool, mockRedis, mockLogger, mockRenderPage, mockInvalidateUserCache } = vi.hoisted(
  () => ({
    mockGetPool: vi.fn(),
    mockRedis: {
      set: vi.fn(),
      eval: vi.fn(),
    },
    mockLogger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    mockRenderPage: vi.fn(),
    mockInvalidateUserCache: vi.fn(),
  }),
);

vi.mock('../../../src/lib/database.js', () => ({ getPool: mockGetPool }));
vi.mock('../../../src/lib/redis.js', () => ({ getRedis: () => mockRedis }));
vi.mock('../../../src/lib/logger.js', () => ({ logger: mockLogger }));
vi.mock('../../../src/auth/i18n.js', () => ({
  resolveLocale: vi.fn().mockResolvedValue('en'),
  getTranslationFunction: vi.fn().mockReturnValue((key: string) => `translated:${key}`),
}));
vi.mock('../../../src/auth/template-engine.js', () => ({ renderPage: mockRenderPage }));
vi.mock('../../../src/auth/csrf.js', () => ({ generateCsrfToken: () => 'csrf-value' }));
vi.mock('../../../src/users/cache.js', () => ({ invalidateUserCache: mockInvalidateUserCache }));
vi.mock('../../../src/lib/audit-log.js', () => ({ writeAuditLog: vi.fn() }));

import { consumeMagicLinkSession } from '../../../src/auth/magic-link-session.js';
import { consumeAuthorizedMagicLink } from '../../../src/auth/token-repository.js';
import { createMagicLinkRouter } from '../../../src/routes/magic-link.js';
import type { Organization } from '../../../src/organizations/types.js';

/** Durable authority row returned while both the artifact and account are locked. */
const AUTHORIZED_TOKEN_ROW = Object.freeze({
  id: 'token-id',
  user_id: 'user-id',
  token_hash: 'stored-hash',
  expires_at: new Date('2026-12-31T00:00:00.000Z'),
  used_at: null,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  organization_id: 'organization-alpha',
  interaction_uid: 'interaction-alpha',
  account_status: 'active',
});

/** Test organization used by the public route context. */
const TEST_ORGANIZATION: Organization = {
  id: 'organization-alpha',
  name: 'Alpha',
  slug: 'alpha',
  status: 'active',
  isSuperAdmin: false,
  brandingLogoUrl: null,
  brandingFaviconUrl: null,
  brandingPrimaryColor: '#3B82F6',
  brandingCompanyName: 'Alpha',
  brandingCustomCss: null,
  defaultLocale: 'en',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

/** One recorded SQL call used to verify transaction ordering and terminal state. */
interface RecordedQuery {
  /** SQL text passed to the mocked PostgreSQL client. */
  readonly sql: string;
  /** Bound values passed with the query. */
  readonly values: readonly unknown[];
}

/** Build a transaction client that can fail exactly at durable audit insertion. */
function arrangeTransaction(input: { readonly failAudit: boolean }): {
  readonly queries: RecordedQuery[];
  readonly release: ReturnType<typeof vi.fn>;
} {
  const queries: RecordedQuery[] = [];
  const release = vi.fn();
  const query = vi.fn(async (sqlValue: unknown, valuesValue?: readonly unknown[]) => {
    const sql = String(sqlValue);
    const values = valuesValue ?? [];
    queries.push({ sql, values });
    if (sql.includes('SELECT token.id')) {
      return { rows: [AUTHORIZED_TOKEN_ROW], rowCount: 1 };
    }
    if (sql.includes('UPDATE magic_link_tokens')) {
      return { rows: [{ id: AUTHORIZED_TOKEN_ROW.id }], rowCount: 1 };
    }
    if (sql.includes('UPDATE users')) {
      return { rows: [{ id: AUTHORIZED_TOKEN_ROW.user_id }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO audit_log') && input.failAudit) {
      throw new Error('audit sink unavailable');
    }
    return { rows: [], rowCount: 0 };
  });
  mockGetPool.mockReturnValue({
    connect: vi.fn().mockResolvedValue({ query, release }),
  });
  return { queries, release };
}

/** Build the minimum observable context for the public magic-link callback. */
function createPublicContext(): {
  readonly context: Record<string, unknown>;
  readonly cookieValues: Map<string, string>;
  readonly response: { status: number; type: string; redirect: string | null };
} {
  const cookieValues = new Map<string, string>();
  const response = { status: 200, type: '', redirect: null as string | null };
  const context = {
    params: { orgSlug: TEST_ORGANIZATION.slug, token: 'raw-magic-link-token' },
    query: { interaction: 'interaction-alpha' },
    request: { body: {} },
    req: {},
    res: {},
    ip: '127.0.0.1',
    secure: true,
    state: { organization: TEST_ORGANIZATION },
    cookies: {
      get: (name: string) => cookieValues.get(name),
      set: (name: string, value: string) => {
        if (value === '') cookieValues.delete(name);
        else cookieValues.set(name, value);
      },
    },
    get status() {
      return response.status;
    },
    set status(value: number) {
      response.status = value;
    },
    get type() {
      return response.type;
    },
    set type(value: string) {
      response.type = value;
    },
    body: undefined,
    get: () => '',
    set: () => undefined,
    redirect: (location: string) => {
      response.status = 302;
      response.redirect = location;
    },
  };
  return { context, cookieValues, response };
}

/** Invoke only the registered public magic-link route handler. */
async function invokePublicMagicLink(context: Record<string, unknown>): Promise<void> {
  const layer = createMagicLinkRouter().stack.find(
    (candidate) => candidate.methods.includes('GET') && candidate.path.includes('magic-link'),
  );
  const handler = layer?.stack.at(-1);
  if (!handler) throw new Error('Magic-link route handler is unavailable');
  await handler(context as never, async () => undefined);
}

/** Build a cookie context for one Redis continuation token. */
function createContinuationContext(token = 'continuation-token') {
  const values = new Map<string, string>([['_ml_session', token]]);
  return {
    cookies: {
      get: (name: string) => values.get(name),
      set: (name: string, value: string) => {
        if (value === '') values.delete(name);
        else values.set(name, value);
      },
    },
    values,
  };
}

describe('magic-link binding implementation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRenderPage.mockResolvedValue('<html>generic</html>');
    mockInvalidateUserCache.mockResolvedValue(undefined);
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.eval.mockResolvedValue(-2);
  });

  it('should roll back artifact and account mutation when durable audit insertion fails', async () => {
    const transaction = arrangeTransaction({ failAudit: true });

    await expect(
      consumeAuthorizedMagicLink({
        tokenHash: 'presented-hash',
        organizationId: 'organization-alpha',
        interactionUid: 'interaction-alpha',
      }),
    ).rejects.toThrow('audit sink unavailable');

    expect(transaction.queries.map(({ sql }) => sql.trim().split(/\s+/)[0])).toStrictEqual([
      'BEGIN',
      'SELECT',
      'UPDATE',
      'UPDATE',
      'INSERT',
      'ROLLBACK',
    ]);
    expect(transaction.queries.some(({ sql }) => sql === 'COMMIT')).toBe(false);
    expect(transaction.release).toHaveBeenCalledOnce();
  });

  it('should retain the committed artifact consumption when Redis continuation creation fails', async () => {
    const transaction = arrangeTransaction({ failAudit: false });
    mockRedis.set.mockRejectedValue(new Error('Redis continuation unavailable'));
    const request = createPublicContext();

    await invokePublicMagicLink(request.context);

    expect(transaction.queries.map(({ sql }) => sql.trim().split(/\s+/)[0])).toContain('COMMIT');
    expect(transaction.queries.map(({ sql }) => sql.trim().split(/\s+/)[0])).not.toContain(
      'ROLLBACK',
    );
    expect(request.response).toMatchObject({ status: 400, type: 'text/html', redirect: null });
    expect(request.cookieValues.has('_ml_session')).toBe(false);
  });

  it('should allow one result when two exact continuation consumers race', async () => {
    const stored = JSON.stringify({
      userId: 'user-id',
      interactionUid: 'interaction-alpha',
      organizationId: 'organization-alpha',
    });
    let available = true;
    mockRedis.eval.mockImplementation(async () => {
      if (!available) return -2;
      available = false;
      return stored;
    });
    const first = createContinuationContext();
    const second = createContinuationContext();

    const results = await Promise.all([
      consumeMagicLinkSession(first as never, {
        organizationId: 'organization-alpha',
        interactionUid: 'interaction-alpha',
      }),
      consumeMagicLinkSession(second as never, {
        organizationId: 'organization-alpha',
        interactionUid: 'interaction-alpha',
      }),
    ]);

    expect(results.filter((result) => result !== null)).toHaveLength(1);
    expect(mockRedis.eval).toHaveBeenCalledTimes(2);
    expect(String(mockRedis.eval.mock.calls[0]?.[0])).toContain("redis.call('DEL', KEYS[1])");
    expect(first.values.has('_ml_session') || second.values.has('_ml_session')).toBe(false);
  });

  it('should clear an expired continuation cookie without returning session data', async () => {
    mockRedis.eval.mockResolvedValue(-2);
    const context = createContinuationContext('expired-continuation');

    const result = await consumeMagicLinkSession(context as never, {
      organizationId: 'organization-alpha',
      interactionUid: 'interaction-alpha',
    });

    expect(result).toBeNull();
    expect(context.values.has('_ml_session')).toBe(false);
  });

  it('should keep token and interaction values out of operational diagnostics', async () => {
    arrangeTransaction({ failAudit: false });
    mockRedis.set.mockRejectedValue(new Error('Redis continuation unavailable'));
    const request = createPublicContext();

    await invokePublicMagicLink(request.context);

    const diagnostics = JSON.stringify(
      Object.values(mockLogger).flatMap((loggerMethod) => loggerMethod.mock.calls),
    );
    expect(diagnostics).not.toContain('raw-magic-link-token');
    expect(diagnostics).not.toContain('interaction-alpha');
    expect(diagnostics).not.toContain('user-id');
    expect(diagnostics).not.toContain('organization-alpha');
  });
});
