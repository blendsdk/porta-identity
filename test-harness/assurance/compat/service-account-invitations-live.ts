/**
 * Live packed-client driver for the service-account invitation journey.
 *
 * The driver uses only public management HTTP, the prepared packed consumer, a
 * direct PostgreSQL read and short-lived owner-only files for machine material.
 * Every evidence boolean is derived from an observation; probes receive their
 * input and return their output through mode-0600 files so no secret appears in
 * a process argument or in captured output.
 *
 * @module assurance/compat/service-account-invitations-live
 */

import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
import type { PackedServiceAccountInvitationJourneyFacts } from './service-account-invitations.js';

/** Token endpoint path for the control-plane organization. */
const TOKEN_PATH = '/porta-admin/token';

/** Exact feature scope requested and granted for the machine token. */
const FEATURE_SCOPE = 'admin:user:invite';

/** Bounded output from the packed probes. */
const PROBE_OUTPUT_BYTES = 64 * 1024;

/** Exact UUID spelling accepted for identifiers interpolated into SQL. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Safe address shape for the generated invitation target. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns a prefixed SHA-256 digest of in-memory text. */
function digest(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

/** Return true for a plain object, never for an array or null. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Refuse to continue without a string field. */
function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} is missing`);
  return value;
}

/** Force one identifier into the exact UUID shape accepted by the database query. */
function requireUuid(value: string, label: string): string {
  if (!UUID_PATTERN.test(value)) throw new Error(`${label} is not a UUID`);
  return value;
}

/** One direct durable observation from PostgreSQL, never from client output. */
interface DurableObservation {
  /** Durable invitation UUID. */
  readonly id: string;
  /** Whether the invitation is still pending. */
  readonly pending: boolean;
  /** Stable digest of the complete non-secret projection. */
  readonly recordDigest: string;
}

/** Observable client creation response. */
interface OwnedClient {
  readonly id: string;
  readonly publicClientId: string;
  readonly clientType: string;
  readonly organizationId: string;
  readonly initialSecret: string;
}

/** Live journey driver used by the compatibility command. */
export class PackedServiceAccountInvitationLiveDriver {
  private readonly endpoints = activeEndpoints();
  private readonly apiPromise: Promise<APIRequestContext>;
  private readonly entities: ReadonlyMap<string, string>;
  private readonly humanToken: string;
  private readonly baseUrl: string;
  private readonly certificatePath: string;
  private probeDirectory: string | undefined;

  /** Bind one packed consumer and the active owned fixture identities. */
  public constructor(
    private readonly consumer: PreparedPackedConsumer,
    surfaces: PackedSurfaceResult,
  ) {
    const runtime = readPublicRuntimeFixtureManifest(this.endpoints.fixtureManifestPath);
    if (runtime.runId !== this.endpoints.runId) throw new Error('packed fixture run is not active');
    this.entities = new Map(runtime.entities.map((entry) => [entry.alias, entry.id]));
    this.humanToken = readProtectedRuntimeCredential(
      this.endpoints.credentialManifestPath,
      'credential:super-admin:token:full',
    );
    this.baseUrl = this.assertOwnedEndpoint(this.endpoints.porta);
    this.certificatePath = this.readOwnedCertificatePath();
    this.apiPromise = request.newContext({ ignoreHTTPSErrors: true });
    requireCanonicalChild(consumer.consumerPath, surfaces.cliBinPath);
  }

  /** Execute the complete journey and return closed, observed facts. */
  public async execute(): Promise<PackedServiceAccountInvitationJourneyFacts> {
    const api = await this.apiPromise;
    const organizationId = requireUuid(this.entity('alpha'), 'invitation organization');
    const controlPlaneOrganization = requireUuid(this.entity('super-admin'), 'control plane');
    const applicationId = requireUuid(this.entity('porta-admin'), 'application');
    const email = `service-account-${randomUUID()}@test-harness.local`;
    const controlEmail = `service-account-control-${randomUUID()}@test-harness.local`;
    if (!EMAIL_PATTERN.test(email) || !EMAIL_PATTERN.test(controlEmail)) {
      throw new Error('generated target is not an address');
    }
    const targetDigest = digest(`${organizationId}:${email}`);
    const clientName = `Service Account Journey ${randomUUID()}`;
    let createdClientId: string | undefined;
    let serviceAccountId: string | undefined;
    let invitationRemoved = false;
    let accountRemoved = false;

    try {
      const created = await api.post(`${this.baseUrl}/api/admin/clients`, {
        headers: { Authorization: `Bearer ${this.humanToken}` },
        data: {
          organizationId: controlPlaneOrganization,
          applicationId,
          clientName,
          clientType: 'confidential',
          applicationType: 'web',
          redirectUris: ['https://localhost/callback'],
          grantTypes: ['client_credentials'],
          responseTypes: ['code'],
          scope: FEATURE_SCOPE,
          tokenEndpointAuthMethod: 'client_secret_post',
          requirePkce: false,
        },
      });
      if (created.status() !== 201) throw new Error('owned journey client was not created');
      const ownedClient = this.readOwnedClient(await created.json());
      createdClientId = ownedClient.id;

      const bindingResponse = await api.put(
        `${this.baseUrl}/api/admin/clients/${ownedClient.id}/service-account`,
        {
          headers: { Authorization: `Bearer ${this.humanToken}` },
          data: {
            accountEmail: email,
            targets: [{ organizationId, allowedRoles: [], allowedClaimDefinitions: [] }],
          },
        },
      );
      if (bindingResponse.status() !== 201) throw new Error('owned binding was not created');
      const binding = this.readDataRecord(await bindingResponse.json(), 'binding create');
      serviceAccountId = requireUuid(
        requireString(binding.serviceAccountId, 'binding account'),
        'binding account',
      );
      const policyTargetIncludesInvitationOrganization = this.bindingTargetsOrganization(
        binding.targets,
        organizationId,
      );

      const replacement = await api.post(
        `${this.baseUrl}/api/admin/clients/${ownedClient.id}/secrets`,
        {
          headers: { Authorization: `Bearer ${this.humanToken}` },
          data: { label: 'packed service-account journey' },
        },
      );
      if (replacement.status() !== 201) throw new Error('replacement secret was not created');
      const replacementSecret = requireString(
        this.readField(await replacement.json(), ['data', 'plaintext'], 'replacement secret'),
        'replacement client secret',
      );
      const secretDigest = digest(replacementSecret);

      const initialStatus = await this.directTokenStatus(
        ownedClient.publicClientId,
        ownedClient.initialSecret,
      );
      const preBindingSecretsRetired = initialStatus === 401;
      if (!preBindingSecretsRetired) {
        throw new Error('pre-binding credential was not retired');
      }

      const token = await this.directToken(ownedClient.publicClientId, replacementSecret);
      const grantedScope = requireString(token.scope, 'granted token scope');
      const ttlSeconds = Number(token.expiresIn);
      if (!Number.isFinite(ttlSeconds)) throw new Error('native token lifetime is missing');
      const accessToken = requireString(token.accessToken, 'native access token');
      const tokenOpaqueNative = !/^[^.]+\.[^.]+\.[^.]+$/.test(accessToken);

      const invitation = await this.runInviteProbe({
        clientId: ownedClient.publicClientId,
        clientSecret: replacementSecret,
        organizationId,
        email,
      });

      const durable = this.observeDurable(organizationId, email);
      const invitationCountAfterCreate = this.observeInvitationCount(organizationId, email);
      const eagerUserCreated = this.observeUserCount(organizationId, email) > 0;
      const accountOwnedByRun = this.observeOwnedServiceAccount(
        serviceAccountId,
        controlPlaneOrganization,
      );

      const controlStatus = await this.runControlProbe({
        token: invitation.token,
        organizationId,
        email: controlEmail,
      });

      const revocation = await api.delete(
        `${this.baseUrl}/api/admin/clients/${ownedClient.id}/service-account`,
        { headers: { Authorization: `Bearer ${this.humanToken}` } },
      );
      if (revocation.status() !== 204) throw new Error('owned binding was not revoked');

      const revoked = await api.get(
        `${this.baseUrl}/api/admin/clients/${ownedClient.id}/service-account`,
        { headers: { Authorization: `Bearer ${this.humanToken}` } },
      );
      if (revoked.status() !== 200) throw new Error('revoked binding was not readable');
      const bindingStatusAfter = requireString(
        this.readField(await revoked.json(), ['data', 'status'], 'binding read'),
        'binding status after revocation',
      );

      const replayStatus = await this.runReplayProbe({
        token: invitation.token,
        organizationId,
        email,
      });
      if (replayStatus === 401 || replayStatus === 403) {
        // A definite denial must preserve the exact durable projection.
      } else if (replayStatus !== 201) {
        throw new Error('packed replay returned an unclassified denial status');
      }
      const invitationCountAfterAttempt = this.observeInvitationCount(organizationId, email);
      const replayObservation = this.observeDurable(organizationId, email);

      const removed = await api.delete(`${this.baseUrl}/api/admin/clients/${ownedClient.id}`, {
        headers: { Authorization: `Bearer ${this.humanToken}` },
      });
      const clientRemoved = removed.status() === 204;
      createdClientId = undefined;
      accountRemoved = clientRemoved && this.removeServiceAccount(serviceAccountId);
      invitationRemoved =
        this.removeInvitation(organizationId, email) &&
        this.removeInvitation(organizationId, controlEmail);
      const probesRemoved = this.removeProbes();

      return {
        clientConfidential: ownedClient.clientType === 'confidential',
        clientControlPlane: ownedClient.organizationId === controlPlaneOrganization,
        accountOwnedByRun,
        policyTargetIncludesInvitationOrganization,
        preBindingSecretsRetired,
        secretDigest,
        tokenOpaqueNative,
        grantedScope,
        ttlSeconds,
        invitationStatus: invitation.status,
        invitationCountAfterCreate,
        eagerUserCreated,
        durableStatus: durable.pending ? 'pending' : 'accepted',
        recordDigest: durable.recordDigest,
        controlStatus,
        revocationStatus: revocation.status(),
        bindingStatusAfter,
        replayStatus,
        invitationCountAfterAttempt,
        replayPending: replayObservation.pending,
        replayRecordDigest: replayObservation.recordDigest,
        targetDigest,
        deliveryOutcome: invitation.deliveryOutcome,
        clientRemoved,
        accountRemoved,
        invitationRemoved,
        probesRemoved,
      };
    } finally {
      if (createdClientId !== undefined) {
        await api
          .delete(`${this.baseUrl}/api/admin/clients/${createdClientId}`, {
            headers: { Authorization: `Bearer ${this.humanToken}` },
          })
          .catch(() => undefined);
      }
      // Target-owned invitations and the permanent account are removed even when a later step
      // throws; cleanup evidence is only considered complete after these attempts.
      if (!invitationRemoved) {
        this.removeInvitation(organizationId, email);
        this.removeInvitation(organizationId, controlEmail);
      }
      if (!accountRemoved && serviceAccountId !== undefined) {
        this.removeServiceAccount(serviceAccountId);
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

  /** Accept only the owned harness origin, refusing redirects to other hosts. */
  private assertOwnedEndpoint(value: string): string {
    const url = new URL(value);
    if (url.protocol !== 'https:') throw new Error('owned harness endpoint must use HTTPS');
    const ownedHost =
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname.endsWith('.ci.portaidentity.com');
    if (!ownedHost) throw new Error('owned harness endpoint is not a local test origin');
    return value.replace(/\/$/, '');
  }

  /** Read the owned certificate path recorded by the active lifecycle manifest. */
  private readOwnedCertificatePath(): string {
    const active = JSON.parse(
      readFileSync(
        resolve(import.meta.dirname, '../../.assurance-runtime/active-run.json'),
        'utf8',
      ),
    ) as unknown;
    if (!isRecord(active) || !isRecord(active.manifest)) {
      throw new Error('active lifecycle manifest is absent');
    }
    const path = requireString(active.manifest.certificatePath, 'owned certificate');
    if (!existsSync(path)) throw new Error('owned certificate is absent');
    return path;
  }

  /** Parse the exact owned client creation response. */
  private readOwnedClient(value: unknown): OwnedClient {
    const clientValue = this.readField(value, ['data', 'client'], 'client create');
    if (!isRecord(clientValue)) throw new Error('packed client create response has no client');
    const initialSecret = requireString(
      this.readField(value, ['data', 'secret', 'plaintext'], 'initial secret'),
      'initial client secret',
    );
    return {
      id: requireString(clientValue.id, 'owned client id'),
      publicClientId: requireString(clientValue.clientId, 'owned public client id'),
      clientType: requireString(clientValue.clientType, 'owned client type'),
      organizationId: requireString(clientValue.organizationId, 'owned client organization'),
      initialSecret,
    };
  }

  /** Read a `{data: object}` response. */
  private readDataRecord(value: unknown, label: string): Record<string, unknown> {
    const data = this.readField(value, ['data'], label);
    if (!isRecord(data)) throw new Error(`packed ${label} response has no data`);
    return data;
  }

  /** Read one nested response field, rejecting any missing object on the way. */
  private readField(value: unknown, path: readonly string[], label: string): unknown {
    let current: unknown = value;
    for (const key of path) {
      if (!isRecord(current)) throw new Error(`packed ${label} response has an unexpected shape`);
      current = current[key];
    }
    return current;
  }

  /** Confirm the binding policy names the invitation organization. */
  private bindingTargetsOrganization(value: unknown, organizationId: string): boolean {
    if (!Array.isArray(value)) return false;
    return value.some(
      (target) => isRecord(target) && target.organizationId === organizationId,
    );
  }

  /** Create one owner-only probe directory inside the prepared consumer. */
  private probeDirectoryPath(): string {
    if (this.probeDirectory === undefined) {
      this.probeDirectory = resolve(this.consumer.consumerPath, `.probe-${randomUUID()}`);
      mkdirSync(this.probeDirectory, { recursive: true, mode: 0o700 });
    }
    return this.probeDirectory;
  }

  /** Write one owner-only file under the probe directory. */
  private writeProbeFile(name: string, source: string): string {
    const path = resolve(this.probeDirectoryPath(), name);
    writeFileSync(path, source, { mode: 0o600 });
    return path;
  }

  /** Remove every owner-only probe file created by this journey. */
  private removeProbes(): boolean {
    if (this.probeDirectory === undefined) return true;
    rmSync(this.probeDirectory, { recursive: true, force: true });
    const removed = !existsSync(this.probeDirectory);
    this.probeDirectory = undefined;
    return removed;
  }

  /** Minimal child environment for packed probes. */
  private probeEnvironment(): NodeJS.ProcessEnv {
    return {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_EXTRA_CA_CERTS: this.certificatePath,
    };
  }

  /** Run one packed SDK invitation with the client-credentials provider. */
  private async runInviteProbe(input: {
    readonly clientId: string;
    readonly clientSecret: string;
    readonly organizationId: string;
    readonly email: string;
  }): Promise<{ status: number; deliveryOutcome: 'sent' | 'failed' | 'unknown'; token: string }> {
    const probe = this.writeProbeFile('invite.mjs', `
import { readFileSync, writeFileSync } from 'node:fs';
import { createNodeTransport, createClientCredentialsAuth } from '@portaidentity/sdk/node';
const [inputPath, outputPath] = process.argv.slice(2);
const input = JSON.parse(readFileSync(inputPath, 'utf8'));
const write = (value) => writeFileSync(outputPath, JSON.stringify(value), { mode: 0o600 });
const describe = (error) => typeof error?.status === 'number' ? 'status-' + error.status : 'exception';
const auth = createClientCredentialsAuth({
  tokenEndpoint: input.server + '/porta-admin/token',
  clientId: input.clientId,
  clientSecret: input.clientSecret,
  scope: 'admin:user:invite',
});
let token;
try { token = await auth.getToken(); } catch (error) { write({ failed: 'token-' + describe(error) }); process.exit(0); }
const transport = createNodeTransport({ baseUrl: input.server, auth });
try {
  const first = await transport.request({
    method: 'POST',
    path: '/organizations/' + input.organizationId + '/users/invite',
    body: { email: input.email },
  });
  const delivery = first.body?.data?.emailDelivery ?? 'unknown';
  write({ token, status: first.status, delivery });
} catch (error) { write({ failed: 'invite-' + describe(error) }); }
`);
    const inputPath = this.writeProbeFile('invite-input.json', JSON.stringify({
      server: this.baseUrl,
      clientId: input.clientId,
      clientSecret: input.clientSecret,
      organizationId: input.organizationId,
      email: input.email,
    }));
    const outputPath = resolve(this.probeDirectoryPath(), 'invite-output.json');
    try {
      const result = await runManagedChild(process.execPath, [probe, inputPath, outputPath], {
        cwd: this.consumer.consumerPath,
        env: this.probeEnvironment(),
        stdio: 'pipe',
        maxOutputBytes: PROBE_OUTPUT_BYTES,
        timeoutMilliseconds: 60_000,
        terminationGraceMilliseconds: 2_000,
        cleanup: () => undefined,
      });
      if (result.code !== 0 || result.signal !== null || result.outputTruncated) {
        throw new Error('packed SDK invitation probe failed');
      }
      const parsed = this.readProbeOutput(outputPath);
      if (parsed.failed !== undefined) {
        throw new Error(`packed SDK invitation ${requireString(parsed.failed, 'probe failure')}`);
      }
      const status = parsed.status;
      if (status !== 201) throw new Error('packed invite did not return 201');
      const delivery = requireString(parsed.delivery, 'packed delivery outcome');
      if (delivery !== 'sent' && delivery !== 'failed' && delivery !== 'unknown') {
        throw new Error('packed delivery outcome is unknown');
      }
      return {
        status,
        deliveryOutcome: delivery,
        token: requireString(parsed.token, 'packed native token'),
      };
    } finally {
      rmSync(inputPath, { force: true });
      rmSync(outputPath, { force: true });
      rmSync(probe, { force: true });
    }
  }

  /** Prove the previously issued token still authorizes before revocation. */
  private async runControlProbe(input: {
    readonly token: string;
    readonly organizationId: string;
    readonly email: string;
  }): Promise<number> {
    const probe = this.writeProbeFile('control.mjs', `
import { readFileSync, writeFileSync } from 'node:fs';
import { createNodeTransport, createTokenAuth } from '@portaidentity/sdk/node';
const [inputPath, outputPath] = process.argv.slice(2);
const input = JSON.parse(readFileSync(inputPath, 'utf8'));
const transport = createNodeTransport({ baseUrl: input.server, auth: createTokenAuth({ token: input.token }) });
try {
  const response = await transport.request({ method: 'POST', path: '/organizations/' + input.organizationId + '/users/invite', body: { email: input.email } });
  writeFileSync(outputPath, JSON.stringify({ status: response.status }), { mode: 0o600 });
} catch (error) {
  writeFileSync(outputPath, JSON.stringify({ status: typeof error?.status === 'number' ? error.status : 0 }), { mode: 0o600 });
}
`);
    return this.runStatusProbe(probe, {
      server: this.baseUrl,
      token: input.token,
      organizationId: input.organizationId,
      email: input.email,
    });
  }

  /** Replay the previously issued token after revocation. */
  private async runReplayProbe(input: {
    readonly token: string;
    readonly organizationId: string;
    readonly email: string;
  }): Promise<number> {
    const probe = this.writeProbeFile('replay.mjs', `
import { readFileSync, writeFileSync } from 'node:fs';
import { createNodeTransport, createTokenAuth } from '@portaidentity/sdk/node';
const [inputPath, outputPath] = process.argv.slice(2);
const input = JSON.parse(readFileSync(inputPath, 'utf8'));
const transport = createNodeTransport({ baseUrl: input.server, auth: createTokenAuth({ token: input.token }) });
try {
  const response = await transport.request({ method: 'POST', path: '/organizations/' + input.organizationId + '/users/invite', body: { email: input.email } });
  writeFileSync(outputPath, JSON.stringify({ status: response.status }), { mode: 0o600 });
} catch (error) {
  if (typeof error?.status !== 'number') {
    writeFileSync(outputPath, JSON.stringify({ failed: 'transport' }), { mode: 0o600 });
  } else {
    writeFileSync(outputPath, JSON.stringify({ status: error.status }), { mode: 0o600 });
  }
}
`);
    return this.runStatusProbe(probe, {
      server: this.baseUrl,
      token: input.token,
      organizationId: input.organizationId,
      email: input.email,
    }, true);
  }

  /** Run one status-returning probe through owner-only files. */
  private async runStatusProbe(
    probe: string,
    payload: Record<string, unknown>,
    rejectFailure = false,
  ): Promise<number> {
    const inputPath = this.writeProbeFile(`${randomUUID()}-input.json`, JSON.stringify(payload));
    const outputPath = resolve(this.probeDirectoryPath(), `${randomUUID()}-output.json`);
    try {
      const result = await runManagedChild(process.execPath, [probe, inputPath, outputPath], {
        cwd: this.consumer.consumerPath,
        env: this.probeEnvironment(),
        stdio: 'pipe',
        maxOutputBytes: PROBE_OUTPUT_BYTES,
        timeoutMilliseconds: 60_000,
        terminationGraceMilliseconds: 2_000,
        cleanup: () => undefined,
      });
      if (result.code !== 0 || result.signal !== null || result.outputTruncated) {
        throw new Error('packed replay probe failed');
      }
      const parsed = this.readProbeOutput(outputPath);
      if (parsed.failed !== undefined) {
        if (rejectFailure) throw new Error('packed replay transport failed');
        throw new Error('packed control transport failed');
      }
      if (typeof parsed.status !== 'number') throw new Error('packed probe status is missing');
      return parsed.status;
    } finally {
      rmSync(inputPath, { force: true });
      rmSync(outputPath, { force: true });
      rmSync(probe, { force: true });
    }
  }

  /** Read one probe output file as a plain object. */
  private readProbeOutput(path: string): Record<string, unknown> {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!isRecord(parsed)) throw new Error('packed probe output is malformed');
    return parsed;
  }

  /** Request one direct token response for evidence and retirement checks. */
  private async directToken(
    clientId: string,
    clientSecret: string,
  ): Promise<{ accessToken: string; scope: unknown; expiresIn: unknown }> {
    const response = await this.directTokenResponse(clientId, clientSecret);
    if (response.status() !== 200) throw new Error('packed feature token request failed');
    const body: unknown = await response.json();
    if (!isRecord(body)) throw new Error('token response is malformed');
    return {
      accessToken: requireString(body.access_token, 'native access token'),
      scope: body.scope,
      expiresIn: body.expires_in,
    };
  }

  /** Observe whether one client credential is still accepted. */
  private async directTokenStatus(clientId: string, clientSecret: string): Promise<number> {
    return (await this.directTokenResponse(clientId, clientSecret)).status();
  }

  /** Send one direct client-credentials request with the exact client method. */
  private async directTokenResponse(clientId: string, clientSecret: string) {
    const api = await this.apiPromise;
    return api.post(`${this.baseUrl}${TOKEN_PATH}`, {
      form: {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: FEATURE_SCOPE,
      },
    });
  }

  /** Read the exact durable invitation through a direct PostgreSQL query. */
  private observeDurable(organizationId: string, email: string): DurableObservation {
    const container = this.postgresContainer();
    const row = this.psql(
      container,
      `SELECT id || E'\\t' || (used_at IS NULL)::text || E'\\t' || coalesce(details::text, '')
         FROM invitation_tokens
        WHERE organization_id = '${requireUuid(organizationId, 'organization')}'
          AND lower(email) = lower('${email}')
        ORDER BY created_at DESC LIMIT 1`,
    ).trim();
    if (row.length === 0) throw new Error('durable invitation is absent');
    const [id, pending, details = ''] = row.split('\t');
    if (id === undefined || pending === undefined) throw new Error('durable invitation is malformed');
    return {
      id,
      pending: pending === 'true',
      recordDigest: digest(`${id}\t${pending}\t${details}`),
    };
  }

  /** Count durable invitations for the exact target. */
  private observeInvitationCount(organizationId: string, email: string): number {
    return this.countQuery(
      `SELECT count(*) FROM invitation_tokens
        WHERE organization_id = '${requireUuid(organizationId, 'organization')}'
          AND lower(email) = lower('${email}')`,
    );
  }

  /** Count users created for the exact target. */
  private observeUserCount(organizationId: string, email: string): number {
    return this.countQuery(
      `SELECT count(*) FROM users
        WHERE organization_id = '${requireUuid(organizationId, 'organization')}'
          AND lower(email) = lower('${email}')`,
    );
  }

  /** Confirm the bound account is the permanent classified user in the control plane. */
  private observeOwnedServiceAccount(accountId: string, controlPlaneOrganization: string): boolean {
    const value = this.psql(
      this.postgresContainer(),
      `SELECT count(*) FROM users
        WHERE id = '${requireUuid(accountId, 'service account')}'
          AND organization_id = '${requireUuid(controlPlaneOrganization, 'control plane')}'
          AND is_service_account = true`,
    ).trim();
    return value === '1';
  }

  /** Remove the journey's durable invitation row and report whether it is gone. */
  private removeInvitation(organizationId: string, email: string): boolean {
    this.psql(
      this.postgresContainer(),
      `DELETE FROM invitation_tokens
        WHERE organization_id = '${requireUuid(organizationId, 'organization')}'
          AND lower(email) = lower('${email}')`,
    );
    return this.observeInvitationCount(organizationId, email) === 0;
  }

  /** Remove the owned permanent account row and report whether it is gone. */
  private removeServiceAccount(accountId: string): boolean {
    this.psql(
      this.postgresContainer(),
      `DELETE FROM users WHERE id = '${requireUuid(accountId, 'service account')}'
         AND is_service_account = true`,
    );
    const value = this.psql(
      this.postgresContainer(),
      `SELECT count(*) FROM users WHERE id = '${requireUuid(accountId, 'service account')}'`,
    ).trim();
    return value === '0';
  }

  /** Run one count query and require a safe integer. */
  private countQuery(sql: string): number {
    const value = Number(this.psql(this.postgresContainer(), sql).trim());
    if (!Number.isSafeInteger(value)) throw new Error('durable count is invalid');
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

  /** Execute one SQL statement with the container's own database identity. */
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
