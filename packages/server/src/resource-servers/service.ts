/**
 * Resource-server Admin service.
 *
 * Resolves the owning application, applies slug and audience defaults, and owns the transactional
 * create/update/delete boundary. Provider resolution is intentionally not called here.
 */

import { ApplicationNotFoundError } from '../applications/errors.js';
import { getApplicationById, getApplicationBySlug } from '../applications/service.js';
import { generateSlug, validateSlug } from '../applications/slugs.js';
import { runDatabaseTransaction } from '../lib/database.js';
import {
  ResourceServerConflictError,
  ResourceServerNotFoundError,
  ResourceServerValidationError,
} from './errors.js';
import {
  deleteResourceServerRow,
  findResourceServer,
  insertResourceServer,
  listResourceServers,
  replaceResourceServerScopes,
  updateResourceServerRow,
} from './repository.js';
import type {
  CreateResourceServerInput,
  ResourceServer,
  UpdateResourceServerInput,
} from './types.js';
import { mapResourceServerRow } from './types.js';
import { normalizeScopes } from './validators.js';

/** UUID shape used to choose id lookup over slug lookup. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Detect PostgreSQL's unique-constraint violation without exposing the SQL error. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    Reflect.get(error, 'code') === '23505'
  );
}

/** Detect a database CHECK violation so a defensive mismatch returns 400 instead of 503. */
function isCheckViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    Reflect.get(error, 'code') === '23514'
  );
}

/** Resolve an application by UUID or slug, or throw the existing application 404 error. */
async function resolveApplication(appIdOrSlug: string) {
  const application = UUID.test(appIdOrSlug)
    ? await getApplicationById(appIdOrSlug)
    : await getApplicationBySlug(appIdOrSlug);
  if (!application) throw new ApplicationNotFoundError(appIdOrSlug);
  return application;
}

/** Build normalized persistence input and validate an explicitly or automatically selected slug. */
function normalizeInput(
  input: CreateResourceServerInput | UpdateResourceServerInput,
  slug: string,
) {
  const validation = validateSlug(slug);
  if (!validation.isValid) {
    throw new ResourceServerValidationError(validation.error ?? 'Resource server slug is invalid');
  }
  if (UUID.test(slug)) {
    throw new ResourceServerValidationError('Resource server slug must not look like a UUID');
  }
  return {
    name: input.name,
    slug,
    identifier: input.identifier,
    audience: input.audience ?? input.identifier,
    scopes: normalizeScopes(input.scopes),
  };
}

/** List resource servers for one application. */
export async function listResourceServersForApplication(
  appIdOrSlug: string,
): Promise<ResourceServer[]> {
  const application = await resolveApplication(appIdOrSlug);
  return listResourceServers(application.id);
}

/** Get one resource server owned by the application. */
export async function getResourceServerForApplication(
  appIdOrSlug: string,
  idOrSlug: string,
): Promise<ResourceServer> {
  const application = await resolveApplication(appIdOrSlug);
  const resourceServer = await findResourceServer(application.id, idOrSlug);
  if (!resourceServer) throw new ResourceServerNotFoundError();
  return resourceServer;
}

/** Create one resource server and its custom scopes. */
export async function createResourceServerForApplication(
  appIdOrSlug: string,
  input: CreateResourceServerInput,
): Promise<ResourceServer> {
  const application = await resolveApplication(appIdOrSlug);
  const slug = input.slug ?? generateSlug(input.name);
  const data = normalizeInput(input, slug);
  try {
    return await runDatabaseTransaction(() => insertResourceServer(application.id, data));
  } catch (error) {
    if (isUniqueViolation(error)) throw new ResourceServerConflictError();
    if (isCheckViolation(error)) {
      throw new ResourceServerValidationError('Resource server request is invalid');
    }
    throw error;
  }
}

/** Replace one resource server definition and its complete scope registry. */
export async function updateResourceServerForApplication(
  appIdOrSlug: string,
  idOrSlug: string,
  input: UpdateResourceServerInput,
): Promise<ResourceServer> {
  const application = await resolveApplication(appIdOrSlug);
  const data = normalizeInput(input, input.slug);
  try {
    return await runDatabaseTransaction(async () => {
      const existing = await findResourceServer(application.id, idOrSlug, true);
      if (!existing) throw new ResourceServerNotFoundError();
      const row = await updateResourceServerRow(existing.id, data);
      await replaceResourceServerScopes(existing.id, data.scopes);
      return mapResourceServerRow({ ...row, scopes: [...data.scopes] });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ResourceServerConflictError();
    if (isCheckViolation(error)) {
      throw new ResourceServerValidationError('Resource server request is invalid');
    }
    throw error;
  }
}

/** Hard-delete one resource server; foreign keys and the namespace trigger cascade. */
export async function deleteResourceServerForApplication(
  appIdOrSlug: string,
  idOrSlug: string,
): Promise<void> {
  const application = await resolveApplication(appIdOrSlug);
  await runDatabaseTransaction(async () => {
    const existing = await findResourceServer(application.id, idOrSlug, true);
    if (!existing) throw new ResourceServerNotFoundError();
    await deleteResourceServerRow(existing.id);
  });
}
