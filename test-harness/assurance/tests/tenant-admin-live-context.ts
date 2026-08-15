import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

import { request, type APIRequestContext, type APIResponse } from '@playwright/test';
import { z } from 'zod';

import { activeEndpoints, type ActiveFixtureEndpoints } from '../../fixtures/fixture-assurance.js';
import {
  readProtectedRuntimeCredential,
  readPublicRuntimeFixtureManifest,
} from '../../fixtures/fixture-runtime-files.js';
import { resolvePublicFixtureManifest } from '../../fixtures/fixture-definition.js';
import type {
  AdministrativeActor,
  PublicFixtureManifest,
} from '../../fixtures/fixture-assurance-contract.js';
import type { AuthorizationResult } from './tenant-admin-profile-requirements.js';
import type { TargetStateFingerprint } from './tenant-admin-boundaries-contract.js';

const responseEnvelopeSchema = z.object({ data: z.unknown() }).passthrough();

/** Stable actor names used by the authorization catalog. */
export type LiveAdminActorId =
  'admin-full' | 'admin-limited' | 'admin-unprivileged' | 'unauthenticated';

/** Canonical metadata for one administrative target and its public route. */
export interface LiveAdminTarget {
  /** Catalog resource identifier. */
  readonly catalogId: string;
  /** Public resource class. */
  readonly surface: 'user' | 'client' | 'session' | 'application' | 'role';
  /** Owning organization when the resource is tenant-scoped. */
  readonly organization: 'alpha' | 'bravo' | 'global';
  /** Canonical public GET route used for independent state observation. */
  readonly readPath: string;
  /** Canonical public mutation route. */
  readonly mutationPath: string;
  /** Safe idempotent body for update actions, absent for session revocation. */
  readonly updateBody?: Readonly<Record<string, unknown>>;
}

/** Sanitized response retained by the live oracle without headers or bearer material. */
export interface LiveHttpObservation {
  /** HTTP status returned by Porta. */
  readonly status: number;
  /** Parsed response body when it is valid JSON, otherwise no body is retained. */
  readonly body?: unknown;
}

/** Converts an arbitrary live value into a stable non-secret digest. */
export function liveDigest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

/** Maps exact public HTTP status classes to the immutable authorization vocabulary. */
export function authorizationResult(status: number): AuthorizationResult {
  if (status >= 200 && status < 300) return 'allowed';
  if (status === 401) return 'unauthenticated';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  throw new Error(`unsupported authorization response status: ${status}`);
}

/** Maps independently observed facts onto every declared prohibited-side-effect key. */
export function mapObservedSideEffects(
  keys: readonly string[],
  facts: {
    readonly targetChanged: boolean;
    readonly targetDisclosed: boolean;
    readonly unauthorizedAccepted: boolean;
  },
): Readonly<Record<string, boolean>> {
  return Object.freeze(
    Object.fromEntries(
      keys.map((key) => {
        const observed = key.includes('disclosure')
          ? facts.targetDisclosed
          : key.includes('mutation')
            ? facts.targetChanged
            : key.includes('token-acceptance') || key.includes('cache-reuse')
              ? facts.unauthorizedAccepted
              : false;
        return [key, observed];
      }),
    ),
  );
}

/**
 * Live retained-harness context for raw administrative and OIDC observations.
 *
 * The context reads only the active run's validated manifests. Raw credentials are resolved at
 * the last possible moment and are never placed in returned observations or diagnostics.
 */
export class LiveTenantAdminContext {
  /** Active run endpoints and owner-only fixture paths. */
  public readonly endpoints: ActiveFixtureEndpoints;

  /** Independently specified public fixture manifest. */
  public readonly manifest: PublicFixtureManifest;

  /** Actual disposable identifiers keyed by stable fixture aliases. */
  public entities: ReadonlyMap<string, string>;

  protected apiPromise?: Promise<APIRequestContext>;

  /** Creates a context bound to the exact currently active harness run. */
  public constructor() {
    this.endpoints = activeEndpoints();
    const runtime = readPublicRuntimeFixtureManifest(this.endpoints.fixtureManifestPath);
    if (runtime.runId !== this.endpoints.runId) {
      throw new Error('live fixture run differs from the active endpoint run');
    }
    this.manifest = resolvePublicFixtureManifest({
      appBaseUrl: this.endpoints.app,
      bffBaseUrl: this.endpoints.bff,
    });
    this.entities = new Map(runtime.entities.map((entry) => [entry.alias, entry.id]));
  }

  /** Returns one reusable TLS-tolerant request context for harness-only loopback endpoints. */
  public api(): Promise<APIRequestContext> {
    this.apiPromise ??= request.newContext({ ignoreHTTPSErrors: true });
    return this.apiPromise;
  }

  /** Resolves one required generated identifier without exposing it in an error. */
  public entity(alias: string): string {
    const value = this.entities.get(alias);
    if (value === undefined) throw new Error('required live fixture identity is absent');
    return value;
  }

  /** Resolves one protected fixture value without returning its reference in diagnostics. */
  public credential(reference: string): string {
    return readProtectedRuntimeCredential(this.endpoints.credentialManifestPath, reference);
  }

  /** Returns the fixture actor corresponding to one immutable catalog actor. */
  public adminActor(actorId: Exclude<LiveAdminActorId, 'unauthenticated'>): AdministrativeActor {
    const permissionSet = actorId.replace('admin-', '');
    const actor = this.manifest.superAdmin.actors.find(
      (candidate) => candidate.permissionSet === permissionSet,
    );
    if (actor === undefined) throw new Error('required live administrative actor is absent');
    return actor;
  }

  /** Builds an authorization header only for authenticated administrative actors. */
  public adminHeaders(actorId: LiveAdminActorId): Readonly<Record<string, string>> {
    if (actorId === 'unauthenticated') return Object.freeze({});
    const actor = this.adminActor(actorId);
    return Object.freeze({
      Authorization: `Bearer ${this.credential(actor.tokenCredentialRef)}`,
    });
  }

  /** Executes one raw request and retains only status plus a bounded parsed body. */
  public async rawRequest(
    method: 'GET' | 'PUT' | 'POST' | 'DELETE',
    path: string,
    actorId: LiveAdminActorId,
    data?: Readonly<Record<string, unknown>>,
  ): Promise<LiveHttpObservation> {
    const api = await this.api();
    const response = await api.fetch(`${this.endpoints.porta}${path}`, {
      method,
      headers: this.adminHeaders(actorId),
      data,
      maxRedirects: 0,
    });
    return this.sanitizeResponse(response);
  }

  /** Executes one raw request with an ordinary fixture token resolved at the last possible moment. */
  public async rawOrdinaryTokenRequest(
    method: 'GET' | 'PUT' | 'POST' | 'DELETE',
    path: string,
    tokenCredentialRef: string,
    data?: Readonly<Record<string, unknown>>,
  ): Promise<LiveHttpObservation> {
    const api = await this.api();
    const response = await api.fetch(`${this.endpoints.porta}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.credential(tokenCredentialRef)}` },
      data,
      maxRedirects: 0,
    });
    return this.sanitizeResponse(response);
  }

  /** Reads and validates one JSON response without retaining raw response headers. */
  protected async sanitizeResponse(response: APIResponse): Promise<LiveHttpObservation> {
    const contentType = response.headers()['content-type'] ?? '';
    let body: unknown;
    if (contentType.includes('application/json')) {
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > 256 * 1024) {
        throw new Error('live response exceeded the assurance body limit');
      }
      body = JSON.parse(text);
    }
    return Object.freeze({ status: response.status(), ...(body === undefined ? {} : { body }) });
  }

  /** Resolves one catalog resource to its exact live administrative route and safe update. */
  public async adminTarget(catalogId: string): Promise<LiveAdminTarget> {
    const targetDefinitions: Readonly<Record<string, Omit<LiveAdminTarget, 'updateBody'>>> = {
      'admin-target-alpha-user': this.userTarget('alpha'),
      'admin-target-bravo-user': this.userTarget('bravo'),
      'admin-target-alpha-client': this.clientTarget('alpha'),
      'admin-target-bravo-client': this.clientTarget('bravo'),
      'admin-target-alpha-session': this.sessionTarget('alpha'),
      'admin-target-bravo-session': this.sessionTarget('bravo'),
      'admin-global-application': this.applicationTarget(),
      'admin-global-role': this.roleTarget(),
    };
    const target = targetDefinitions[catalogId];
    if (target === undefined) throw new Error('unknown live administrative target');
    if (target.surface === 'session') return Object.freeze(target);
    const current = await this.rawRequest('GET', target.readPath, 'admin-full');
    if (current.status !== 200) throw new Error('live target control could not be observed');
    const data = responseEnvelopeSchema.parse(current.body).data;
    const record = z.record(z.string(), z.unknown()).parse(data);
    const name = z
      .string()
      .min(1)
      .parse(
        target.surface === 'user'
          ? (record.nickname ?? record.givenName)
          : target.surface === 'client'
            ? record.clientName
            : record.name,
      );
    const updateBody =
      target.surface === 'user'
        ? { nickname: name }
        : target.surface === 'client'
          ? { clientName: name }
          : { name };
    return Object.freeze({ ...target, updateBody: Object.freeze(updateBody) });
  }

  /** Observes one target through a full-authority public GET and returns a redacted digest. */
  public async targetFingerprint(target: LiveAdminTarget): Promise<TargetStateFingerprint> {
    const response = await this.rawRequest('GET', target.readPath, 'admin-full');
    if (response.status !== 200) throw new Error('live target fingerprint control failed');
    return Object.freeze({ targetId: target.catalogId, digest: liveDigest(response.body) });
  }

  /** Runs one serialized lifecycle control action through the owner-only supervisor socket. */
  public async lifecycle(action: 'reset' | 'restart-porta'): Promise<void> {
    const exitCode = await new Promise<number>((resolveExit, rejectExit) => {
      const child = spawn(
        process.execPath,
        ['--import', 'tsx', 'test-harness/scripts/lifecycle.ts', action],
        { cwd: process.cwd(), env: process.env, shell: false, stdio: 'ignore' },
      );
      child.once('error', rejectExit);
      child.once('exit', (code) => resolveExit(code ?? 30));
    });
    if (exitCode !== 0) throw new Error(`live lifecycle action failed: ${action}`);
    if (action === 'reset') this.refreshEntities();
  }

  /** Reloads generated identifiers after a deterministic reset replaced the fixture database. */
  protected refreshEntities(): void {
    const runtime = readPublicRuntimeFixtureManifest(this.endpoints.fixtureManifestPath);
    if (runtime.runId !== this.endpoints.runId) {
      throw new Error('refreshed fixture run differs from the active endpoint run');
    }
    this.entities = new Map(runtime.entities.map((entry) => [entry.alias, entry.id]));
  }

  /** Returns whether a response contains any protected target identifier or synthetic PII. */
  public responseDisclosedTarget(response: LiveHttpObservation, target: LiveAdminTarget): boolean {
    if (response.body === undefined) return false;
    const serialized = JSON.stringify(response.body);
    const protectedValues = [
      this.safeTargetIdentifier(target),
      ...(target.organization === 'global'
        ? []
        : [`${target.organization}-user-active@test-harness.local`]),
    ];
    return protectedValues.some((value) => value.length > 0 && serialized.includes(value));
  }

  /** Creates observed side-effect flags from target drift, disclosure, and request acceptance. */
  public observedSideEffects(
    keys: readonly string[],
    facts: {
      readonly targetChanged: boolean;
      readonly targetDisclosed: boolean;
      readonly unauthorizedAccepted: boolean;
    },
  ): Readonly<Record<string, boolean>> {
    return mapObservedSideEffects(keys, facts);
  }

  /** Returns the concrete target identifier only for in-memory disclosure comparison. */
  protected safeTargetIdentifier(target: LiveAdminTarget): string {
    if (target.surface === 'session') {
      const tenant = target.organization === 'alpha' ? 'alpha' : 'bravo';
      return this.credential(`credential:${tenant}:cookie:baseline`);
    }
    const match = /\/([^/]+)$/u.exec(target.readPath);
    return match?.[1] ?? '';
  }

  /** Resolves an organization-scoped user target. */
  protected userTarget(organization: 'alpha' | 'bravo'): Omit<LiveAdminTarget, 'updateBody'> {
    const organizationId = this.entity(organization);
    const userId = this.entity(`${organization}-user-active`);
    const path = `/api/admin/organizations/${organizationId}/users/${userId}`;
    return {
      catalogId: `admin-target-${organization}-user`,
      surface: 'user',
      organization,
      readPath: path,
      mutationPath: path,
    };
  }

  /** Resolves one tenant-owned client target. */
  protected clientTarget(organization: 'alpha' | 'bravo'): Omit<LiveAdminTarget, 'updateBody'> {
    const clientId = this.entity(`${organization}-client-public`);
    const path = `/api/admin/clients/${clientId}`;
    return {
      catalogId: `admin-target-${organization}-client`,
      surface: 'client',
      organization,
      readPath: path,
      mutationPath: path,
    };
  }

  /** Resolves one tenant-owned tracked session target. */
  protected sessionTarget(organization: 'alpha' | 'bravo'): Omit<LiveAdminTarget, 'updateBody'> {
    const sessionId = this.credential(`credential:${organization}:cookie:baseline`);
    const path = `/api/admin/sessions/${encodeURIComponent(sessionId)}`;
    return {
      catalogId: `admin-target-${organization}-session`,
      surface: 'session',
      organization,
      readPath: path,
      mutationPath: path,
    };
  }

  /** Resolves the global assurance application target. */
  protected applicationTarget(): Omit<LiveAdminTarget, 'updateBody'> {
    const applicationId = this.entity('assurance-oidc');
    const path = `/api/admin/applications/${applicationId}`;
    return {
      catalogId: 'admin-global-application',
      surface: 'application',
      organization: 'global',
      readPath: path,
      mutationPath: path,
    };
  }

  /** Resolves one global assurance role under its owning application. */
  protected roleTarget(): Omit<LiveAdminTarget, 'updateBody'> {
    const applicationId = this.entity('assurance-oidc');
    const roleId = this.entity('alpha-resource-reader');
    const path = `/api/admin/applications/${applicationId}/roles/${roleId}`;
    return {
      catalogId: 'admin-global-role',
      surface: 'role',
      organization: 'global',
      readPath: path,
      mutationPath: path,
    };
  }
}
