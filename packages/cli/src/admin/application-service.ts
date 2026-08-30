/** Validated SDK boundary for deployment-global application administration. */

import {
  PortaAuthenticationError,
  PortaConflictError,
  PortaForbiddenError,
  PortaValidationError,
} from '@portaidentity/sdk';
import type {
  ApplicationsDomain,
  CreateApplicationInput,
  CreateModuleInput,
  UpdateApplicationInput,
  UpdateModuleInput,
} from '@portaidentity/sdk';
import type {
  AdminApplication,
  AdminApplicationModule,
  AdminApplicationMutationResult,
  AdminApplicationReadResult,
} from './application-state.js';

export type * from './application-state.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/** Returns true when text contains a terminal control character. */
function containsTerminalControl(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) return true;
  }
  return false;
}

/** Validates bounded text retained by the terminal. */
function isText(value: unknown, maximum: number, minimum = 0): value is string {
  return (
    typeof value === 'string' &&
    value.length >= minimum &&
    value.length <= maximum &&
    !containsTerminalControl(value)
  );
}

/** Validates an ISO timestamp used only for display. */
function isTimestamp(value: unknown): value is string {
  if (
    !isText(value, 40, 20) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(value)
  ) {
    return false;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 19) === value.slice(0, 19);
}

/** Validates an optional bounded, control-free HTTP entity tag. */
function isEtag(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && /^W\/"[0-9a-f]{16}"$/.test(value));
}

/** Returns true for a non-array object that can be inspected by field name. */
function isObjectValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Returns an object-shaped untrusted value. */
function objectValue(value: unknown): Record<string, unknown> | undefined {
  return isObjectValue(value) ? value : undefined;
}

/** Projects one complete global application or rejects it. */
function applicationValue(value: unknown): AdminApplication | undefined {
  const candidate = objectValue(value);
  if (
    !candidate ||
    typeof candidate.id !== 'string' ||
    !UUID.test(candidate.id) ||
    !isText(candidate.name, 255, 1) ||
    !isText(candidate.slug, 100, 3) ||
    !SLUG.test(candidate.slug) ||
    !(candidate.description === null || isText(candidate.description, 2_000)) ||
    !(
      candidate.status === 'active' ||
      candidate.status === 'inactive' ||
      candidate.status === 'archived'
    ) ||
    !isTimestamp(candidate.createdAt) ||
    !isTimestamp(candidate.updatedAt)
  ) {
    return undefined;
  }
  return Object.freeze({
    id: candidate.id,
    name: candidate.name,
    slug: candidate.slug,
    description: candidate.description,
    status: candidate.status,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  });
}

/** Projects one complete module and verifies its nested parent. */
function moduleValue(value: unknown, applicationId: string): AdminApplicationModule | undefined {
  const candidate = objectValue(value);
  if (
    !candidate ||
    typeof candidate.id !== 'string' ||
    !UUID.test(candidate.id) ||
    candidate.applicationId !== applicationId ||
    !isText(candidate.name, 255, 1) ||
    !isText(candidate.slug, 100, 3) ||
    !SLUG.test(candidate.slug) ||
    !(candidate.description === null || isText(candidate.description, 2_000)) ||
    !(candidate.status === 'active' || candidate.status === 'inactive') ||
    !isTimestamp(candidate.createdAt) ||
    !isTimestamp(candidate.updatedAt)
  ) {
    return undefined;
  }
  return Object.freeze({
    id: candidate.id,
    applicationId,
    name: candidate.name,
    slug: candidate.slug,
    description: candidate.description,
    status: candidate.status,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
  });
}

/** Projects a complete collection without returning partial values. */
function collection<T>(
  value: unknown,
  project: (entry: unknown) => T | undefined,
): readonly T[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const ids = new Set<string>();
  const projected: T[] = [];
  for (const entry of value) {
    const item = project(entry);
    const candidate = objectValue(item);
    if (!item || !candidate || typeof candidate.id !== 'string' || ids.has(candidate.id)) {
      return undefined;
    }
    ids.add(candidate.id);
    projected.push(item);
  }
  return Object.freeze(projected);
}

/** Maps a read error to a fixed safe result. */
function readError(error: unknown): AdminApplicationReadResult<never> {
  if (error instanceof PortaAuthenticationError) return { kind: 'session-invalid' };
  if (error instanceof PortaValidationError) return { kind: 'failure', failure: 'validation' };
  if (error instanceof PortaForbiddenError) return { kind: 'failure', failure: 'unauthorized' };
  if (error instanceof PortaConflictError) return { kind: 'failure', failure: 'conflict' };
  return { kind: 'failure', failure: 'unavailable' };
}

/** Maps a mutation error to a fixed safe result. */
function mutationError(
  error: unknown,
): Exclude<AdminApplicationMutationResult, { kind: 'success' }> {
  if (error instanceof DOMException && error.name === 'AbortError') return { kind: 'cancelled' };
  if (error instanceof PortaAuthenticationError) return { kind: 'session-invalid' };
  if (error instanceof PortaValidationError) return { kind: 'failure', failure: 'validation' };
  if (error instanceof PortaForbiddenError) return { kind: 'failure', failure: 'unauthorized' };
  if (error instanceof PortaConflictError) return { kind: 'failure', failure: 'conflict' };
  return { kind: 'outcome-unknown' };
}

/** Exact application operations consumed by controllers and later views. */
export interface AdminApplicationOperations {
  /** Loads the complete validated global application catalog. */
  readonly listAll: () => Promise<AdminApplicationReadResult<readonly AdminApplication[]>>;
  /** Loads one validated application and its update precondition. */
  readonly get: (
    idOrSlug: string,
  ) => Promise<AdminApplicationReadResult<{ application: AdminApplication; etag: string | null }>>;
  /** Creates one global application. */
  readonly create: (
    input: CreateApplicationInput,
  ) => Promise<AdminApplicationMutationResult<AdminApplication>>;
  /** Updates mutable application fields. */
  readonly update: (
    id: string,
    input: UpdateApplicationInput,
    etag?: string,
  ) => Promise<AdminApplicationMutationResult<AdminApplication>>;
  /** Activates an inactive application. */
  readonly activate: (id: string) => Promise<AdminApplicationMutationResult>;
  /** Deactivates an active application. */
  readonly deactivate: (id: string) => Promise<AdminApplicationMutationResult>;
  /** Permanently archives an application. */
  readonly archive: (id: string) => Promise<AdminApplicationMutationResult>;
  /** Lists every validated module beneath one application. */
  readonly listModules: (
    applicationId: string,
  ) => Promise<AdminApplicationReadResult<readonly AdminApplicationModule[]>>;
  /** Adds a module beneath one application. */
  readonly addModule: (
    applicationId: string,
    input: CreateModuleInput,
  ) => Promise<AdminApplicationMutationResult<AdminApplicationModule>>;
  /** Updates a module through its parent-qualified route. */
  readonly updateModule: (
    applicationId: string,
    moduleId: string,
    input: UpdateModuleInput,
  ) => Promise<AdminApplicationMutationResult<AdminApplicationModule>>;
  /** Deactivates a module through its parent-qualified route. */
  readonly deactivateModule: (
    applicationId: string,
    moduleId: string,
  ) => Promise<AdminApplicationMutationResult>;
}

/** Invokes and validates one application-returning mutation. */
async function applicationMutation(
  invoke: () => Promise<unknown>,
): Promise<AdminApplicationMutationResult<AdminApplication>> {
  try {
    const value = applicationValue(await invoke());
    return value ? { kind: 'success', value } : { kind: 'outcome-unknown' };
  } catch (error) {
    return mutationError(error);
  }
}

/** Invokes one void mutation exactly once. */
async function voidMutation(
  invoke: () => Promise<unknown>,
): Promise<AdminApplicationMutationResult> {
  try {
    await invoke();
    return { kind: 'success' };
  } catch (error) {
    return mutationError(error);
  }
}

/** Creates the feature-local application SDK adapter. */
export function createAdminApplicationOperations(
  domain: () => Pick<
    ApplicationsDomain,
    | 'listAll'
    | 'get'
    | 'create'
    | 'update'
    | 'activate'
    | 'deactivate'
    | 'archive'
    | 'listModules'
    | 'addModule'
    | 'updateModule'
    | 'deactivateModule'
  >,
): AdminApplicationOperations {
  return {
    async listAll() {
      try {
        const value = collection(await domain().listAll(), applicationValue);
        return value
          ? { kind: 'success', value }
          : { kind: 'failure', failure: 'invalid-response' };
      } catch (error) {
        return readError(error);
      }
    },
    async get(idOrSlug) {
      if (!isText(idOrSlug, 100, 3)) return { kind: 'failure', failure: 'validation' };
      try {
        const response = await domain().get(idOrSlug);
        const value = applicationValue(response.data);
        if (!value || !isEtag(response.etag)) {
          return { kind: 'failure', failure: 'invalid-response' };
        }
        return { kind: 'success', value: { application: value, etag: response.etag } };
      } catch (error) {
        return readError(error);
      }
    },
    create: (input) => applicationMutation(() => domain().create(input)),
    update: (id, input, etag) =>
      UUID.test(id)
        ? applicationMutation(() => domain().update(id, input, etag))
        : Promise.resolve({ kind: 'failure', failure: 'validation' }),
    activate: (id) =>
      UUID.test(id)
        ? voidMutation(() => domain().activate(id))
        : Promise.resolve({ kind: 'failure', failure: 'validation' }),
    deactivate: (id) =>
      UUID.test(id)
        ? voidMutation(() => domain().deactivate(id))
        : Promise.resolve({ kind: 'failure', failure: 'validation' }),
    archive: (id) =>
      UUID.test(id)
        ? voidMutation(() => domain().archive(id))
        : Promise.resolve({ kind: 'failure', failure: 'validation' }),
    async listModules(applicationId) {
      if (!UUID.test(applicationId)) return { kind: 'failure', failure: 'validation' };
      try {
        const value = collection(await domain().listModules(applicationId), (entry) =>
          moduleValue(entry, applicationId),
        );
        return value
          ? { kind: 'success', value }
          : { kind: 'failure', failure: 'invalid-response' };
      } catch (error) {
        return readError(error);
      }
    },
    async addModule(applicationId, input) {
      if (!UUID.test(applicationId)) return { kind: 'failure', failure: 'validation' };
      try {
        const value = moduleValue(await domain().addModule(applicationId, input), applicationId);
        return value
          ? { kind: 'success', value }
          : { kind: 'outcome-unknown' };
      } catch (error) {
        return mutationError(error);
      }
    },
    async updateModule(applicationId, moduleId, input) {
      if (!UUID.test(applicationId) || !UUID.test(moduleId)) {
        return { kind: 'failure', failure: 'validation' };
      }
      try {
        const value = moduleValue(
          await domain().updateModule(applicationId, moduleId, input),
          applicationId,
        );
        return value
          ? { kind: 'success', value }
          : { kind: 'outcome-unknown' };
      } catch (error) {
        return mutationError(error);
      }
    },
    deactivateModule: (applicationId, moduleId) =>
      UUID.test(applicationId) && UUID.test(moduleId)
        ? voidMutation(() => domain().deactivateModule(applicationId, moduleId))
        : Promise.resolve({ kind: 'failure', failure: 'validation' }),
  };
}
