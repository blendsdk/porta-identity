import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
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
  PackedTenantAdminClientObservation,
  PackedTenantAdminJourneyDriver,
  PackedTenantAdminJourneyRequirement,
  PackedTenantAdminTargetObservation,
} from './tenant-admin.js';

const sdkOutcomeSchema = z
  .object({ status: z.number().int(), targetIds: z.array(z.string().min(1)) })
  .strict();
const responseEnvelopeSchema = z.object({ data: z.unknown() }).passthrough();

/** Returns a content-and-metadata fingerprint without exposing credential bytes. */
function credentialFingerprint(path: string): string {
  if (!existsSync(path)) return 'absent';
  const metadata = lstatSync(path);
  const digest = createHash('sha256');
  digest.update(`${metadata.mode & 0o777}:${metadata.size}:`);
  if (metadata.isFile() && !metadata.isSymbolicLink()) digest.update(readFileSync(path));
  else digest.update('non-regular');
  return `sha256:${digest.digest('hex')}`;
}

/** Converts a value into a stable digest without retaining public response fields. */
function observationDigest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

/** Maps one observed HTTP status to the only two authorization results this slice accepts. */
function packedAuthorizationResult(status: number): 'allowed' | 'forbidden' {
  if (status >= 200 && status < 300) return 'allowed';
  if (status === 403) return 'forbidden';
  throw new Error('packed client returned an unsupported status');
}

/** Live packed-client driver bound to one owned stack and prepared local consumer. */
export class PackedTenantAdminLiveDriver implements PackedTenantAdminJourneyDriver {
  private readonly endpoints = activeEndpoints();
  private readonly apiPromise: Promise<APIRequestContext>;
  private entities: ReadonlyMap<string, string>;

  /** Creates a driver after resolving only owner-scoped fixture identities and credentials. */
  public constructor(
    private readonly consumer: PreparedPackedConsumer,
    private readonly surfaces: PackedSurfaceResult,
  ) {
    const runtime = readPublicRuntimeFixtureManifest(this.endpoints.fixtureManifestPath);
    if (runtime.runId !== this.endpoints.runId) throw new Error('packed fixture run is not active');
    this.entities = new Map(runtime.entities.map((entry) => [entry.alias, entry.id]));
    this.apiPromise = request.newContext({ ignoreHTTPSErrors: true });
  }

  /** Executes one requirement through the selected locally packed public client. */
  public execute(
    requirement: PackedTenantAdminJourneyRequirement,
  ): Promise<PackedTenantAdminClientObservation> {
    return requirement.client === 'sdk'
      ? this.executeSdk(requirement)
      : this.executeCli(requirement);
  }

  /** Independently observes the alpha target through raw HTTP using the full actor. */
  public async observeTarget(): Promise<PackedTenantAdminTargetObservation> {
    const api = await this.apiPromise;
    const response = await api.get(
      `${this.endpoints.porta}/api/admin/organizations/${this.entity('alpha')}/users/${this.entity('alpha-user-active')}`,
      { headers: { Authorization: `Bearer ${this.tokenFor('full')}` } },
    );
    if (response.status() !== 200) throw new Error('packed target observation failed');
    const data = responseEnvelopeSchema.parse(await response.json()).data;
    return { targetId: 'alpha-user-active', digest: observationDigest(data) };
  }

  /** Restores fixtures through the lifecycle owner after every attempted update. */
  public async reset(): Promise<void> {
    const exitCode = await new Promise<number>((resolveExit, rejectExit) => {
      const child = spawn(
        process.execPath,
        ['--import', 'tsx', 'test-harness/scripts/lifecycle.ts', 'reset'],
        { cwd: process.cwd(), env: process.env, shell: false, stdio: 'ignore' },
      );
      child.once('error', rejectExit);
      child.once('exit', (code) => resolveExit(code ?? 30));
    });
    if (exitCode !== 0) throw new Error('packed tenant/admin reset failed');
    const runtime = readPublicRuntimeFixtureManifest(this.endpoints.fixtureManifestPath);
    this.entities = new Map(runtime.entities.map((entry) => [entry.alias, entry.id]));
  }

  /** Releases the independent HTTP observer after all journeys finish. */
  public async dispose(): Promise<void> {
    const api = await this.apiPromise;
    await api.dispose();
  }

  /** Resolves one generated fixture identifier without placing it in diagnostics. */
  private entity(alias: string): string {
    const value = this.entities.get(alias);
    if (value === undefined) throw new Error('packed fixture identity is absent');
    return value;
  }

  /** Reads the current reset generation's opaque actor token without caching it across resets. */
  private tokenFor(actor: 'full' | 'unprivileged'): string {
    return readProtectedRuntimeCredential(
      this.endpoints.credentialManifestPath,
      actor === 'full'
        ? 'credential:super-admin:token:full'
        : 'credential:super-admin:token:unprivileged',
    );
  }

  /** Executes one SDK operation through the installed archive and validates bounded output. */
  private async executeSdk(
    requirement: PackedTenantAdminJourneyRequirement,
  ): Promise<PackedTenantAdminClientObservation> {
    const inputPath = resolve(this.consumer.consumerPath, `.tenant-admin-${randomUUID()}.json`);
    const probePath = resolve(this.consumer.consumerPath, `.tenant-admin-${randomUUID()}.mjs`);
    const token = this.tokenFor(requirement.actor);
    copyFileSync(
      resolve(process.cwd(), 'test-harness/consumers/tenant-admin-sdk-probe.mjs'),
      probePath,
    );
    writeFileSync(
      inputPath,
      JSON.stringify({
        server: this.endpoints.porta,
        token,
        operation: requirement.operation,
        organizationId: this.entity('alpha'),
        userId: this.entity('alpha-user-active'),
        givenName: 'Packed SDK',
      }),
      { flag: 'wx', mode: 0o600 },
    );
    try {
      const result = await runManagedChild(process.execPath, [probePath, inputPath], {
        cwd: this.consumer.consumerPath,
        env: process.env,
        stdio: 'pipe',
        maxOutputBytes: 64 * 1024,
        timeoutMilliseconds: 30_000,
        terminationGraceMilliseconds: 2_000,
        cleanup: () => undefined,
      });
      if (result.code !== 0 || result.signal !== null || result.outputTruncated) {
        throw new Error('packed SDK journey failed');
      }
      const outcome = sdkOutcomeSchema.parse(JSON.parse(result.stdout));
      return this.clientObservation(
        requirement,
        outcome.status,
        outcome.targetIds,
        `${result.stdout}${result.stderr}`,
      );
    } finally {
      rmSync(inputPath, { force: true });
      rmSync(probePath, { force: true });
    }
  }

  /** Executes one CLI operation under an isolated credential home. */
  private async executeCli(
    requirement: PackedTenantAdminJourneyRequirement,
  ): Promise<PackedTenantAdminClientObservation> {
    const callerPath = resolve(homedir(), '.porta/credentials.json');
    const before = credentialFingerprint(callerPath);
    const home = resolve(this.consumer.consumerPath, '..', 'homes', randomUUID());
    const credentialDirectory = resolve(home, '.porta');
    mkdirSync(home, { recursive: true, mode: 0o700 });
    chmodSync(home, 0o700);
    mkdirSync(credentialDirectory, { mode: 0o700 });
    const temporaryHomeMode = statSync(home).mode & 0o777;
    const token = this.tokenFor(requirement.actor);
    writeFileSync(
      resolve(credentialDirectory, 'credentials.json'),
      JSON.stringify({
        server: this.endpoints.porta,
        orgSlug: 'porta-admin',
        clientId: 'porta-admin-assurance',
        accessToken: token,
        idToken: 'synthetic-assurance-placeholder',
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        userInfo: { sub: 'synthetic-assurance-actor', email: 'actor@test-harness.local' },
      }),
      { flag: 'wx', mode: 0o600 },
    );
    let result: Awaited<ReturnType<typeof runManagedChild>>;
    try {
      result = await runManagedChild(
        process.execPath,
        [this.surfaces.cliBinPath, ...this.cliArgs(requirement)],
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
    const after = credentialFingerprint(callerPath);
    if (
      result.signal !== null ||
      result.outputTruncated ||
      result.setupFailed ||
      result.cleanupFailed
    ) {
      throw new Error('packed CLI journey failed');
    }
    const output = `${result.stdout}${result.stderr}`;
    const expectedAllowed = requirement.expectedResult === 'allowed';
    if (
      (expectedAllowed && result.code !== 0) ||
      (!expectedAllowed && (result.code !== 2 || !result.stderr.includes('Access denied:')))
    ) {
      throw new Error('packed CLI outcome is not the required public result');
    }
    if (expectedAllowed && !result.stdout.includes(this.entity('alpha-user-active'))) {
      throw new Error('packed CLI output omitted the selected target');
    }
    const observation = this.clientObservation(
      requirement,
      expectedAllowed ? 200 : 403,
      [],
      output,
    );
    return {
      ...observation,
      cli: {
        exitCode: result.code ?? 1,
        temporaryHomeMode,
        temporaryHomeRemoved: !existsSync(home),
        callerCredentialUnchanged: before === after,
      },
    };
  }

  /** Returns exact CLI arguments without passing any credential on the command line. */
  private cliArgs(requirement: PackedTenantAdminJourneyRequirement): string[] {
    const common = [
      '--org',
      this.entity('alpha'),
      '--server',
      this.endpoints.porta,
      '--insecure',
      '--json',
    ];
    if (requirement.operation === 'list') return ['user', 'list', '--page-size', '100', ...common];
    if (requirement.operation === 'read') {
      return ['user', 'show', this.entity('alpha-user-active'), ...common];
    }
    return ['user', 'update', this.entity('alpha-user-active'), '--name', 'Packed CLI', ...common];
  }

  /** Converts process observations into the stable client-only half of the evidence. */
  private clientObservation(
    requirement: PackedTenantAdminJourneyRequirement,
    status: number,
    targetIds: readonly string[],
    output: string,
  ): PackedTenantAdminClientObservation {
    const bravo = this.entity('bravo-user-active');
    const observedResult = packedAuthorizationResult(status);
    const fullToken = this.tokenFor('full');
    const unprivilegedToken = this.tokenFor('unprivileged');
    if (
      observedResult === 'allowed' &&
      requirement.client === 'sdk' &&
      !targetIds.includes(this.entity('alpha-user-active'))
    ) {
      throw new Error('packed SDK output omitted the selected target');
    }
    return {
      id: requirement.id,
      client: requirement.client,
      operation: requirement.operation,
      actor: requirement.actor,
      observedResult,
      clientTargetId: 'alpha-user-active',
      foreignTenantIdsObserved:
        targetIds.includes(bravo) || output.includes(bravo) ? ['bravo-user-active'] : [],
      outputRedacted: !output.includes(fullToken) && !output.includes(unprivilegedToken),
    };
  }
}

/** Creates one live driver only after validating the compiled CLI path under the consumer. */
export function createPackedTenantAdminLiveDriver(
  consumer: PreparedPackedConsumer,
  surfaces: PackedSurfaceResult,
): PackedTenantAdminLiveDriver {
  requireCanonicalChild(consumer.consumerPath, surfaces.cliBinPath);
  return new PackedTenantAdminLiveDriver(consumer, surfaces);
}
