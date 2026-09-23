import { describe, it, expect, vi, beforeEach } from 'vitest';

// The pool-error regression: a broken idle PostgreSQL connection emits an
// `error` event on the pool. Before the fix this event was unhandled and
// terminated the Node process, which forced an exact Porta restart after a
// database outage. This suite pins the handler that keeps the process alive.
const { mockOn, mockConnect, mockEnd, mockQuery, mockRelease, mockLoggerError } = vi.hoisted(
  () => ({
    mockOn: vi.fn(),
    mockConnect: vi.fn(),
    mockEnd: vi.fn(),
    mockQuery: vi.fn(),
    mockRelease: vi.fn(),
    mockLoggerError: vi.fn(),
  }),
);

vi.mock('pg', () => ({
  Pool: class {
    on = mockOn;
    connect = mockConnect;
    end = mockEnd;
  },
}));

vi.mock('../../../src/config/index.js', () => ({
  config: { databaseUrl: 'postgresql://porta:porta_dev@localhost:5432/porta_test' },
}));

vi.mock('../../../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: mockLoggerError,
    warn: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

import { connectDatabase, disconnectDatabase } from '../../../src/lib/database.js';

describe('database pool error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue({ query: mockQuery, release: mockRelease });
    mockQuery.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    mockEnd.mockResolvedValue(undefined);
  });

  it('registers an error handler that keeps the process alive and logs the event', async () => {
    await connectDatabase();

    const registered = mockOn.mock.calls.find(([event]) => event === 'error');
    expect(registered, 'connectDatabase must register a pool error handler').toBeDefined();

    const handler = registered?.[1] as (error: Error) => void;
    expect(() =>
      handler(new Error('terminating connection due to administrator command')),
    ).not.toThrow();
    expect(mockLoggerError).toHaveBeenCalledWith(
      { event: 'database-pool-error' },
      'Database pool connection failed',
    );

    await disconnectDatabase();
  });
});
