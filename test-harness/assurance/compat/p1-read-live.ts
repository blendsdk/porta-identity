import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import process from 'node:process';

import { request, type APIRequestContext } from '@playwright/test';
import { z } from 'zod';

import { activeEndpoints } from '../../fixtures/fixture-assurance.js';
import {
  readProtectedRuntimeCredential,
  readPublicRuntimeFixtureManifest,
} from '../../fixtures/fixture-runtime-files.js';
import { runManagedChild } from '../scripts/managed-child.js';
import { requireCanonicalChild } from './filesystem.js';
import type { PreparedPackedConsumer, PackedSurfaceResult } from './model.js';
import type {
  PackedP1ReadJourneyDriver,
  PackedP1ReadJourneyRequirement,
  PackedP1ReadResult,
} from './p1-read.js';

/** Parsed public list envelope used by all selected read surfaces. */
interface PublicListEnvelope {
  readonly data: readonly Record<string, unknown>[];
  readonly total?: number;
  readonly page?: number;
  readonly pageSize?: number;
  readonly cursor?: string;
  readonly hasMore?: boolean;
}

const publicListEnvelopeSchema = z
  .object({
    data: z.array(z.record(z.string(), z.unknown())),
    total: z.number().int().optional(),
    page: z.number().int().optional(),
    pageSize: z.number().int().optional(),
    cursor: z.string().optional(),
    hasMore: z.boolean().optional(),
  })
  .passthrough();

/** Returns a deterministic digest of bounded public data. */
function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

/** Returns a content-and-metadata fingerprint without exposing credential bytes. */
function credentialFingerprint(path: string): string {
  if (!existsSync(path)) return 'absent';
  const metadata = lstatSync(path);
  const hash = createHash('sha256');
  hash.update(`${metadata.mode & 0o777}:${metadata.size}:`);
  if (metadata.isFile() && !metadata.isSymbolicLink()) hash.update(readFileSync(path));
  return `sha256:${hash.digest('hex')}`;
}

/** Narrows a JSON value to the common public list envelope. */
function listEnvelope(value: unknown): PublicListEnvelope {
  return publicListEnvelopeSchema.parse(value);
}

/** Selects the stable public identity field for one read surface. */
function itemIdentity(
  surface: PackedP1ReadJourneyRequirement['surface'],
  item: Record<string, unknown>,
): string {
  const key =
    surface === 'configuration-list'
      ? item.key
      : surface === 'tenant-session-page'
        ? item.sessionId
        : item.id;
  if (typeof key !== 'string' || key.length === 0)
    throw new Error('packed P1 item identity is absent');
  return key;
}

/** Converts one actual list envelope into the shared independent comparison shape. */
function normalizeResult(
  requirement: PackedP1ReadJourneyRequirement,
  envelope: PublicListEnvelope,
): PackedP1ReadResult {
  const identities = envelope.data.map((item) => itemIdentity(requirement.surface, item));
  const metadata = {
    total: envelope.total ?? envelope.data.length,
    page: envelope.page ?? null,
    pageSize: envelope.pageSize ?? null,
    cursor: envelope.cursor ?? null,
    hasMore: envelope.hasMore ?? null,
  };
  return {
    result: 'allowed',
    status: 200,
    orderedItemIdentities: identities,
    pageOrFilterMetadataDigest: digest(metadata),
    publicFieldDigest: digest(envelope.data),
  };
}

/** Live driver bound to one prepared consumer and lifecycle-owned Porta stack. */
export class PackedP1ReadLiveDriver implements PackedP1ReadJourneyDriver {
  private readonly endpoints = activeEndpoints();
  private readonly apiPromise: Promise<APIRequestContext>;
  private readonly entities: ReadonlyMap<string, string>;
  private lastClientOutput = '';
  private lastRawEnvelope: PublicListEnvelope | undefined;
  private selectedAuditEvent: string | undefined;
  private selectedUserCursor: string | undefined;
  private sensitiveConfigurationExposed = false;
  private auditPrerequisiteReady = false;

  /** Resolves only owner-fenced fixture identities and public endpoints. */
  public constructor(
    private readonly consumer: PreparedPackedConsumer,
    private readonly surfaces: PackedSurfaceResult,
  ) {
    const fixture = readPublicRuntimeFixtureManifest(this.endpoints.fixtureManifestPath);
    if (fixture.runId !== this.endpoints.runId)
      throw new Error('packed P1 fixture run is not active');
    this.entities = new Map(fixture.entities.map((entry) => [entry.alias, entry.id]));
    this.apiPromise = request.newContext({ ignoreHTTPSErrors: true });
  }

  /** Captures all state families through the independent public administrative boundary. */
  public async observeState(): Promise<Readonly<Record<string, string>>> {
    const api = await this.apiPromise;
    const headers = this.headers();
    await this.ensureAuditPrerequisite(api, headers);
    const [users, sessions, keys, config, audit] = await Promise.all([
      this.getEnvelope(
        api,
        `/api/admin/organizations/${this.entity('alpha')}/users?pageSize=100`,
        headers,
      ),
      this.getEnvelope(api, '/api/admin/sessions?pageSize=100', headers),
      this.getEnvelope(api, '/api/admin/keys', headers),
      this.getEnvelope(api, '/api/admin/config', headers),
      this.getEnvelope(api, `/api/admin/audit?org=${this.entity('alpha')}&limit=50`, headers),
    ]);
    return {
      'target-row-digests': digest({ users: users.data, audit: audit.data }),
      'target-cardinality': digest({
        users: users.data.length,
        sessions: sessions.data.length,
        audit: audit.data.length,
      }),
      'session-lifecycle-digests': digest(sessions.data),
      'signing-key-lifecycle-digests': digest(keys.data),
      'configuration-version-digests': digest(config.data),
    };
  }

  /** Executes one exact journey through the selected locally packed client. */
  public async executeClient(requirement: PackedP1ReadJourneyRequirement) {
    return requirement.client === 'sdk'
      ? this.executeSdk(requirement)
      : this.executeCli(requirement);
  }

  /** Executes the same request through raw HTTP without using packed-client output. */
  public async executeIndependentRaw(
    requirement: PackedP1ReadJourneyRequirement,
  ): Promise<PackedP1ReadResult> {
    const api = await this.apiPromise;
    const envelope = await this.getEnvelope(api, await this.rawPath(requirement), this.headers());
    this.lastRawEnvelope = envelope;
    return normalizeResult(requirement, envelope);
  }

  /** Verifies result identities against raw response ownership and masking facts. */
  public async verifyFixtureIdentities(
    requirement: PackedP1ReadJourneyRequirement,
    identities: readonly string[],
  ): Promise<{ readonly satisfied: boolean; readonly resolvedIdentities: readonly string[] }> {
    const raw = this.lastRawEnvelope;
    if (raw === undefined) throw new Error('packed P1 raw fixture observation is absent');
    const resolved = raw.data.map((item) => itemIdentity(requirement.surface, item));
    let satisfied = JSON.stringify(resolved) === JSON.stringify(identities);
    if (requirement.surface === 'tenant-users-page') {
      satisfied =
        satisfied && raw.data.every((item) => item.organizationId === this.entity('alpha'));
    }
    if (requirement.surface === 'users-page-search') {
      satisfied =
        satisfied && raw.data.every((item) => item.organizationId === this.entity('alpha'));
    }
    if (requirement.surface === 'audit-filter') {
      satisfied =
        satisfied && raw.data.every((item) => item.organizationId === this.entity('alpha'));
    }
    if (requirement.surface === 'signing-key-list') {
      satisfied =
        satisfied &&
        raw.data.every(
          (item) =>
            !('privateKey' in item) && !('private_key' in item) && !('privateKeyPem' in item),
        );
    }
    if (requirement.surface === 'tenant-session-page') {
      satisfied =
        satisfied && raw.data.every((item) => item.userId === this.entity('alpha-user-active'));
    }
    if (requirement.surface === 'configuration-list') {
      satisfied =
        satisfied && raw.data.every((item) => item.isSensitive !== true || item.value === '***');
    }
    return { satisfied, resolvedIdentities: resolved };
  }

  /** Scans transient client output against protected values and foreign fixture identities. */
  public async scanForbiddenOutput(output: string): Promise<Readonly<Record<string, boolean>>> {
    const fullToken = this.token();
    const protectedCredential = readProtectedRuntimeCredential(
      this.endpoints.credentialManifestPath,
      'credential:oidc:alpha:confidential-client-secret',
    );
    const bravo = [this.entity('bravo'), this.entity('bravo-user-active')];
    return {
      'opaque-access-or-refresh-token': output.includes(fullToken),
      'session-cookie-or-credential': output.includes(protectedCredential),
      'protected-configuration-value': this.sensitiveConfigurationExposed,
      'private-signing-key-material': /BEGIN (?:EC |)PRIVATE KEY/u.test(output),
      'foreign-tenant-identity-or-count': bravo.some((value) => output.includes(value)),
    };
  }

  /** Releases the independent raw observer. */
  public async dispose(): Promise<void> {
    const api = await this.apiPromise;
    await api.dispose();
  }

  /** Resolves one public fixture alias without exposing identifiers in diagnostics. */
  private entity(alias: string): string {
    const value = this.entities.get(alias);
    if (value === undefined) throw new Error('packed P1 fixture identity is absent');
    return value;
  }

  /** Reads the current generation's limited administrative token. */
  private token(): string {
    return readProtectedRuntimeCredential(
      this.endpoints.credentialManifestPath,
      'credential:super-admin:token:limited',
    );
  }

  /** Creates the bearer header only inside the live owner process. */
  private headers(): Readonly<Record<string, string>> {
    return { Authorization: `Bearer ${this.token()}` };
  }

  /** Executes a locally packed SDK read through an owner-only input file. */
  private async executeSdk(requirement: PackedP1ReadJourneyRequirement) {
    const inputPath = resolve(this.consumer.consumerPath, `.p1-read-${randomUUID()}.json`);
    const probePath = resolve(this.consumer.consumerPath, `.p1-read-${randomUUID()}.mjs`);
    copyFileSync(resolve(process.cwd(), 'test-harness/consumers/p1-read-sdk-probe.mjs'), probePath);
    if (requirement.surface === 'tenant-users-page') {
      const api = await this.apiPromise;
      const firstPage = await this.getEnvelope(
        api,
        `/api/admin/organizations/${this.entity('alpha')}/users?limit=1&search=alpha`,
        this.headers(),
      );
      if (firstPage.cursor === undefined) {
        throw new Error('packed P1 cursor prerequisite is absent');
      }
      this.selectedUserCursor = firstPage.cursor;
    }
    const input = {
      server: this.endpoints.porta,
      token: this.token(),
      surface: requirement.surface,
      organizationId: this.entity('alpha'),
      query:
        requirement.surface === 'tenant-session-page'
          ? { userId: this.entity('alpha-user-active'), page: 1, pageSize: 2 }
          : { cursor: this.selectedUserCursor, pageSize: 2, search: 'alpha' },
    };
    writeFileSync(inputPath, JSON.stringify(input), { flag: 'wx', mode: 0o600 });
    try {
      const child = await runManagedChild(process.execPath, [probePath, inputPath], {
        cwd: this.consumer.consumerPath,
        env: process.env,
        stdio: 'pipe',
        maxOutputBytes: 128 * 1024,
        timeoutMilliseconds: 30_000,
        terminationGraceMilliseconds: 2_000,
        cleanup: () => undefined,
      });
      if (child.code !== 0 || child.signal !== null || child.outputTruncated) {
        throw new Error('packed P1 SDK read failed');
      }
      this.lastClientOutput = `${child.stdout}${child.stderr}`;
      const envelope = listEnvelope(JSON.parse(child.stdout));
      this.sensitiveConfigurationExposed = false;
      return {
        result: normalizeResult(requirement, envelope),
        boundedOutput: this.lastClientOutput,
      };
    } finally {
      rmSync(inputPath, { force: true });
      rmSync(probePath, { force: true });
    }
  }

  /** Executes one packed CLI read under a fresh isolated credential home. */
  private async executeCli(requirement: PackedP1ReadJourneyRequirement) {
    const callerPath = resolve(homedir(), '.porta/credentials.json');
    const callerBefore = credentialFingerprint(callerPath);
    const home = resolve(this.consumer.consumerPath, '..', 'homes', randomUUID());
    const credentialDirectory = resolve(home, '.porta');
    mkdirSync(home, { recursive: true, mode: 0o700 });
    chmodSync(home, 0o700);
    mkdirSync(credentialDirectory, { mode: 0o700 });
    writeFileSync(
      resolve(credentialDirectory, 'credentials.json'),
      JSON.stringify({
        server: this.endpoints.porta,
        orgSlug: 'porta-admin',
        clientId: 'porta-admin-assurance',
        accessToken: this.token(),
        idToken: 'synthetic-assurance-placeholder',
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        userInfo: { sub: 'synthetic-assurance-actor', email: 'actor@test-harness.local' },
      }),
      { flag: 'wx', mode: 0o600 },
    );
    let child: Awaited<ReturnType<typeof runManagedChild>>;
    const mode = statSync(home).mode & 0o777;
    try {
      child = await runManagedChild(
        process.execPath,
        [this.surfaces.cliBinPath, ...(await this.cliArgs(requirement))],
        {
          cwd: this.consumer.consumerPath,
          env: { ...process.env, HOME: home, USERPROFILE: home },
          stdio: 'pipe',
          maxOutputBytes: 128 * 1024,
          timeoutMilliseconds: 30_000,
          terminationGraceMilliseconds: 2_000,
          cleanup: () => undefined,
        },
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
    if (child.code !== 0 || child.signal !== null || child.outputTruncated) {
      throw new Error('packed P1 CLI read failed');
    }
    this.lastClientOutput = `${child.stdout}${child.stderr}`;
    const parsed: unknown = JSON.parse(child.stdout);
    const envelope = listEnvelope(Array.isArray(parsed) ? { data: parsed } : parsed);
    this.sensitiveConfigurationExposed =
      requirement.surface === 'configuration-list' &&
      envelope.data.some((item) => item.isSensitive === true && item.value !== '***');
    return {
      result: normalizeResult(requirement, envelope),
      boundedOutput: this.lastClientOutput,
      cliIsolation: {
        temporaryHomeMode: mode,
        temporaryHomeRemoved: !existsSync(home),
        callerCredentialFingerprintUnchanged: callerBefore === credentialFingerprint(callerPath),
      },
    };
  }

  /** Returns exact CLI arguments without placing credentials on the command line. */
  private async cliArgs(requirement: PackedP1ReadJourneyRequirement): Promise<string[]> {
    const common = ['--server', this.endpoints.porta, '--insecure', '--json'];
    if (requirement.surface === 'users-page-search') {
      return [
        'user',
        'list',
        '--org',
        this.entity('alpha'),
        '--page',
        '1',
        '--page-size',
        '2',
        '--search',
        'alpha',
        ...common,
      ];
    }
    if (requirement.surface === 'audit-filter') {
      const api = await this.apiPromise;
      const audit = await this.getEnvelope(
        api,
        `/api/admin/audit?org=${this.entity('alpha')}&limit=1`,
        this.headers(),
      );
      const event = audit.data[0]?.eventType;
      if (typeof event !== 'string') throw new Error('packed P1 audit prerequisite is absent');
      this.selectedAuditEvent = event;
      return [
        'audit',
        'list',
        '--org',
        this.entity('alpha'),
        '--event',
        event,
        '--limit',
        '50',
        ...common,
      ];
    }
    return ['config', 'list', ...common];
  }

  /** Resolves the raw request matching one exact client journey. */
  private async rawPath(requirement: PackedP1ReadJourneyRequirement): Promise<string> {
    if (requirement.surface === 'tenant-users-page') {
      if (this.selectedUserCursor === undefined) {
        throw new Error('packed P1 cursor prerequisite was not independently selected');
      }
      return `/api/admin/organizations/${this.entity('alpha')}/users?cursor=${encodeURIComponent(this.selectedUserCursor)}&pageSize=2&search=alpha`;
    }
    if (requirement.surface === 'users-page-search') {
      return `/api/admin/organizations/${this.entity('alpha')}/users?page=1&pageSize=2&search=alpha`;
    }
    if (requirement.surface === 'audit-filter') {
      if (this.selectedAuditEvent === undefined) {
        throw new Error('packed P1 audit prerequisite was not independently selected');
      }
      return `/api/admin/audit?org=${this.entity('alpha')}&event=${encodeURIComponent(this.selectedAuditEvent)}&limit=50`;
    }
    if (requirement.surface === 'signing-key-list') return '/api/admin/keys';
    if (requirement.surface === 'tenant-session-page') {
      return `/api/admin/sessions?userId=${this.entity('alpha-user-active')}&page=1&pageSize=2`;
    }
    return '/api/admin/config';
  }

  /** Fetches one successful public list without retaining raw response diagnostics. */
  private async getEnvelope(
    api: APIRequestContext,
    path: string,
    headers: Readonly<Record<string, string>>,
  ): Promise<PublicListEnvelope> {
    const response = await api.get(`${this.endpoints.porta}${path}`, { headers });
    if (response.status() !== 200) throw new Error('packed P1 independent read failed');
    return listEnvelope(await response.json());
  }

  /** Creates one synthetic audit row before any before-state fingerprint is admitted. */
  private async ensureAuditPrerequisite(
    api: APIRequestContext,
    headers: Readonly<Record<string, string>>,
  ): Promise<void> {
    if (this.auditPrerequisiteReady) return;
    let audit = await this.getEnvelope(
      api,
      `/api/admin/audit?org=${this.entity('alpha')}&limit=1`,
      headers,
    );
    if (audit.data.length === 0) {
      await api.get(`${this.endpoints.porta}/alpha/auth/magic-link/invalid-p1-read-prerequisite`);
      for (let attempt = 0; attempt < 4 && audit.data.length === 0; attempt += 1) {
        await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 50));
        audit = await this.getEnvelope(
          api,
          `/api/admin/audit?org=${this.entity('alpha')}&limit=1`,
          headers,
        );
      }
    }
    if (audit.data.length === 0) throw new Error('packed P1 audit prerequisite is absent');
    this.auditPrerequisiteReady = true;
  }
}

/** Creates a live driver only after validating the compiled CLI path under the consumer. */
export function createPackedP1ReadLiveDriver(
  consumer: PreparedPackedConsumer,
  surfaces: PackedSurfaceResult,
): PackedP1ReadLiveDriver {
  requireCanonicalChild(consumer.consumerPath, surfaces.cliBinPath);
  return new PackedP1ReadLiveDriver(consumer, surfaces);
}
