import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dotenv/config to prevent loading .env during tests
vi.mock('dotenv/config', () => ({}));

// Mock database module — vi.mock factories are hoisted, so use inline objects
vi.mock('../../../src/lib/database.js', () => ({
  connectDatabase: vi.fn().mockResolvedValue(undefined),
  disconnectDatabase: vi.fn().mockResolvedValue(undefined),
}));

// Mock redis module
vi.mock('../../../src/lib/redis.js', () => ({
  connectRedis: vi.fn().mockResolvedValue(undefined),
  disconnectRedis: vi.fn().mockResolvedValue(undefined),
}));

import { bootstrap, shutdown, withBootstrap } from '../../../src/cli/bootstrap.js';
import { connectDatabase, disconnectDatabase } from '../../../src/lib/database.js';
import { connectRedis, disconnectRedis } from '../../../src/lib/redis.js';
import type { GlobalOptions } from '../../../src/cli/index.js';

/** Create default GlobalOptions test fixture with all flags disabled */
function createDefaultArgv(overrides: Partial<GlobalOptions> = {}): GlobalOptions {
  return {
    json: false,
    verbose: false,
    force: false,
    'dry-run': false,
    ...overrides,
  };
}

describe('CLI Bootstrap', () => {
  // Save original env vars so we can restore after each test
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default mock implementations (clearAllMocks clears call history
    // but does NOT reset mockReturnValue/mockResolvedValue overrides)
    vi.mocked(connectDatabase).mockResolvedValue(undefined as never);
    vi.mocked(disconnectDatabase).mockResolvedValue(undefined);
    vi.mocked(connectRedis).mockResolvedValue(undefined as never);
    vi.mocked(disconnectRedis).mockResolvedValue(undefined);
  });

  afterEach(() => {
    // Restore original env vars to avoid test pollution
    if (originalDatabaseUrl !== undefined) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
    if (originalRedisUrl !== undefined) {
      process.env.REDIS_URL = originalRedisUrl;
    } else {
      delete process.env.REDIS_URL;
    }
  });

  describe('bootstrap()', () => {
    it('should connect to database and redis', async () => {
      const argv = createDefaultArgv();

      await bootstrap(argv);

      expect(connectDatabase).toHaveBeenCalledOnce();
      expect(connectRedis).toHaveBeenCalledOnce();
    });

    it('should connect database before redis', async () => {
      const callOrder: string[] = [];
      vi.mocked(connectDatabase).mockImplementation(async () => {
        callOrder.push('database');
        return undefined as never;
      });
      vi.mocked(connectRedis).mockImplementation(async () => {
        callOrder.push('redis');
        return undefined as never;
      });

      await bootstrap(createDefaultArgv());

      expect(callOrder).toEqual(['database', 'redis']);
    });

    it('should override DATABASE_URL when --database-url flag is provided', async () => {
      const customUrl = 'postgresql://custom-host:5432/testdb';
      const argv = createDefaultArgv({ 'database-url': customUrl });

      await bootstrap(argv);

      expect(process.env.DATABASE_URL).toBe(customUrl);
      expect(connectDatabase).toHaveBeenCalledOnce();
    });

    it('should override REDIS_URL when --redis-url flag is provided', async () => {
      const customUrl = 'redis://custom-host:6379';
      const argv = createDefaultArgv({ 'redis-url': customUrl });

      await bootstrap(argv);

      expect(process.env.REDIS_URL).toBe(customUrl);
      expect(connectRedis).toHaveBeenCalledOnce();
    });

    it('should override both URLs when both flags are provided', async () => {
      const dbUrl = 'postgresql://db-host:5432/porta';
      const redisUrl = 'redis://redis-host:6379';
      const argv = createDefaultArgv({
        'database-url': dbUrl,
        'redis-url': redisUrl,
      });

      await bootstrap(argv);

      expect(process.env.DATABASE_URL).toBe(dbUrl);
      expect(process.env.REDIS_URL).toBe(redisUrl);
    });

    it('should not modify env vars when no URL flags are provided', async () => {
      process.env.DATABASE_URL = 'postgresql://original/db';
      process.env.REDIS_URL = 'redis://original:6379';

      await bootstrap(createDefaultArgv());

      expect(process.env.DATABASE_URL).toBe('postgresql://original/db');
      expect(process.env.REDIS_URL).toBe('redis://original:6379');
    });

    it('should propagate database connection errors', async () => {
      vi.mocked(connectDatabase).mockRejectedValue(new Error('Connection refused'));

      await expect(bootstrap(createDefaultArgv())).rejects.toThrow('Connection refused');
    });

    it('should propagate redis connection errors', async () => {
      vi.mocked(connectRedis).mockRejectedValue(new Error('Redis timeout'));

      await expect(bootstrap(createDefaultArgv())).rejects.toThrow('Redis timeout');
    });
  });

  describe('shutdown()', () => {
    it('should disconnect redis and database', async () => {
      await shutdown();

      expect(disconnectRedis).toHaveBeenCalledOnce();
      expect(disconnectDatabase).toHaveBeenCalledOnce();
    });

    it('should disconnect redis before database', async () => {
      // Redis disconnects first because cache flush may need DB
      const callOrder: string[] = [];
      vi.mocked(disconnectRedis).mockImplementation(async () => {
        callOrder.push('redis');
      });
      vi.mocked(disconnectDatabase).mockImplementation(async () => {
        callOrder.push('database');
      });

      await shutdown();

      expect(callOrder).toEqual(['redis', 'database']);
    });

    it('should propagate disconnect errors', async () => {
      vi.mocked(disconnectRedis).mockRejectedValue(new Error('Redis disconnect failed'));

      await expect(shutdown()).rejects.toThrow('Redis disconnect failed');
    });
  });

  describe('withBootstrap()', () => {
    it('should bootstrap, run function, then shutdown', async () => {
      const callOrder: string[] = [];
      vi.mocked(connectDatabase).mockImplementation(async () => {
        callOrder.push('connect-db');
        return undefined as never;
      });
      vi.mocked(connectRedis).mockImplementation(async () => {
        callOrder.push('connect-redis');
        return undefined as never;
      });
      vi.mocked(disconnectRedis).mockImplementation(async () => {
        callOrder.push('disconnect-redis');
      });
      vi.mocked(disconnectDatabase).mockImplementation(async () => {
        callOrder.push('disconnect-db');
      });

      const fn = vi.fn(async () => {
        callOrder.push('command');
        return 'result';
      });

      const result = await withBootstrap(createDefaultArgv(), fn);

      expect(result).toBe('result');
      expect(callOrder).toEqual([
        'connect-db',
        'connect-redis',
        'command',
        'disconnect-redis',
        'disconnect-db',
      ]);
    });

    it('should return the result of the command function', async () => {
      const result = await withBootstrap(createDefaultArgv(), async () => ({
        count: 42,
        items: ['a', 'b'],
      }));

      expect(result).toEqual({ count: 42, items: ['a', 'b'] });
    });

    it('should shutdown even when command function throws', async () => {
      const error = new Error('Command failed');

      await expect(
        withBootstrap(createDefaultArgv(), async () => {
          throw error;
        }),
      ).rejects.toThrow('Command failed');

      // Shutdown should still be called via finally block
      expect(disconnectRedis).toHaveBeenCalledOnce();
      expect(disconnectDatabase).toHaveBeenCalledOnce();
    });

    it('should pass argv to bootstrap for URL overrides', async () => {
      const dbUrl = 'postgresql://override:5432/db';
      const argv = createDefaultArgv({ 'database-url': dbUrl });

      await withBootstrap(argv, async () => undefined);

      expect(process.env.DATABASE_URL).toBe(dbUrl);
    });
  });
});
