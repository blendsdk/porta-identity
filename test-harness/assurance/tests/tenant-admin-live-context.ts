import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

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

/** Closed side effects that the tenant/admin live oracle can independently observe. */
export type TenantAdminSideEffectKey =
  | 'foreign-data-disclosure'
  | 'foreign-state-mutation'
  | 'foreign-session-renewal'
  | 'foreign-token-acceptance'
  | 'unauthorized-target-disclosure'
  | 'unauthorized-target-mutation'
  | 'cross-target-cache-reuse'
  | 'sensitive-audit-content';

/** Independently observed facts consumed by the closed side-effect classifier. */
export interface TenantAdminSideEffectFacts {
  readonly targetChanged: boolean;
  readonly targetDisclosed: boolean;
  readonly unauthorizedAccepted: boolean;
  readonly sessionRenewed?: boolean;
  readonly crossTargetCacheReuse?: boolean;
  readonly sensitiveAuditContent?: boolean;
}

/** Bounded lifecycle/public snapshot used before and after one live request. */
export interface TenantAdminSideEffectSnapshot {
  readonly activeSessions: readonly {
    readonly identity: string;
    readonly renewalFingerprint: string;
  }[];
  readonly crossTargetCacheReuse: boolean;
  readonly sensitiveAuditContent: boolean;
}

/** Independently observed tenant identities and opaque digests for one completed OIDC journey. */
export interface LiveTenantIdentityObservation {
  readonly organization: 'alpha' | 'bravo' | 'none';
  readonly fingerprint: string;
}

/** Authenticated administrative session fields used for public before/after correlation. */
export interface ObservedAuthenticatedSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly clientId: string | null;
  readonly organizationId: string | null;
  readonly createdAt: string;
}

/**
 * Selects the session created by the current journey rather than a preexisting fixture session.
 *
 * The expected user and client remain independent checks after the session-ID delta is applied.
 */
export function selectNewAuthenticatedSession(
  sessions: readonly ObservedAuthenticatedSession[],
  priorSessionIds: ReadonlySet<string>,
  userId: string,
  clientId: string,
): ObservedAuthenticatedSession {
  const candidates = sessions.filter(
    (entry) =>
      !priorSessionIds.has(entry.sessionId) &&
      entry.userId === userId &&
      (entry.clientId === null || entry.clientId === clientId),
  );
  if (candidates.length !== 1) throw new Error('new tracked tenant session is absent or ambiguous');
  return candidates[0];
}

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
  facts: TenantAdminSideEffectFacts,
): Readonly<Record<string, boolean>> {
  return Object.freeze(
    Object.fromEntries(
      keys.map((key) => {
        switch (key as TenantAdminSideEffectKey) {
          case 'foreign-data-disclosure':
          case 'unauthorized-target-disclosure':
            return [key, facts.targetDisclosed];
          case 'foreign-state-mutation':
          case 'unauthorized-target-mutation':
            return [key, facts.targetChanged];
          case 'foreign-token-acceptance':
            return [key, facts.unauthorizedAccepted];
          case 'foreign-session-renewal':
            if (facts.sessionRenewed === undefined) {
              throw new Error('foreign session renewal observation is required');
            }
            return [key, facts.sessionRenewed];
          case 'cross-target-cache-reuse':
            if (facts.crossTargetCacheReuse === undefined) {
              throw new Error('cross-target cache observation is required');
            }
            return [key, facts.crossTargetCacheReuse];
          case 'sensitive-audit-content':
            if (facts.sensitiveAuditContent === undefined) {
              throw new Error('sensitive audit observation is required');
            }
            return [key, facts.sensitiveAuditContent];
          default:
            throw new Error('unsupported tenant/admin side-effect observation');
        }
      }),
    ),
  );
}

/** Detects creation or expiry extension without misclassifying activity or revocation as renewal. */
export function sessionRenewalObserved(
  before: TenantAdminSideEffectSnapshot['activeSessions'],
  after: TenantAdminSideEffectSnapshot['activeSessions'],
): boolean {
  return after.some((current) => {
    const previous = before.find((entry) => entry.identity === current.identity);
    return previous === undefined || previous.renewalFingerprint !== current.renewalFingerprint;
  });
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
    facts: Pick<
      TenantAdminSideEffectFacts,
      'targetChanged' | 'targetDisclosed' | 'unauthorizedAccepted'
    >,
    before?: TenantAdminSideEffectSnapshot,
    after?: TenantAdminSideEffectSnapshot,
  ): Readonly<Record<string, boolean>> {
    const needsExtendedObservation = keys.some(
      (key) =>
        key === 'foreign-session-renewal' ||
        key === 'cross-target-cache-reuse' ||
        key === 'sensitive-audit-content',
    );
    if (!needsExtendedObservation) return mapObservedSideEffects(keys, facts);
    if (before === undefined || after === undefined) {
      throw new Error('closed tenant/admin side-effect snapshots are required');
    }
    return mapObservedSideEffects(keys, this.completeSideEffectFacts(before, after, facts));
  }

  /** Captures session, cache, and audit facts through public or lifecycle-owned boundaries. */
  public async captureSideEffectSnapshot(): Promise<TenantAdminSideEffectSnapshot> {
    const [sessions, audit] = await Promise.all([
      this.rawRequest('GET', '/api/admin/sessions?activeOnly=true&pageSize=100', 'admin-full'),
      this.rawRequest('GET', '/api/admin/audit?limit=500', 'admin-full'),
    ]);
    if (sessions.status !== 200 || audit.status !== 200) {
      throw new Error('tenant/admin side-effect observation boundary is unavailable');
    }
    const sessionData = z
      .object({
        data: z.array(
          z
            .object({
              sessionId: z.string().min(1),
              userId: z.string().uuid().nullable(),
              clientId: z.string().uuid().nullable(),
              organizationId: z.string().uuid().nullable(),
              expiresAt: z.string().min(1),
            })
            .passthrough(),
        ),
      })
      .passthrough()
      .parse(sessions.body).data;
    const auditData = z
      .object({ data: z.array(z.record(z.string(), z.unknown())) })
      .passthrough()
      .parse(audit.body).data;
    const cache = [this.cachedOrganization('alpha'), this.cachedOrganization('bravo')];
    const crossTargetCacheReuse = cache.some(
      (entry) => entry.organization !== 'none' && entry.organization !== entry.requested,
    );
    const serializedAudit = JSON.stringify(auditData);
    return Object.freeze({
      activeSessions: Object.freeze(
        sessionData
          .filter((entry) => entry.userId !== null)
          .map((entry) => ({
            identity: liveDigest({
              sessionId: entry.sessionId,
              userId: entry.userId,
              clientId: entry.clientId,
              organizationId: entry.organizationId,
            }),
            renewalFingerprint: liveDigest({ expiresAt: entry.expiresAt }),
          }))
          .sort((left, right) => left.identity.localeCompare(right.identity)),
      ),
      crossTargetCacheReuse,
      sensitiveAuditContent: this.protectedValues().some(
        (value) => value.length > 0 && serializedAudit.includes(value),
      ),
    });
  }

  /** Completes the closed side-effect facts from two independent snapshots. */
  public completeSideEffectFacts(
    before: TenantAdminSideEffectSnapshot,
    after: TenantAdminSideEffectSnapshot,
    facts: Pick<
      TenantAdminSideEffectFacts,
      'targetChanged' | 'targetDisclosed' | 'unauthorizedAccepted'
    >,
  ): TenantAdminSideEffectFacts {
    return Object.freeze({
      ...facts,
      sessionRenewed: sessionRenewalObserved(before.activeSessions, after.activeSessions),
      crossTargetCacheReuse: after.crossTargetCacheReuse,
      sensitiveAuditContent: after.sensitiveAuditContent,
    });
  }

  /** Observes the tenant-specific UserInfo result produced by one access token. */
  public async observeResponseOrganization(
    tenant: 'alpha' | 'bravo',
    token: string,
  ): Promise<LiveTenantIdentityObservation> {
    const api = await this.api();
    const response = await api.get(`${this.endpoints.porta}/${tenant}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok()) throw new Error('tenant response identity could not be observed');
    const body = z
      .object({ email: z.string().email() })
      .passthrough()
      .parse(await response.json());
    const organization = this.organizationFromSyntheticEmail(body.email);
    return Object.freeze({ organization, fingerprint: liveDigest(body) });
  }

  /** Reads active authenticated sessions for one fixture user through the public admin API. */
  protected async activeTenantSessions(
    tenant: 'alpha' | 'bravo',
  ): Promise<readonly ObservedAuthenticatedSession[]> {
    const userId = this.entity(`${tenant}-user-active`);
    const response = await this.rawRequest(
      'GET',
      `/api/admin/sessions?userId=${encodeURIComponent(userId)}&activeOnly=true&pageSize=100`,
      'admin-full',
    );
    if (response.status !== 200) throw new Error('tenant session identity could not be observed');
    const sessions = z
      .object({
        data: z.array(
          z
            .object({
              sessionId: z.string().min(1),
              userId: z.string().uuid(),
              clientId: z.string().uuid().nullable(),
              organizationId: z.string().uuid().nullable(),
              createdAt: z.string().min(1),
            })
            .passthrough(),
        ),
      })
      .passthrough()
      .parse(response.body).data;
    return sessions.filter((entry) => entry.userId === userId);
  }

  /** Captures active session IDs before a journey so its new session can be correlated exactly. */
  public async observeActiveSessionIds(tenant: 'alpha' | 'bravo'): Promise<ReadonlySet<string>> {
    const sessions = await this.activeTenantSessions(tenant);
    return new Set(sessions.map((entry) => entry.sessionId));
  }

  /** Observes the newly created session for the exact fixture user and client. */
  public async observeSessionOrganization(
    tenant: 'alpha' | 'bravo',
    priorSessionIds: ReadonlySet<string>,
  ): Promise<LiveTenantIdentityObservation> {
    const userId = this.entity(`${tenant}-user-active`);
    const clientId = this.entity(`${tenant}-client-public`);
    const sessions = await this.activeTenantSessions(tenant);
    const session = selectNewAuthenticatedSession(sessions, priorSessionIds, userId, clientId);
    const organization = this.organizationFromUserId(session.userId);
    return Object.freeze({
      organization,
      fingerprint: liveDigest({
        sessionId: session.sessionId,
        userId: session.userId,
        clientId: session.clientId,
        organizationId: session.organizationId,
      }),
    });
  }

  /** Observes one organization cache entry from the exact lifecycle-owned Redis container. */
  public observeCacheOrganization(tenant: 'alpha' | 'bravo'): LiveTenantIdentityObservation {
    const observed = this.cachedOrganization(tenant);
    if (observed.organization === 'none') {
      throw new Error('tenant cache identity could not be observed');
    }
    return Object.freeze({
      organization: observed.organization,
      fingerprint: observed.fingerprint,
    });
  }

  /** Maps a fixture organization UUID onto the closed public observation domain. */
  protected organizationFromId(value: string): 'alpha' | 'bravo' | 'none' {
    if (value === this.entity('alpha')) return 'alpha';
    if (value === this.entity('bravo')) return 'bravo';
    return 'none';
  }

  /** Maps an independently returned fixture user UUID onto its owning organization. */
  protected organizationFromUserId(value: string): 'alpha' | 'bravo' | 'none' {
    if (value === this.entity('alpha-user-active')) return 'alpha';
    if (value === this.entity('bravo-user-active')) return 'bravo';
    return 'none';
  }

  /** Maps synthetic fixture email identity without trusting the requested tenant. */
  protected organizationFromSyntheticEmail(email: string): 'alpha' | 'bravo' | 'none' {
    if (email === 'alpha-user-active@test-harness.local') return 'alpha';
    if (email === 'bravo-user-active@test-harness.local') return 'bravo';
    return 'none';
  }

  /** Reads and validates one cache entry without retaining its contents. */
  protected cachedOrganization(tenant: 'alpha' | 'bravo'): {
    readonly requested: 'alpha' | 'bravo';
    readonly organization: 'alpha' | 'bravo' | 'none';
    readonly fingerprint: string;
  } {
    const redis = this.activeRedisContainer();
    const value = execFileSync(
      'docker',
      ['exec', redis, 'redis-cli', '--raw', 'GET', `org:slug:${tenant}`],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 10_000,
        maxBuffer: 256 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    ).trim();
    if (value === '') {
      return { requested: tenant, organization: 'none', fingerprint: liveDigest(null) };
    }
    const parsed = z
      .object({ id: z.string().uuid(), slug: z.string().min(1) })
      .passthrough()
      .parse(JSON.parse(value));
    return {
      requested: tenant,
      organization: this.organizationFromId(parsed.id),
      fingerprint: liveDigest({ id: parsed.id, slug: parsed.slug }),
    };
  }

  /** Resolves the unique Redis container owned by the active lifecycle run. */
  protected activeRedisContainer(): string {
    const output = execFileSync(
      'docker',
      [
        'ps',
        '-aq',
        '--no-trunc',
        '--filter',
        `label=com.docker.compose.project=${this.endpoints.composeProject}`,
        '--filter',
        'label=com.docker.compose.service=redis',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        timeout: 10_000,
        maxBuffer: 64 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    ).trim();
    const identifiers = output.split(/\s+/u).filter(Boolean);
    if (identifiers.length !== 1 || !/^[a-f0-9]{64}$/u.test(identifiers[0] ?? '')) {
      throw new Error('active Redis container identity is not unique');
    }
    return identifiers[0] ?? '';
  }

  /** Resolves protected fixture canaries only for an in-memory audit-content comparison. */
  protected protectedValues(): readonly string[] {
    const references = [
      ...this.manifest.superAdmin.actors.map((actor) => actor.tokenCredentialRef),
      ...(['alpha', 'bravo'] as const).flatMap((tenant) => [
        `credential:${tenant}:token:baseline`,
        `credential:${tenant}:cookie:baseline`,
        ...this.manifest[tenant].users.map((user) => user.passwordCredentialRef),
        ...this.manifest[tenant].clients.flatMap((client) =>
          client.clientSecretCredentialRef === undefined ? [] : [client.clientSecretCredentialRef],
        ),
      ]),
    ];
    return references.map((reference) => this.credential(reference));
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
