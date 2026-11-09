/** Implementation tests for resource-server Admin concurrency and transactional edges. */

import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';

import { getPool } from '../../../src/lib/database.js';
import { ResourceServerConflictError, ResourceServerNotFoundError } from '../../../src/resource-servers/errors.js';
import {
  createResourceServerForApplication,
  deleteResourceServerForApplication,
  listResourceServersForApplication,
  updateResourceServerForApplication,
} from '../../../src/resource-servers/service.js';
import type { Application } from '../../../src/applications/types.js';
import { createTestApplication } from '../helpers/factories.js';
import { seedBaseData, truncateAllTables } from '../helpers/database.js';
import { flushTestRedis } from '../helpers/redis.js';

describe('resource-server Admin implementation edges', () => {
  let application: Application;

  beforeEach(async () => {
    await truncateAllTables();
    await seedBaseData();
    await flushTestRedis();
    application = await createTestApplication({
      name: 'Concurrency App',
      slug: `concurrency-${randomUUID().slice(0, 8)}`,
    });
  });

  it('serializes concurrent creates with the same identifier into one success and one conflict', async () => {
    const identifier = `https://concurrent-${randomUUID()}.example.test`;
    const input = { name: 'Concurrent API', identifier };

    const results = await Promise.allSettled([
      createResourceServerForApplication(application.id, input),
      createResourceServerForApplication(application.id, input),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.status).toBe('rejected');
    if (rejected?.status === 'rejected') {
      expect(rejected.reason).toBeInstanceOf(ResourceServerConflictError);
    }
  });

  it('serializes concurrent scope replacements without leaving a partial registry', async () => {
    const created = await createResourceServerForApplication(application.id, {
      name: 'Concurrent API',
      identifier: `https://concurrent-${randomUUID()}.example.test`,
    });

    const results = await Promise.allSettled([
      updateResourceServerForApplication(application.id, created.id, {
        name: created.name,
        slug: created.slug,
        identifier: created.identifier,
        scopes: ['billing:read'],
      }),
      updateResourceServerForApplication(application.id, created.id, {
        name: created.name,
        slug: created.slug,
        identifier: created.identifier,
        scopes: ['billing:write'],
      }),
    ]);
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);

    const [listed] = await listResourceServersForApplication(application.id);
    expect([['billing:read'], ['billing:write']]).toContainEqual([...listed.scopes]);
  });

  it('allows only one concurrent delete and leaves no row behind', async () => {
    const created = await createResourceServerForApplication(application.id, {
      name: 'Concurrent API',
      identifier: `https://concurrent-${randomUUID()}.example.test`,
    });

    const results = await Promise.allSettled([
      deleteResourceServerForApplication(application.id, created.id),
      deleteResourceServerForApplication(application.id, created.id),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.status).toBe('rejected');
    if (rejected?.status === 'rejected') {
      expect(rejected.reason).toBeInstanceOf(ResourceServerNotFoundError);
    }
    const remaining = await getPool().query('SELECT id FROM resource_servers WHERE id = $1', [created.id]);
    expect(remaining.rows).toHaveLength(0);
  });
});
