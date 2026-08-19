import { createHash, randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

import {
  expectedFixtureCounts,
  expectedFixtureDigest,
  readPublicRuntimeFixtureManifest,
} from './fixture-runtime-files.js';
import type {
  EndpointManifest,
  LeaseRecord,
  ResetDatabaseObservation,
  ResetDependencies,
  ResetExpectations,
} from './lifecycle-planned.js';
import { RuntimeCommandRunner } from './lifecycle-runtime-command.js';
import { FileResetStateAdapter } from './lifecycle-system.js';

/** Narrow stable-client capability needed by the reset runtime. */
export interface ResettableHarnessClients {
  /** Replaces both service children while preserving registered bootstrap identities. */
  restart(manifest: EndpointManifest, signal?: AbortSignal): Promise<void>;
}

/** Returns the sorted migration identities independently owned by the harness oracle. */
function migrationNames(worktreePath: string): readonly string[] {
  return readdirSync(resolve(worktreePath, 'packages/server/migrations'))
    .filter((name) => /^[0-9]{3}_[a-z0-9_]+\.sql$/u.test(name))
    .sort()
    .map((name) => basename(name, '.sql'));
}

/** Computes the stable applied-migration identity from an ordered name set. */
function migrationDigest(names: readonly string[]): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(names)).digest('hex')}`;
}

/** Builds independent migration and fixture expectations for one repository revision. */
function resetExpectations(worktreePath: string): ResetExpectations {
  const names = migrationNames(worktreePath);
  const revision = names.at(-1);
  if (revision === undefined) throw new Error('no ordered server migrations were found');
  return Object.freeze({
    migrationRevision: revision,
    migrationDigest: migrationDigest(names),
    fixtureDigest: expectedFixtureDigest,
    fixtureCounts: expectedFixtureCounts,
  });
}

/** Copies defined process variables for a shell-free child process. */
function processEnvironment(): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined) environment[name] = value;
  }
  return environment;
}

/** Builds the exact host-side Porta environment for migration, bootstrap, and fixture seeding. */
export function hostPortaEnvironment(manifest: EndpointManifest): Readonly<Record<string, string>> {
  return {
    ...processEnvironment(),
    NODE_ENV: manifest.environmentName === 'production-security' ? 'production' : 'development',
    LOG_LEVEL: manifest.environmentName === 'production-security' ? 'info' : 'debug',
    PORT: '3000',
    DATABASE_URL: `postgres://porta:harness_pr0d_s3cret@127.0.0.1:${manifest.ports.postgres}/porta`,
    REDIS_URL: `redis://127.0.0.1:${manifest.ports.redis}`,
    ISSUER_BASE_URL: manifest.urls.porta,
    TRUST_PROXY: 'true',
    COOKIE_KEYS: 'Xk9mQ2vR7pW4tY6bN8cF3jH5sA0dL1eZq,Rm4nT8wK2xJ6yP0qB3vG5fC7hD9sA1eUp',
    SMTP_HOST: 'smtp-capture.test-harness.local',
    SMTP_PORT: '1025',
    SMTP_FROM: 'noreply@test-harness.local',
    SIGNING_KEY_ENCRYPTION_KEY: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2',
    TWO_FACTOR_ENCRYPTION_KEY: 'f1e2d3c4b5a6f7e8d9c0b1a2f3e4d5c6b7a8f9e0d1c2b3a4f5e6d7c8b9a0f1e2',
    HARNESS_RUN_ID: manifest.runId,
    HARNESS_PROFILE: manifest.environmentName,
    HARNESS_WORKTREE: manifest.worktreePath,
    HARNESS_PORTA_PORT: String(manifest.ports.porta),
    HARNESS_APP_PORT: String(manifest.ports.app),
    HARNESS_BFF_PORT: String(manifest.ports.bff),
    HARNESS_POSTGRES_PORT: String(manifest.ports.postgres),
    HARNESS_REDIS_PORT: String(manifest.ports.redis),
    HARNESS_MAILHOG_PORT: String(manifest.ports.mailhog),
    HARNESS_PORTA_URL: manifest.urls.porta,
    HARNESS_APP_URL: manifest.urls.app,
    HARNESS_ATTACKER_URL: manifest.urls.attacker,
    HARNESS_BFF_URL: manifest.urls.bff,
    HARNESS_MAILHOG_URL: manifest.urls.mailhog,
    HARNESS_CERT_DIR: dirname(manifest.certificatePath),
    PORTA_ENDPOINT_MANIFEST: resolve(
      manifest.worktreePath,
      'test-harness/.assurance-runtime',
      manifest.runId,
      'endpoint-manifest.json',
    ),
    HARNESS_FIXTURE_MANIFEST: resolve(
      manifest.worktreePath,
      'test-harness/.assurance-runtime',
      manifest.runId,
      'fixture-public.json',
    ),
    HARNESS_FIXTURE_CREDENTIALS: resolve(
      manifest.worktreePath,
      'test-harness/.assurance-runtime',
      manifest.runId,
      'fixture-credentials.json',
    ),
  };
}

/** Runs Porta bootstrap from an owner-only input file so credentials never enter argv. */
export async function runOwnerOnlyBootstrap(
  runner: RuntimeCommandRunner,
  manifest: EndpointManifest,
  signal?: AbortSignal,
): Promise<void> {
  const bootstrapInput = resolve(
    manifest.worktreePath,
    'test-harness/.assurance-runtime',
    manifest.runId,
    'bootstrap-input.json',
  );
  rmSync(bootstrapInput, { force: true });
  writeFileSync(
    bootstrapInput,
    `${JSON.stringify({ password: `P-${randomBytes(24).toString('base64url')}!aA7` })}\n`,
    { encoding: 'utf8', mode: 0o600, flag: 'wx' },
  );
  try {
    await runner.checked(
      process.execPath,
      ['--import', 'tsx', 'test-harness/scripts/bootstrap.ts'],
      {
        cwd: manifest.worktreePath,
        environment: {
          ...hostPortaEnvironment(manifest),
          HARNESS_BOOTSTRAP_INPUT: bootstrapInput,
        },
        signal,
      },
    );
  } finally {
    rmSync(bootstrapInput, { force: true });
  }
}

/** Resolves one exact Compose service container and verifies it belongs to the persisted lease. */
async function serviceContainerId(
  runner: RuntimeCommandRunner,
  record: LeaseRecord,
  service: 'nginx' | 'porta' | 'postgres' | 'redis',
  signal?: AbortSignal,
): Promise<string> {
  const result = await runner.checked(
    'docker',
    [
      'ps',
      '-aq',
      '--no-trunc',
      '--filter',
      `label=com.docker.compose.project=${record.composeProject}`,
      '--filter',
      `label=com.docker.compose.service=${service}`,
    ],
    { cwd: record.worktreePath, environment: processEnvironment(), signal },
  );
  const identifiers = result.stdout.trim().split(/\s+/u).filter(Boolean);
  const identifier = identifiers[0];
  if (
    identifiers.length !== 1 ||
    identifier === undefined ||
    !record.containerIds.includes(identifier)
  ) {
    throw new Error(`owned ${service} container identity is unavailable`);
  }
  return identifier;
}

/** Executes one fixed scalar SQL observation against the owned PostgreSQL container. */
async function scalarQuery(
  runner: RuntimeCommandRunner,
  record: LeaseRecord,
  sql: string,
  signal?: AbortSignal,
): Promise<string> {
  const postgres = await serviceContainerId(runner, record, 'postgres', signal);
  const result = await runner.checked(
    'docker',
    ['exec', postgres, 'psql', '-U', 'porta', '-d', 'porta', '-At', '-c', sql],
    { cwd: record.worktreePath, environment: processEnvironment(), signal },
  );
  return result.stdout.trim();
}

/** Parses one non-negative database count without accepting diagnostic text. */
function parseCount(value: string): number {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) throw new Error('database count is not numeric');
  const count = Number(value);
  if (!Number.isSafeInteger(count)) throw new Error('database count exceeds the safe range');
  return count;
}

/** Appends one non-secret reset-stage transition to the owner-only runtime directory. */
function recordResetStage(
  record: LeaseRecord,
  stage: string,
  state: 'started' | 'completed',
): void {
  const path = resolve(
    record.worktreePath,
    'test-harness/.assurance-runtime',
    record.runId,
    'reset-runtime.log',
  );
  appendFileSync(path, `${stage}:${state}\n`, { encoding: 'utf8', mode: 0o600 });
}

/** Waits for Porta through the private container boundary while public ingress remains stopped. */
async function waitForPrivatePorta(
  runner: RuntimeCommandRunner,
  record: LeaseRecord,
  porta: string,
  signal?: AbortSignal,
): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (signal?.aborted === true) throw new Error('private Porta readiness was aborted');
    const result = await runner.run(
      'docker',
      ['exec', porta, 'wget', '-qO-', '--timeout=2', 'http://127.0.0.1:3000/health'],
      {
        cwd: record.worktreePath,
        environment: processEnvironment(),
        timeoutMilliseconds: 5_000,
        signal,
      },
    );
    if (result.exitCode === 0) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
  }
  throw new Error('private Porta health did not become ready');
}

/** Creates the real reset capability bundle for one lifecycle supervisor. */
export function createRuntimeResetDependencies(
  worktreePath: string,
  runner: RuntimeCommandRunner,
  clients: ResettableHarnessClients,
): ResetDependencies {
  const expectations = resetExpectations(worktreePath);
  const blockedRuns = new Set<string>();
  let earlyRedisKeysRemoved = 0;
  const admissionPath = (record: LeaseRecord): string =>
    resolve(
      record.worktreePath,
      'test-harness/.assurance-runtime',
      record.runId,
      'traffic-blocked.json',
    );

  return {
    expectations,
    traffic: {
      async quiesce(record, signal) {
        if (signal?.aborted === true) throw new Error('reset traffic quiesce was aborted');
        const path = admissionPath(record);
        mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
        const alreadyBlocked = blockedRuns.has(record.runId);
        if (alreadyBlocked !== existsSync(path)) {
          throw new Error('reset traffic admission state is inconsistent');
        }
        if (!alreadyBlocked) {
          writeFileSync(path, `${JSON.stringify({ runId: record.runId })}\n`, {
            encoding: 'utf8',
            mode: 0o600,
            flag: 'wx',
          });
          blockedRuns.add(record.runId);
        }
        const nginx = await serviceContainerId(runner, record, 'nginx', signal);
        if (!alreadyBlocked) {
          await runner.checked('docker', ['pause', nginx], {
            cwd: record.worktreePath,
            environment: processEnvironment(),
            signal,
          });
        }
        const refused = await runner.run(
          'curl',
          ['-ksf', '--max-time', '2', `${record.manifest.urls.porta}/health`],
          {
            cwd: record.worktreePath,
            environment: processEnvironment(),
            timeoutMilliseconds: 5_000,
            signal,
          },
        );
        if (refused.exitCode === 0) throw new Error('public admission remained open during reset');
      },
      async verifyBlocked(record, signal) {
        if (signal?.aborted === true || !blockedRuns.has(record.runId)) {
          throw new Error('reset traffic admission fence is not active');
        }
      },
      async resume(record, signal) {
        if (signal?.aborted === true || !blockedRuns.has(record.runId)) {
          throw new Error('reset traffic admission fence changed');
        }
        const nginx = await serviceContainerId(runner, record, 'nginx', signal);
        await runner.checked('docker', ['unpause', nginx], {
          cwd: record.worktreePath,
          environment: processEnvironment(),
          signal,
        });
        await runner.checked(
          'curl',
          [
            '-ksf',
            '--retry',
            '30',
            '--retry-all-errors',
            '--retry-delay',
            '1',
            '--max-time',
            '2',
            `${record.manifest.urls.porta}/health`,
          ],
          {
            cwd: record.worktreePath,
            environment: processEnvironment(),
            timeoutMilliseconds: 60_000,
            signal,
          },
        );
        blockedRuns.delete(record.runId);
        rmSync(admissionPath(record), { force: true });
      },
      async restore(record, signal) {
        if (signal?.aborted === true) throw new Error('reset traffic restore was aborted');
        if (!blockedRuns.has(record.runId) && !existsSync(admissionPath(record))) return;
        const nginx = await serviceContainerId(runner, record, 'nginx', signal);
        await runner.run('docker', ['unpause', nginx], {
          cwd: record.worktreePath,
          environment: processEnvironment(),
          signal,
        });
        const state = await runner.checked(
          'docker',
          ['inspect', '--format', '{{.State.Paused}}', nginx],
          { cwd: record.worktreePath, environment: processEnvironment(), signal },
        );
        if (state.stdout.trim() !== 'false')
          throw new Error('nginx admission fence remained paused');
        blockedRuns.delete(record.runId);
        rmSync(admissionPath(record), { force: true });
      },
    },
    runtime: {
      async stopPorta(record, signal) {
        const porta = await serviceContainerId(runner, record, 'porta', signal);
        await runner.checked('docker', ['stop', '--time', '10', porta], {
          cwd: record.worktreePath,
          environment: processEnvironment(),
          signal,
        });
      },
      async restartClients(record, signal) {
        await clients.restart(record.manifest, signal);
      },
      async restartPorta(record, signal) {
        const porta = await serviceContainerId(runner, record, 'porta', signal);
        await runner.checked('docker', ['start', porta], {
          cwd: record.worktreePath,
          environment: processEnvironment(),
          signal,
        });
        await waitForPrivatePorta(runner, record, porta, signal);
      },
    },
    state: new FileResetStateAdapter(),
    database: {
      async recreate(record, signal) {
        const postgres = await serviceContainerId(runner, record, 'postgres', signal);
        for (const sql of [
          'DROP DATABASE IF EXISTS porta WITH (FORCE)',
          'CREATE DATABASE porta OWNER porta',
        ]) {
          await runner.checked(
            'docker',
            [
              'exec',
              postgres,
              'psql',
              '-U',
              'porta',
              '-d',
              'postgres',
              '-v',
              'ON_ERROR_STOP=1',
              '-c',
              sql,
            ],
            { cwd: record.worktreePath, environment: processEnvironment(), signal },
          );
        }
        return ['database:porta'];
      },
      async migrate(record, revision, signal) {
        if (revision !== expectations.migrationRevision) {
          throw new Error('requested migration revision differs from the independent expectation');
        }
        recordResetStage(record, 'migration', 'started');
        await runner.checked(
          process.execPath,
          ['--import', 'tsx', 'packages/server/src/cli/index.ts', 'migrate', 'up'],
          { cwd: record.worktreePath, environment: hostPortaEnvironment(record.manifest), signal },
        );
        recordResetStage(record, 'migration', 'completed');
      },
      async bootstrap(record, signal) {
        // Bootstrap creates signing keys and consults Redis. Clear the dedicated cache after the
        // database replacement so stale key state cannot refer to rows that no longer exist. The
        // normal later Redis step repeats the flush and reports the aggregate removed-key count.
        const redis = await serviceContainerId(runner, record, 'redis', signal);
        const before = await runner.checked('docker', ['exec', redis, 'redis-cli', 'DBSIZE'], {
          cwd: record.worktreePath,
          environment: processEnvironment(),
          signal,
        });
        await runner.checked('docker', ['exec', redis, 'redis-cli', 'FLUSHDB'], {
          cwd: record.worktreePath,
          environment: processEnvironment(),
          signal,
        });
        earlyRedisKeysRemoved += parseCount(before.stdout.trim());
        recordResetStage(record, 'bootstrap', 'started');
        await runOwnerOnlyBootstrap(runner, record.manifest, signal);
        recordResetStage(record, 'bootstrap', 'completed');
      },
      async seed(record, suppliedExpectations, signal) {
        if (JSON.stringify(suppliedExpectations) !== JSON.stringify(expectations)) {
          throw new Error('reset expectations changed before deterministic seeding');
        }
        recordResetStage(record, 'seed', 'started');
        await runner.checked(
          process.execPath,
          ['--import', 'tsx', 'test-harness/scripts/seed.ts'],
          {
            cwd: record.worktreePath,
            environment: hostPortaEnvironment(record.manifest),
            timeoutMilliseconds: 120_000,
            signal,
          },
        );
        recordResetStage(record, 'seed', 'completed');
      },
      async observe(record, signal): Promise<ResetDatabaseObservation> {
        const appliedNames = (
          await scalarQuery(runner, record, 'SELECT name FROM pgmigrations ORDER BY id', signal)
        )
          .split(/\r?\n/u)
          .filter(Boolean);
        const publicFixture = readPublicRuntimeFixtureManifest(
          resolve(
            record.worktreePath,
            'test-harness/.assurance-runtime',
            record.runId,
            'fixture-public.json',
          ),
        );
        const fixtureCounts = {
          organizations: parseCount(
            await scalarQuery(runner, record, 'SELECT count(*) FROM organizations', signal),
          ),
          ordinaryUsers: parseCount(
            await scalarQuery(
              runner,
              record,
              "SELECT count(*) FROM users WHERE email::text ~ '^(alpha|bravo)-user-.*@test-harness[.]local$'",
              signal,
            ),
          ),
          administrativeActors: parseCount(
            await scalarQuery(
              runner,
              record,
              "SELECT count(*) FROM users WHERE email::text ~ '^admin-actor-.*@test-harness[.]local$'",
              signal,
            ),
          ),
          validClients: parseCount(
            await scalarQuery(
              runner,
              record,
              "SELECT count(*) FROM clients WHERE client_name LIKE 'Assurance %'",
              signal,
            ),
          ),
          sessions: parseCount(
            await scalarQuery(
              runner,
              record,
              "SELECT count(*) FROM admin_sessions WHERE grant_id IN ('alpha-grant', 'bravo-grant')",
              signal,
            ),
          ),
          tokens: parseCount(
            await scalarQuery(
              runner,
              record,
              "SELECT count(*) FROM oidc_payloads WHERE type = 'AccessToken' AND grant_id IN ('alpha-grant', 'bravo-grant')",
              signal,
            ),
          ),
          globalApplications: parseCount(
            await scalarQuery(
              runner,
              record,
              "SELECT count(*) FROM applications WHERE slug IN ('assurance-oidc', 'porta-admin')",
              signal,
            ),
          ),
          globalRoles: parseCount(
            await scalarQuery(
              runner,
              record,
              "SELECT count(*) FROM roles WHERE slug IN ('alpha-resource-reader', 'bravo-resource-reader', 'porta-super-admin', 'porta-auditor', 'porta-assurance-unprivileged')",
              signal,
            ),
          ),
        };
        return {
          migrationRevision: appliedNames.at(-1) ?? '',
          migrationDigest: migrationDigest(appliedNames),
          fixtureDigest: publicFixture.fixtureDigest,
          fixtureCounts,
        };
      },
    },
    redis: {
      async flush(record, signal) {
        const redis = await serviceContainerId(runner, record, 'redis', signal);
        const before = await runner.checked('docker', ['exec', redis, 'redis-cli', 'DBSIZE'], {
          cwd: record.worktreePath,
          environment: processEnvironment(),
          signal,
        });
        await runner.checked('docker', ['exec', redis, 'redis-cli', 'FLUSHDB'], {
          cwd: record.worktreePath,
          environment: processEnvironment(),
          signal,
        });
        const removed = earlyRedisKeysRemoved + parseCount(before.stdout.trim());
        earlyRedisKeysRemoved = 0;
        return removed;
      },
    },
    mail: {
      async clear(record, signal) {
        const messages = await fetch(`${record.manifest.urls.mailhog}/api/v2/messages`, { signal });
        if (!messages.ok) throw new Error('MailHog inventory failed before reset');
        const payload: unknown = await messages.json();
        const count =
          typeof payload === 'object' &&
          payload !== null &&
          'items' in payload &&
          Array.isArray(payload.items)
            ? payload.items.length
            : undefined;
        if (count === undefined) throw new Error('MailHog inventory shape is invalid');
        const cleared = await fetch(`${record.manifest.urls.mailhog}/api/v1/messages`, {
          method: 'DELETE',
          signal,
        });
        if (!cleared.ok) throw new Error('MailHog reset failed');
        return count;
      },
    },
    publicVerification: {
      async verify(record, signal) {
        const porta = await serviceContainerId(runner, record, 'porta', signal);
        await runner.checked(
          'docker',
          ['exec', porta, 'wget', '-qO-', '--timeout=2', 'http://127.0.0.1:3000/health'],
          { cwd: record.worktreePath, environment: processEnvironment(), signal },
        );
      },
    },
  };
}
