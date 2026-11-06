/**
 * Live packed-client driver for the service-account invitation journey.
 *
 * The driver uses only public management HTTP, the prepared packed consumer,
 * and a direct PostgreSQL read of the durable invitation row. It never reads a
 * token from the client output into evidence: tokens and plaintext secrets stay
 * in memory or in short-lived owner-only files that are removed in `finally`.
 *
 * @module assurance/compat/service-account-invitations-live
 */

import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { request, type APIRequestContext } from '@playwright/test';

import { activeEndpoints } from '../../fixtures/fixture-assurance.js';
import {
  readProtectedRuntimeCredential,
  readPublicRuntimeFixtureManifest,
} from '../../fixtures/fixture-runtime-files.js';
import { runManagedChild } from '../scripts/managed-child.js';
import { requireCanonicalChild } from './filesystem.js';
import type { PreparedPackedConsumer, PackedSurfaceResult } from './model.js';
import { buildPackedServiceAccountInvitationJourney } from './service-account-invitations.js';
import type { PackedServiceAccountInvitationJourneyFacts } from './service-account-invitations.js';

/** Token endpoint path for the control-plane organization. */
const TOKEN_PATH = '/porta-admin/token';

/** Exact feature scope requested and granted for the machine token. */
const FEATURE_SCOPE = 'admin:user:invite';

/** Bounded output from the packed probes; no token response may exceed this. */
const PROBE_OUTPUT_BYTES = 64 * 1024;

/** Returns a prefixed SHA-256 digest of in-memory bytes. */
function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

/** Return true for a plain object, never for an array or null. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Refuse to continue without a document field that must be a string. */
function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} is missing`);
  return value;
}

/** One direct durable observation from PostgreSQL, never from client output. */
interface DurableObservation {
  /** Durable invitation UUID. */
  readonly id: string;
  /** Whether the invitation is still pending. */
  readonly pending: boolean;
  /** Stable digest of the non-secret invitation projection. */
  readonly recordDigest: string;
}

/** Live journey driver used by the compatibility command. */
export class PackedServiceAccountInvitationLiveDriver {
  private readonly endpoints = activeEndpoints();
  private readonly apiPromise: Promise<APIRequestContext>;
  private readonly entities: ReadonlyMap<string, string>;
  private readonly humanToken: string;
  private probeDirectory: string | undefined;

  /** Bind one packed consumer and the active owned fixture identities. */
  public constructor(
    private readonly consumer: PreparedPackedConsumer,
    private readonly surfaces: PackedSurfaceResult,
  ) {
    const runtime = readPublicRuntimeFixtureManifest(this.endpoints.fixtureManifestPath);
    if (runtime.runId !== this.endpoints.runId) throw new Error('packed fixture run is not active');
    this.entities = new Map(runtime.entities.map((entry) => [entry.alias, entry.id]));
    this.humanToken = readProtectedRuntimeCredential(
      this.endpoints.credentialManifestPath,
      'credential:super-admin:token:full',
    );
    this.apiPromise = request.newContext({ ignoreHTTPSErrors: true });
    requireCanonicalChild(consumer.consumerPath, surfaces.cliBinPath);
  }

  /** Execute the complete journey and return only closed, digest-based facts. */
  public async execute(): Promise<PackedServiceAccountInvitationJourneyFacts> {
    const api = await this.apiPromise;
    const organizationId = this.entity('alpha');
    const controlPlaneOrganization = this.entity('super-admin');
    const applicationId = this.entity('porta-admin');
    const email = `service-account-${randomUUID()}@test-harness.local`;
    const targetDigest = digest(`${organizationId}:${email}`);
    let createdClientId: string | undefined;
    let invitationCountAfterCreate: number;
    let recordDigestAfterCreate: string;
    let replayStatus: number;
    let invitationCountAfterAttempt: number;
    let replayRecordDigest: string;

    try {
      const created = await api.post(`${this.endpoints.porta}/api/admin/clients`, {
        headers: { Authorization: `Bearer ${this.humanToken}` },
        data: {
          organizationId: controlPlaneOrganization,
          applicationId,
          clientName: `Service Account Journey ${randomUUID()}`,
          clientType: 'confidential',
          applicationType: 'web',
          redirectUris: ['https://localhost/callback'],
          grantTypes: ['client_credentials'],
          responseTypes: ['code'],
          scope: FEATURE_SCOPE,
          tokenEndpointAuthMethod: 'client_secret_basic',
          requirePkce: false,
        },
      });
      if (created.status() !== 201) throw new Error('owned journey client was not created');
      const createdBody = await created.json();
      const client = this.readPath(createdBody, ['data', 'client']);
      createdClientId = requireString(client.id, 'owned client id');
      const publicClientId = requireString(client.clientId, 'owned public client id');
      const initialSecret = this.readPath(createdBody, ['data', 'secret']);
      requireString(initialSecret.plaintext, 'initial client secret');

      const bindingResponse = await api.put(
        `${this.endpoints.porta}/api/admin/clients/${createdClientId}/service-account`,
        {
          headers: { Authorization: `Bearer ${this.humanToken}` },
          data: {
            accountEmail: email,
            targets: [
              { organizationId, allowedRoles: [], allowedClaimDefinitions: [] },
            ],
          },
        },
      );
      if (bindingResponse.status() !== 201) throw new Error('owned binding was not created');

      const replacement = await api.post(
        `${this.endpoints.porta}/api/admin/clients/${createdClientId}/secrets`,
        {
          headers: { Authorization: `Bearer ${this.humanToken}` },
          data: { label: 'packed service-account journey' },
        },
      );
      if (replacement.status() !== 201) throw new Error('replacement secret was not created');
      const replacementSecret = requireString(
        this.readPath(await replacement.json(), ['data', 'plaintext']),
        'replacement client secret',
      );
      const secretDigest = digest(replacementSecret);

      const directToken = await api.post(`${this.endpoints.porta}${TOKEN_PATH}`, {
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${publicClientId}:${replacementSecret}`,
          ).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        form: { grant_type: 'client_credentials', scope: FEATURE_SCOPE },
      });
      if (directToken.status() !== 200) throw new Error('packed feature token request failed');
      const tokenBody = (await directToken.json()) as Record<string, unknown>;
      const grantedScope = requireString(tokenBody.scope, 'granted token scope');
      const ttlSeconds = Number(tokenBody.expires_in);
      if (!Number.isFinite(ttlSeconds)) throw new Error('native token lifetime is missing');

      const invitation = await this.runInviteProbe({
        clientId: publicClientId,
        clientSecret: replacementSecret,
        organizationId,
        email,
      });

      const durable = this.observeDurable(organizationId, email);
      invitationCountAfterCreate = this.observeCount(organizationId, email);
      recordDigestAfterCreate = durable.recordDigest;

      const revocation = await api.delete(
        `${this.endpoints.porta}/api/admin/clients/${createdClientId}/service-account`,
        { headers: { Authorization: `Bearer ${this.humanToken}` } },
      );
      if (revocation.status() !== 204) throw new Error('owned binding was not revoked');

      const revoked = await api.get(
        `${this.endpoints.porta}/api/admin/clients/${createdClientId}/service-account`,
        { headers: { Authorization: `Bearer ${this.humanToken}` } },
      );
      if (revoked.status() !== 200) throw new Error('revoked binding was not readable');
      const bindingStatusAfter = requireString(
        this.readPath(await revoked.json(), ['data', 'status']),
        'binding status after revocation',
      );

      replayStatus = await this.runReplayProbe({
        token: invitation.token,
        organizationId,
        email,
      });
      invitationCountAfterAttempt = this.observeCount(organizationId, email);
      replayRecordDigest = this.observeDurable(organizationId, email).recordDigest;

      return {
        bindingStatus: 201,
        managementActor: 'human-super-admin',
        secretStatus: 201,
        secretDigest,
        tokenStatus: 200,
        grantedScope,
        ttlSeconds,
        invitationStatus: invitation.status,
        targetDigest,
        deliveryOutcome: invitation.deliveryOutcome,
        durableStatus: durable.pending ? 'pending' : 'accepted',
        invitationCountAfterCreate,
        recordDigest: recordDigestAfterCreate,
        revocationStatus: 204,
        bindingStatusAfter,
        replayStatus,
        invitationCountAfterAttempt,
        replayRecordDigest,
      };
    } finally {
      if (createdClientId !== undefined) {
        await api
          .delete(`${this.endpoints.porta}/api/admin/clients/${createdClientId}`, {
            headers: { Authorization: `Bearer ${this.humanToken}` },
          })
          .catch(() => undefined);
      }
      this.removeProbes();
    }
  }

  /** Release the independent HTTP context after the compatibility command finishes. */
  public async dispose(): Promise<void> {
    this.removeProbes();
    const api = await this.apiPromise;
    await api.dispose();
  }

  /** Resolve one generated fixture identifier without placing it in diagnostics. */
  private entity(alias: string): string {
    const value = this.entities.get(alias);
    if (value === undefined) throw new Error('packed fixture identity is absent');
    return value;
  }

  /** Read a nested response field and refuse an unexpected shape. */
  private readPath(value: unknown, path: readonly string[]): Record<string, unknown> {
    let current: unknown = value;
    for (const key of path) {
      if (!isRecord(current)) throw new Error('packed management response has an unexpected shape');
      current = current[key];
    }
    if (!isRecord(current)) throw new Error('packed management response has an unexpected shape');
    return current;
  }

  /** Write one owned probe file under the prepared consumer and remember its path. */
  private writeProbe(source: string): string {
    if (this.probeDirectory === undefined) {
      this.probeDirectory = resolve(this.consumer.consumerPath, `.probe-${randomUUID()}`);
      mkdirSync(this.probeDirectory, { recursive: true, mode: 0o700 });
    }
    const path = resolve(this.probeDirectory, `probe-${randomUUID()}.mjs`);
    writeFileSync(path, source, { mode: 0o600 });
    return path;
  }

  /** Remove every owner-only probe file created by this journey. */
  private removeProbes(): void {
    if (this.probeDirectory !== undefined) {
      rmSync(this.probeDirectory, { recursive: true, force: true });
      this.probeDirectory = undefined;
    }
  }

  /** Run one packed SDK invitation with the client-credentials provider. */
  private async runInviteProbe(input: {
    readonly clientId: string;
    readonly clientSecret: string;
    readonly organizationId: string;
    readonly email: string;
  }): Promise<{ status: number; deliveryOutcome: 'sent' | 'failed' | 'unknown'; token: string }> {
    const probe = this.writeProbe(`
import { createPortaClient } from '@portaidentity/sdk';
import { createNodeTransport, createClientCredentialsAuth } from '@portaidentity/sdk/node';
const input = JSON.parse(process.argv[2]);
const auth = createClientCredentialsAuth({
  tokenEndpoint: input.server + '/porta-admin/token',
  clientId: input.clientId,
  clientSecret: input.clientSecret,
  scope: 'admin:user:invite',
});
const token = await auth.getToken();
const client = createPortaClient({ transport: createNodeTransport({ baseUrl: input.server, auth }) });
const result = await client.users.invite({ organizationId: input.organizationId, email: input.email });
console.log(JSON.stringify({ token, delivery: result.emailDelivery }));
`);
    try {
      const result = await runManagedChild(process.execPath, [probe, JSON.stringify({
        server: this.endpoints.porta,
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        organizationId: input.organizationId,
        email: input.email,
      })], {
        cwd: this.consumer.consumerPath,
        env: process.env,
        stdio: 'pipe',
        maxOutputBytes: PROBE_OUTPUT_BYTES,
        timeoutMilliseconds: 60_000,
        terminationGraceMilliseconds: 2_000,
        cleanup: () => undefined,
      });
      if (result.code !== 0 || result.signal !== null || result.outputTruncated) {
        throw new Error('packed SDK invitation journey failed');
      }
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      const token = requireString(parsed.token, 'packed native token');
      const delivery = requireString(parsed.delivery, 'packed delivery outcome');
      if (delivery !== 'sent' && delivery !== 'failed' && delivery !== 'unknown') {
        throw new Error('packed delivery outcome is unknown');
      }
      return { status: 201, deliveryOutcome: delivery, token };
    } finally {
      rmSync(probe, { force: true });
    }
  }

  /** Replay the previously issued native token through the packed SDK client. */
  private async runReplayProbe(input: {
    readonly token: string;
    readonly organizationId: string;
    readonly email: string;
  }): Promise<number> {
    const probe = this.writeProbe(`
import { createPortaClient } from '@portaidentity/sdk';
import { createNodeTransport, createTokenAuth } from '@portaidentity/sdk/node';
const input = JSON.parse(process.argv[2]);
const client = createPortaClient({
  transport: createNodeTransport({ baseUrl: input.server, auth: createTokenAuth({ token: input.token }) }),
});
try {
  await client.users.invite({ organizationId: input.organizationId, email: input.email });
  console.log(JSON.stringify({ status: 201 }));
} catch (error) {
  console.log(JSON.stringify({ status: typeof error?.status === 'number' ? error.status : 401 }));
}
`);
    try {
      const result = await runManagedChild(process.execPath, [probe, JSON.stringify({
        server: this.endpoints.porta,
        token: input.token,
        organizationId: input.organizationId,
        email: input.email,
      })], {
        cwd: this.consumer.consumerPath,
        env: process.env,
        stdio: 'pipe',
        maxOutputBytes: PROBE_OUTPUT_BYTES,
        timeoutMilliseconds: 60_000,
        terminationGraceMilliseconds: 2_000,
        cleanup: () => undefined,
      });
      if (result.code !== 0 || result.signal !== null || result.outputTruncated) {
        throw new Error('packed replay journey failed');
      }
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      if (typeof parsed.status !== 'number') throw new Error('packed replay status is missing');
      return parsed.status;
    } finally {
      rmSync(probe, { force: true });
    }
  }

  /** Read the exact durable invitation through a direct PostgreSQL query. */
  private observeDurable(organizationId: string, email: string): DurableObservation {
    const container = this.postgresContainer();
    const row = this.psql(
      container,
      `SELECT id || '|' || (used_at IS NULL)::text || '|' || coalesce(details::text, '')
         FROM invitation_tokens
        WHERE organization_id = '${organizationId}' AND lower(email) = lower('${email}')
        ORDER BY created_at DESC LIMIT 1`,
    ).trim();
    if (row.length === 0) throw new Error('durable invitation is absent');
    const [id, pending, details = ''] = row.split('|');
    if (id === undefined || pending === undefined) throw new Error('durable invitation is malformed');
    return { id, pending: pending === 'true', recordDigest: digest(`${id}:${details}`) };
  }

  /** Count durable invitations for the exact target. */
  private observeCount(organizationId: string, email: string): number {
    const container = this.postgresContainer();
    const value = Number(this.psql(
      container,
      `SELECT count(*) FROM invitation_tokens
        WHERE organization_id = '${organizationId}' AND lower(email) = lower('${email}')`,
    ).trim());
    if (!Number.isSafeInteger(value)) throw new Error('durable invitation count is invalid');
    return value;
  }

  /** Find the owned PostgreSQL container inside the active compose project. */
  private postgresContainer(): string {
    const output = execFileSync(
      'docker',
      [
        'ps',
        '--filter',
        `label=com.docker.compose.project=${this.endpoints.composeProject}`,
        '--filter',
        'label=com.docker.compose.service=postgres',
        '--format',
        '{{.ID}}',
      ],
      { encoding: 'utf8', timeout: 30_000 },
    ).trim();
    const id = output.split('\n')[0];
    if (!id) throw new Error('assurance PostgreSQL container is absent');
    return id;
  }

  /** Execute one read-only SQL statement with the container's own database identity. */
  private psql(container: string, sql: string): string {
    return execFileSync(
      'docker',
      [
        'exec',
        container,
        'sh',
        '-lc',
        'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "$0"',
        sql,
      ],
      { encoding: 'utf8', timeout: 30_000 },
    );
  }
}

/**
 * Create the live journey driver after validating the packed consumer entrypoints.
 *
 * @param consumer - Prepared packed consumer owned by the compatibility command.
 * @param surfaces - Validated packed package surfaces.
 * @returns A driver that must be disposed by the command.
 */
export function createPackedServiceAccountInvitationLiveDriver(
  consumer: PreparedPackedConsumer,
  surfaces: PackedSurfaceResult,
): PackedServiceAccountInvitationLiveDriver {
  return new PackedServiceAccountInvitationLiveDriver(consumer, surfaces);
}

/** Re-export the evidence builder so the command composes exactly one shape. */
export { buildPackedServiceAccountInvitationJourney };
