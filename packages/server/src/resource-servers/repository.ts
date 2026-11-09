/**
 * Resource-server Admin repository.
 *
 * All queries are parameterized. The resource-server row is the lock owner for definition and
 * scope changes; the existing namespace trigger and unique constraints arbitrate cross-application
 * identifier/audience collisions.
 */

import { getPool } from '../lib/database.js';
import {
  mapResourceServerRow,
  type NormalizedResourceServerInput,
  type ResourceServer,
  type ResourceServerRow,
} from './types.js';

/** UUID shape used to choose the internal id lookup instead of the application-local slug. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** List one application's resource servers with their sorted scope registries. */
export async function listResourceServers(applicationId: string): Promise<ResourceServer[]> {
  const result = await getPool().query<ResourceServerRow>(
    `SELECT resource.id, resource.application_id, resource.slug, resource.name,
            resource.identifier, resource.audience, resource.created_at, resource.updated_at,
            COALESCE(array_agg(scope.scope ORDER BY scope.scope)
              FILTER (WHERE scope.scope IS NOT NULL), '{}') AS scopes
       FROM resource_servers resource
       LEFT JOIN resource_server_scopes scope ON scope.resource_server_id = resource.id
      WHERE resource.application_id = $1
      GROUP BY resource.id
      ORDER BY resource.name ASC, resource.identifier ASC`,
    [applicationId],
  );
  return result.rows.map(mapResourceServerRow);
}

/**
 * Find one application-owned resource server by UUID or application-local slug.
 *
 * @param applicationId - Owning application UUID.
 * @param idOrSlug - Resource-server UUID or slug.
 * @param lock - Lock the parent row for a mutation inside the request transaction.
 */
export async function findResourceServer(
  applicationId: string,
  idOrSlug: string,
  lock = false,
): Promise<ResourceServer | null> {
  const column = UUID.test(idOrSlug) ? 'resource.id' : 'resource.slug';
  const result = await getPool().query<ResourceServerRow>(
    `SELECT resource.id, resource.application_id, resource.slug, resource.name,
            resource.identifier, resource.audience, resource.created_at, resource.updated_at,
            COALESCE((
              SELECT array_agg(scope.scope ORDER BY scope.scope)
                FROM resource_server_scopes scope
               WHERE scope.resource_server_id = resource.id
            ), '{}') AS scopes
       FROM resource_servers resource
      WHERE resource.application_id = $1 AND ${column} = $2
      ${lock ? 'FOR UPDATE' : ''}`,
    [applicationId, idOrSlug],
  );
  const row = result.rows[0];
  return row ? mapResourceServerRow(row) : null;
}

/** Insert one resource server and its custom scopes. */
export async function insertResourceServer(
  applicationId: string,
  data: NormalizedResourceServerInput,
): Promise<ResourceServer> {
  const result = await getPool().query<ResourceServerRow>(
    `INSERT INTO resource_servers (application_id, slug, name, identifier, audience)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, application_id, slug, name, identifier, audience, created_at, updated_at`,
    [applicationId, data.slug, data.name, data.identifier, data.audience],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Resource server insert returned no row');

  await replaceResourceServerScopes(row.id, data.scopes);
  return mapResourceServerRow({ ...row, scopes: [...data.scopes] });
}

/** Raw row returned by an update; the service supplies the replacement scopes. */
type ResourceServerMutationRow = Omit<ResourceServerRow, 'scopes'>;

/** Update the parent definition and return the raw row. */
export async function updateResourceServerRow(
  resourceServerId: string,
  data: NormalizedResourceServerInput,
): Promise<ResourceServerMutationRow> {
  const result = await getPool().query<ResourceServerMutationRow>(
    `UPDATE resource_servers
        SET name = $2, slug = $3, identifier = $4, audience = $5
      WHERE id = $1
      RETURNING id, application_id, slug, name, identifier, audience, created_at, updated_at`,
    [resourceServerId, data.name, data.slug, data.identifier, data.audience],
  );
  const row = result.rows[0];
  if (!row) throw new Error('Resource server update returned no row');
  return row;
}

/** Replace the complete custom scope registry in the current transaction. */
export async function replaceResourceServerScopes(
  resourceServerId: string,
  scopes: readonly string[],
): Promise<void> {
  await getPool().query('DELETE FROM resource_server_scopes WHERE resource_server_id = $1', [
    resourceServerId,
  ]);
  if (scopes.length === 0) return;
  await getPool().query(
    `INSERT INTO resource_server_scopes (resource_server_id, scope)
     SELECT $1, unnest($2::text[])`,
    [resourceServerId, [...scopes]],
  );
}

/** Delete one resource-server row; foreign keys and the namespace trigger cascade. */
export async function deleteResourceServerRow(resourceServerId: string): Promise<void> {
  await getPool().query('DELETE FROM resource_servers WHERE id = $1', [resourceServerId]);
}
