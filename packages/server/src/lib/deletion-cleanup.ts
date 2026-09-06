import { afterDatabaseCommit } from './database.js';
import { logger } from './logger.js';
import { getRedis } from './redis.js';

/** OIDC models currently stored beneath the Redis adapter namespace. */
const REDIS_OIDC_MODELS = [
  'Session',
  'Interaction',
  'AuthorizationCode',
  'ReplayDetection',
  'ClientCredentials',
  'PushedAuthorizationRequest',
] as const;

const REDIS_OIDC_MODEL_SET = new Set<string>(REDIS_OIDC_MODELS);

/** Atomically remove a reusable slug key only while it still names the deleted record. */
const DELETE_MATCHING_SLUG = `
local value = redis.call('GET', KEYS[1])
if not value then return 0 end
local ok, decoded = pcall(cjson.decode, value)
if ok and decoded['id'] == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

/** Immutable identifiers needed to remove stale cache state after a committed deletion. */
export interface DeletionCleanupDescriptor {
  readonly resource:
    'organization' | 'application' | 'module' | 'client' | 'role' | 'permission' | 'claim' | 'user';
  readonly targetId: string;
  readonly targetSlug?: string;
  readonly parentId?: string;
  readonly userIds: readonly string[];
  readonly clientIds: readonly string[];
  readonly publicClientIds: readonly string[];
  readonly grantIds: readonly string[];
  readonly roleIds: readonly string[];
  readonly permissionIds: readonly string[];
  readonly claimIds: readonly string[];
  readonly applicationIds: readonly string[];
}

/** Return true when a decoded payload is safe to inspect by field name. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Test one optional string field against a captured identifier set. */
function hasReference(values: ReadonlySet<string>, value: unknown): boolean {
  return typeof value === 'string' && values.has(value);
}

/** Determine whether an OIDC payload references authority removed by the deletion. */
function referencesDeletedAuthority(
  payload: Record<string, unknown>,
  clientIds: ReadonlySet<string>,
  grantIds: ReadonlySet<string>,
  userIds: ReadonlySet<string>,
): boolean {
  if (
    hasReference(clientIds, payload.clientId) ||
    hasReference(grantIds, payload.grantId) ||
    hasReference(userIds, payload.accountId)
  ) {
    return true;
  }

  if (!isRecord(payload.authorizations)) return false;
  return Object.entries(payload.authorizations).some(
    ([clientId, authorization]) =>
      clientIds.has(clientId) ||
      (isRecord(authorization) && hasReference(grantIds, authorization.grantId)),
  );
}

/** Build the exact cache and grant-index keys represented by a deletion descriptor. */
function exactKeys(descriptor: DeletionCleanupDescriptor): string[] {
  const keys = new Set<string>();

  if (descriptor.resource === 'organization') keys.add(`org:id:${descriptor.targetId}`);
  if (descriptor.resource === 'application') {
    keys.add(`app:id:${descriptor.targetId}`);
    keys.add(`claims:defs:${descriptor.targetId}`);
  }
  if (descriptor.resource === 'claim') {
    for (const applicationId of descriptor.applicationIds) {
      keys.add(`claims:defs:${applicationId}`);
    }
  }

  for (const id of descriptor.clientIds) keys.add(`client:id:${id}`);
  for (const id of descriptor.publicClientIds) keys.add(`client:cid:${id}`);
  for (const id of descriptor.roleIds) keys.add(`rbac:role:${id}`);
  for (const id of descriptor.userIds) {
    keys.add(`user:id:${id}`);
    keys.add(`rbac:user-roles:${id}`);
    keys.add(`rbac:user-perms:${id}`);
  }
  for (const model of REDIS_OIDC_MODELS) {
    for (const grantId of descriptor.grantIds) {
      keys.add(`oidc:${model}:grant:${grantId}`);
    }
  }

  return [...keys];
}

/** Read one JSON payload without allowing malformed Redis data to stop cleanup. */
function parsePayload(value: string | null): Record<string, unknown> | null {
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Remove matching OIDC main payloads and the indexes derivable from those payloads. */
async function scanOidcPayloads(descriptor: DeletionCleanupDescriptor): Promise<void> {
  const redis = getRedis();
  const clientIds = new Set(descriptor.publicClientIds);
  const grantIds = new Set(descriptor.grantIds);
  const userIds = new Set(descriptor.userIds);
  let cursor = '0';

  do {
    const [nextCursor, candidates] = await redis.scan(
      cursor,
      'MATCH',
      'oidc:*',
      'COUNT',
      100,
    );
    cursor = nextCursor;

    const mainKeys = candidates.filter((key) => {
      const parts = key.split(':');
      return parts.length === 3 && parts[0] === 'oidc' && REDIS_OIDC_MODEL_SET.has(parts[1]);
    });
    if (mainKeys.length === 0) continue;

    const payloads = await redis.mget(...mainKeys);
    const keysToDelete = new Set<string>();
    for (let index = 0; index < mainKeys.length; index += 1) {
      const payload = parsePayload(payloads[index] ?? null);
      if (!payload || !referencesDeletedAuthority(payload, clientIds, grantIds, userIds)) continue;

      const mainKey = mainKeys[index];
      const model = mainKey.split(':')[1];
      keysToDelete.add(mainKey);
      if (typeof payload.uid === 'string') keysToDelete.add(`oidc:${model}:uid:${payload.uid}`);
      if (typeof payload.userCode === 'string') {
        keysToDelete.add(`oidc:${model}:user_code:${payload.userCode}`);
      }
    }
    if (keysToDelete.size > 0) await redis.del(...keysToDelete);
  } while (cursor !== '0');
}

/** Execute the single best-effort Redis cleanup pass for a committed deletion. */
async function cleanupDeletionRedis(descriptor: DeletionCleanupDescriptor): Promise<void> {
  const redis = getRedis();
  const keys = exactKeys(descriptor);
  if (keys.length > 0) await redis.del(...keys);

  if (descriptor.targetSlug && descriptor.resource === 'organization') {
    await redis.eval(
      DELETE_MATCHING_SLUG,
      1,
      `org:slug:${descriptor.targetSlug}`,
      descriptor.targetId,
    );
  }
  if (descriptor.targetSlug && descriptor.resource === 'application') {
    await redis.eval(
      DELETE_MATCHING_SLUG,
      1,
      `app:slug:${descriptor.targetSlug}`,
      descriptor.targetId,
    );
  }

  await scanOidcPayloads(descriptor);
}

/**
 * Register immutable cleanup input on the current transaction's post-commit boundary.
 * The hook schedules one detached Redis pass and returns without waiting for cache I/O.
 *
 * @param descriptor - Identifiers captured before the database cascade.
 */
export async function registerDeletionCleanup(
  descriptor: DeletionCleanupDescriptor,
): Promise<void> {
  const immutable = Object.freeze({
    ...descriptor,
    userIds: Object.freeze([...descriptor.userIds]),
    clientIds: Object.freeze([...descriptor.clientIds]),
    publicClientIds: Object.freeze([...descriptor.publicClientIds]),
    grantIds: Object.freeze([...descriptor.grantIds]),
    roleIds: Object.freeze([...descriptor.roleIds]),
    permissionIds: Object.freeze([...descriptor.permissionIds]),
    claimIds: Object.freeze([...descriptor.claimIds]),
    applicationIds: Object.freeze([...descriptor.applicationIds]),
  });
  await afterDatabaseCommit(async () => {
    setImmediate(() => {
      void cleanupDeletionRedis(immutable).catch(() => {
        logger.warn({ event: 'deletion-redis-cleanup-failed' }, 'Deletion Redis cleanup failed');
      });
    });
  });
}
