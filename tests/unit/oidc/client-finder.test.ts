import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/lib/database.js', () => ({
  getPool: vi.fn(),
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { getPool } from '../../../src/lib/database.js';
import { findClientByClientId } from '../../../src/oidc/client-finder.js';

function mockPool(rows: Record<string, unknown>[] = []) {
  const mockQuery = vi.fn().mockResolvedValue({ rows });
  (getPool as ReturnType<typeof vi.fn>).mockReturnValue({ query: mockQuery });
  return mockQuery;
}

const sampleClient = {
  client_id: 'client-123',
  client_name: 'Test App',
  application_type: 'web',
  redirect_uris: ['http://localhost:3000/callback'],
  post_logout_redirect_uris: ['http://localhost:3000'],
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  scope: 'openid profile email',
  token_endpoint_auth_method: 'none',
  allowed_origins: ['http://localhost:3000'],
};

describe('client-finder', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns client metadata for active client', async () => {
    mockPool([sampleClient]);
    const result = await findClientByClientId('client-123');
    expect(result).toBeDefined();
    expect(result!.client_id).toBe('client-123');
    expect(result!.client_name).toBe('Test App');
  });

  it('returns undefined for missing client', async () => {
    mockPool([]);
    const result = await findClientByClientId('nonexistent');
    expect(result).toBeUndefined();
  });

  it('maps all OIDC fields correctly', async () => {
    mockPool([sampleClient]);
    const result = await findClientByClientId('client-123');
    expect(result!.redirect_uris).toEqual(['http://localhost:3000/callback']);
    expect(result!.grant_types).toEqual(['authorization_code', 'refresh_token']);
    expect(result!.response_types).toEqual(['code']);
    expect(result!.scope).toBe('openid profile email');
    expect(result!.allowed_origins).toEqual(['http://localhost:3000']);
  });

  it('returns undefined on DB error', async () => {
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue({
      query: vi.fn().mockRejectedValue(new Error('db error')),
    });
    const result = await findClientByClientId('client-123');
    expect(result).toBeUndefined();
  });
});
