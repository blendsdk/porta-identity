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
import { protectedCredentialDescriptors } from '../../fixtures/fixture-definition.js';
import {
  readProtectedRuntimeCredential,
  readPublicRuntimeFixtureManifest,
} from '../../fixtures/fixture-runtime-files.js';
import { runManagedChild } from '../scripts/managed-child.js';
import { requireCanonicalChild } from './filesystem.js';

import type { PackedAdminDataDriver } from './admin-data.js';
import type { PreparedPackedConsumer, PackedSurfaceResult } from './model.js';
import type {
  PackedAdminDataRequirement,
  PackedAdminDataResult,
} from '../tests/packed-admin-data-contract.js';

const probeResultSchema = z
  .object({ status: z.number().int().min(100).max(599), body: z.unknown() })
  .strict();

/** Returns a deterministic SHA-256 digest of normalized public data. */
function digest(value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex')}`;
}

/** Sorts object keys recursively while retaining response array order. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}

/** Collects the closed public field paths without retaining their values. */
function collectFieldPaths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.flatMap((child) => collectFieldPaths(child, `${prefix}[]`)))].sort();
  }
  if (typeof value !== 'object' || value === null) return prefix.length === 0 ? [] : [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    collectFieldPaths(child, prefix.length === 0 ? key : `${prefix}.${key}`),
  );
}

/** Converts an actual public response into the shared comparison shape. */
function normalizeResponse(status: number, body: unknown): PackedAdminDataResult {
  const records = Array.isArray(body)
    ? body
    : typeof body === 'object' && body !== null && Array.isArray(Reflect.get(body, 'data'))
      ? Reflect.get(body, 'data')
      : null;
  return {
    outcome: status >= 200 && status < 300 ? 'allowed' : 'rejected',
    status,
    bodyDigest: digest(body),
    recordCount: Array.isArray(records) ? records.length : null,
    publicFieldDigest: digest(collectFieldPaths(body)),
  };
}

/** Returns a content-and-metadata fingerprint without retaining credential bytes. */
function credentialFingerprint(path: string): string {
  if (!existsSync(path)) return 'absent';
  const metadata = lstatSync(path);
  const hash = createHash('sha256');
  hash.update(`${metadata.mode & 0o777}:${metadata.size}:`);
  if (metadata.isFile() && !metadata.isSymbolicLink()) hash.update(readFileSync(path));
  return `sha256:${hash.digest('hex')}`;
}

/** Live administrative-data driver bound to one owned stack and packed consumer. */
export class PackedAdminDataLiveDriver implements PackedAdminDataDriver {
  private readonly endpoints = activeEndpoints();
  private readonly apiPromise: Promise<APIRequestContext>;
  private readonly entities: ReadonlyMap<string, string>;

  /** Validates active fixture ownership before creating a raw observer. */
  public constructor(
    private readonly consumer: PreparedPackedConsumer,
    private readonly surfaces: PackedSurfaceResult,
  ) {
    const fixture = readPublicRuntimeFixtureManifest(this.endpoints.fixtureManifestPath);
    if (fixture.runId !== this.endpoints.runId) {
      throw new Error('packed administrative-data fixture run is not active');
    }
    this.entities = new Map(fixture.entities.map(({ alias, id }) => [alias, id]));
    this.apiPromise = request.newContext({ ignoreHTTPSErrors: true });
  }

  /** Captures user, client, and organization state without trusting client output. */
  public async observeState(): Promise<string> {
    const api = await this.apiPromise;
    const headers = this.headers();
    const [users, clients, organizations] = await Promise.all([
      this.getJson(
        api,
        `/api/admin/organizations/${this.entity('alpha')}/users?pageSize=100`,
        headers,
      ),
      this.getJson(
        api,
        `/api/admin/organizations/${this.entity('alpha')}/clients?pageSize=100`,
        headers,
      ),
      this.getJson(api, '/api/admin/organizations?pageSize=100', headers),
    ]);
    return digest({ users, clients, organizations });
  }

  /** Executes one exact request through the selected locally packed client. */
  public async executeClient(requirement: PackedAdminDataRequirement) {
    return requirement.client === 'sdk'
      ? this.executeSdk(requirement)
      : this.executeCliExport(requirement);
  }

  /** Executes the matching request through raw HTTP. */
  public async executeIndependentRaw(
    requirement: PackedAdminDataRequirement,
  ): Promise<PackedAdminDataResult> {
    const api = await this.apiPromise;
    const headers = this.headers();
    if (requirement.surface === 'bulk-duplicate-rejection') {
      const response = await api.post(`${this.endpoints.porta}/api/admin/bulk/users/status`, {
        headers,
        data: this.bulkRequest(),
      });
      return normalizeResponse(response.status(), await response.json());
    }
    if (requirement.surface === 'import-dry-run') {
      const response = await api.post(`${this.endpoints.porta}/api/admin/import`, {
        headers,
        data: this.importRequest(),
      });
      return normalizeResponse(response.status(), await response.json());
    }
    const response = await api.get(
      `${this.endpoints.porta}/api/admin/export/users?format=json&organizationId=${this.entity('alpha')}`,
      { headers },
    );
    return normalizeResponse(response.status(), JSON.parse(await response.text()));
  }

  /** Scans transient output against every protected runtime credential and foreign identity. */
  public async scanForbiddenOutput(
    boundedOutput: string,
  ): Promise<Readonly<Record<string, boolean>>> {
    const protectedValues = protectedCredentialDescriptors.map((descriptor) => ({
      kind: descriptor.kind,
      value: readProtectedRuntimeCredential(this.endpoints.credentialManifestPath, descriptor.ref),
    }));
    const contains = (values: readonly string[]) =>
      values.some((value) => value.length > 0 && boundedOutput.includes(value));
    const tokenValues = protectedValues
      .filter(({ kind }) => kind === 'token')
      .map(({ value }) => value);
    const credentialValues = protectedValues
      .filter(({ kind }) => kind === 'client-secret' || kind === 'cookie')
      .map(({ value }) => value);
    const recoveryValues = protectedValues
      .filter(({ kind }) => kind === 'password' || kind === 'totp' || kind === 'recovery-code')
      .map(({ value }) => value);
    return {
      'access-or-refresh-token': contains(tokenValues),
      'session-cookie-or-client-secret': contains(credentialValues),
      'password-or-recovery-material': contains(recoveryValues),
      'private-signing-key-material': /PRIVATE KEY|"(?:d|private[_-]?key|ciphertext)"\s*:/iu.test(
        boundedOutput,
      ),
      'foreign-tenant-identity': [this.entity('bravo'), this.entity('bravo-user-active')].some(
        (value) => boundedOutput.includes(value),
      ),
    };
  }

  /** Releases the independent HTTP observer. */
  public async dispose(): Promise<void> {
    const api = await this.apiPromise;
    await api.dispose();
  }

  /** Executes one packed SDK request through an owner-only transient input file. */
  private async executeSdk(requirement: PackedAdminDataRequirement) {
    const inputPath = resolve(this.consumer.consumerPath, `.admin-data-${randomUUID()}.json`);
    const probePath = resolve(this.consumer.consumerPath, `.admin-data-${randomUUID()}.mjs`);
    copyFileSync(
      resolve(process.cwd(), 'test-harness/consumers/admin-data-sdk-probe.mjs'),
      probePath,
    );
    const input = {
      server: this.endpoints.porta,
      token: this.token(),
      surface: requirement.surface,
      request:
        requirement.surface === 'bulk-duplicate-rejection'
          ? this.bulkRequest()
          : requirement.surface === 'import-dry-run'
            ? this.importRequest()
            : {
                entityType: 'users',
                format: 'json',
                organizationId: this.entity('alpha'),
              },
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
      if (
        child.code !== 0 ||
        child.signal !== null ||
        child.outputTruncated ||
        child.cleanupFailed
      ) {
        throw new Error('packed administrative-data SDK request failed');
      }
      const parsed = probeResultSchema.parse(JSON.parse(child.stdout));
      return {
        result: normalizeResponse(parsed.status, parsed.body),
        boundedOutput: `${child.stdout}${child.stderr}`,
      };
    } finally {
      rmSync(inputPath, { force: true });
      rmSync(probePath, { force: true });
    }
  }

  /** Executes the packed CLI export under a fresh isolated home and output file. */
  private async executeCliExport(requirement: PackedAdminDataRequirement) {
    if (requirement.surface !== 'export-users-json') {
      throw new Error('packed administrative-data CLI surface is unsupported');
    }
    const callerPath = resolve(homedir(), '.porta/credentials.json');
    const callerBefore = credentialFingerprint(callerPath);
    const home = resolve(this.consumer.consumerPath, '..', 'homes', randomUUID());
    const credentialDirectory = resolve(home, '.porta');
    const outputPath = resolve(this.consumer.consumerPath, `.admin-export-${randomUUID()}.json`);
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
    const mode = statSync(home).mode & 0o777;
    let result: PackedAdminDataResult | undefined;
    let boundedOutput: string | undefined;
    try {
      const child = await runManagedChild(
        process.execPath,
        [
          this.surfaces.cliBinPath,
          'exports',
          'download',
          '--entity-type',
          'users',
          '--format',
          'json',
          '--org-id',
          this.entity('alpha'),
          '--output',
          outputPath,
          '--server',
          this.endpoints.porta,
          '--insecure',
          '--json',
        ],
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
      if (
        child.code !== 0 ||
        child.signal !== null ||
        child.outputTruncated ||
        child.cleanupFailed
      ) {
        throw new Error('packed administrative-data CLI request failed');
      }
      const output = readFileSync(outputPath, 'utf8');
      result = normalizeResponse(200, JSON.parse(output));
      boundedOutput = `${output}${child.stdout}${child.stderr}`;
    } finally {
      rmSync(outputPath, { force: true });
      rmSync(home, { recursive: true, force: true });
    }
    if (result === undefined || boundedOutput === undefined) {
      throw new Error('packed administrative-data CLI result is absent');
    }
    return {
      result,
      boundedOutput,
      cliIsolation: {
        temporaryHomeMode: mode,
        temporaryHomeRemoved: !existsSync(home),
        callerCredentialFingerprintUnchanged: callerBefore === credentialFingerprint(callerPath),
      },
    };
  }

  /** Returns a tenant-safe duplicate-ID bulk request. */
  private bulkRequest() {
    const id = this.entity('alpha-user-active');
    return { ids: [id, id], action: 'deactivate', organizationId: this.entity('alpha') };
  }

  /** Returns a dry-run manifest whose tenant scope is independently owned by alpha. */
  private importRequest() {
    return {
      mode: 'dry-run',
      organizationId: this.entity('alpha'),
      manifest: { version: '1.0', organizations: [{ slug: 'alpha', name: 'Alpha Assurance' }] },
    };
  }

  /** Resolves a required public fixture alias. */
  private entity(alias: string): string {
    const value = this.entities.get(alias);
    if (value === undefined)
      throw new Error('packed administrative-data fixture identity is absent');
    return value;
  }

  /** Reads the full administrative token only inside the live owner process. */
  private token(): string {
    return readProtectedRuntimeCredential(
      this.endpoints.credentialManifestPath,
      'credential:super-admin:token:full',
    );
  }

  /** Creates the bearer header only inside the live owner process. */
  private headers(): Readonly<Record<string, string>> {
    return { Authorization: `Bearer ${this.token()}` };
  }

  /** Reads one successful JSON administrative response. */
  private async getJson(
    api: APIRequestContext,
    path: string,
    headers: Readonly<Record<string, string>>,
  ): Promise<unknown> {
    const response = await api.get(`${this.endpoints.porta}${path}`, { headers });
    if (response.status() !== 200) throw new Error('packed administrative-data state read failed');
    return response.json();
  }
}

/** Creates a live driver only after validating the compiled CLI path. */
export function createPackedAdminDataLiveDriver(
  consumer: PreparedPackedConsumer,
  surfaces: PackedSurfaceResult,
): PackedAdminDataLiveDriver {
  requireCanonicalChild(consumer.consumerPath, surfaces.cliBinPath);
  return new PackedAdminDataLiveDriver(consumer, surfaces);
}
