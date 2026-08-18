import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

import { logger } from '../../../src/lib/logger.js';
import { errorHandler } from '../../../src/middleware/error-handler.js';
import { requestLogger } from '../../../src/middleware/request-logger.js';

const SECRET_QUERY =
  'code=authorization-code&state=state-value&nonce=nonce-value&code_challenge=pkce-value&login_hint=person%40example.test';

function context(): Record<string, unknown> {
  return {
    req: {},
    status: 500,
    body: undefined,
    method: 'GET',
    path: '/alpha/authorize',
    url: `/alpha/authorize?${SECRET_QUERY}`,
    state: {},
    set: vi.fn(),
  };
}

describe('request log privacy', () => {
  it('records only the path in ordinary request logs', async () => {
    vi.mocked(logger.info).mockClear();
    const requestContext = context();

    await requestLogger()(requestContext as never, vi.fn().mockResolvedValue(undefined));

    const serialized = JSON.stringify(vi.mocked(logger.info).mock.calls);
    expect(serialized).toContain('/alpha/authorize');
    expect(serialized).not.toContain('authorization-code');
    expect(serialized).not.toContain('person%40example.test');
  });

  it('records only the path when an unhandled error is logged', async () => {
    vi.mocked(logger.error).mockClear();
    const requestContext = context();

    await errorHandler()(requestContext as never, vi.fn().mockRejectedValue(new Error('failure')));

    const serialized = JSON.stringify(vi.mocked(logger.error).mock.calls);
    expect(serialized).toContain('/alpha/authorize');
    expect(serialized).not.toContain('authorization-code');
    expect(serialized).not.toContain('person%40example.test');
  });
});
