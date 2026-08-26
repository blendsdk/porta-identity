import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { z } from 'zod';

import { readActiveCoverageRun } from '../coverage/index.js';
import { verifyExactPatchedTarget } from '../fault/runner.js';
import { runManagedChild, type ManagedChildOutcome } from '../scripts/managed-child.js';
import { digestRepositoryFile, inspectFoundationProvenance } from '../scripts/source-provenance.js';
import { readPublicRuntimeFixtureManifest } from '../../fixtures/fixture-runtime-files.js';
import type {
  ControlSensitivityProvenance,
  ControlSensitivityRuntime,
  ControlSensitivityStageObservation,
  TenantAdminControlCheckDefinition,
} from './model.js';
import { applyControlVariant } from './variant.js';

const commandTimeoutMilliseconds = 900_000;
const checkOutputLimitBytes = 16 * 1024;

/** Minimal injectable command boundary used to prove Docker query failures fail closed. */
export type DockerContainerQuery = (
  command: string,
  arguments_: string[],
  options: {
    readonly cwd: string;
    readonly encoding: 'utf8';
    readonly timeout: number;
    readonly stdio: ['ignore', 'pipe', 'ignore'];
  },
) => string;

const runRecordSchema = z
  .object({
    version: z.literal(1),
    runId: z.uuid(),
    worktreeRoot: z.string().min(1),
    stage: z.enum(['validation', 'variant', 'build', 'startup', 'fixture', 'check', 'cleanup']),
    provenance: z.object({
      commitIdentity: z.string().regex(/^commit:[0-9a-f]{40}$/u),
      treeIdentity: z.string().regex(/^tree:[0-9a-f]{40}$/u),
      assuranceToolDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
      dependencyLockDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
      targetPath: z.string().min(1),
      originalSha256: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
      variantSha256: z
        .string()
        .regex(/^sha256:[0-9a-f]{64}$/u)
        .optional(),
      lifecycleRunId: z.uuid().optional(),
      fixtureIdentity: z
        .string()
        .regex(/^sha256:[0-9a-f]{64}$/u)
        .optional(),
      serverImageDigest: z
        .string()
        .regex(/^sha256:[0-9a-f]{64}$/u)
        .optional(),
      containerIds: z.array(z.string().regex(/^[0-9a-f]{64}$/u)).optional(),
    }),
  })
  .strict();

type ControlCheckRunRecord = z.infer<typeof runRecordSchema>;

/** Maps a managed child onto one sanitized stage observation. */
function childObservation(child: ManagedChildOutcome): ControlSensitivityStageObservation {
  if (child.forwardedSignal !== null) {
    return Object.freeze({ status: 'failed', forwardedSignal: child.forwardedSignal });
  }
  if (child.timedOut) return Object.freeze({ status: 'timed-out' });
  if (
    child.code === 0 &&
    !child.setupFailed &&
    !child.cleanupFailed &&
    !child.outputTruncated &&
    child.forwardedSignal === null
  ) {
    return Object.freeze({ status: 'passed' });
  }
  return Object.freeze({ status: 'failed' });
}

/**
 * Classifies the designated live-check child without losing an operator signal.
 *
 * A signal takes precedence over timeout and output grammar because it explains why the child did
 * not produce a normal result.
 */
export function controlCheckChildObservation(
  child: ManagedChildOutcome,
  expectedSignature: string,
): ControlSensitivityStageObservation {
  if (child.forwardedSignal !== null) {
    return Object.freeze({ status: 'failed', forwardedSignal: child.forwardedSignal });
  }
  if (child.timedOut) return Object.freeze({ status: 'timed-out' });
  if (
    child.code === 1 &&
    child.stdout === '' &&
    child.stderr === `${expectedSignature}\n` &&
    !child.cleanupFailed &&
    !child.outputTruncated
  ) {
    return Object.freeze({ status: 'failed', signature: expectedSignature });
  }
  if (
    child.code === 0 &&
    child.stdout === '' &&
    child.stderr === '' &&
    !child.cleanupFailed &&
    !child.outputTruncated
  ) {
    return Object.freeze({ status: 'passed' });
  }
  return Object.freeze({ status: 'failed' });
}

/**
 * Proves that one exact container ID is absent through a successful Docker query.
 *
 * Query failures are ambiguous and therefore return false instead of being mistaken for absence.
 */
export function dockerContainerIsAbsent(
  repositoryRoot: string,
  containerId: string,
  query: DockerContainerQuery = (command, arguments_, options) =>
    execFileSync(command, arguments_, options),
): boolean {
  try {
    const output = query(
      'docker',
      ['container', 'ls', '--all', '--quiet', '--no-trunc', '--filter', `id=${containerId}`],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        timeout: 10_000,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
    return output.trim() === '';
  } catch {
    return false;
  }
}

/**
 * Local runtime for one defensive tenant/admin control check.
 *
 * It owns one detached Git worktree and delegates all service ownership to the existing lifecycle
 * supervisor. No source variant, selector, or runtime path is accepted from caller-controlled
 * catalog data.
 */
export class LocalControlSensitivityRuntime implements ControlSensitivityRuntime {
  /** Stable run identifier used only for repository-owned runtime paths. */
  public readonly runId = randomUUID();

  /** Canonical clean primary worktree. */
  protected readonly repositoryRoot: string;

  /** Exact runtime directory for this check. */
  protected readonly runtimeRoot: string;

  /** Detached worktree containing the isolated source variant. */
  protected readonly worktreeRoot: string;

  protected worktreeCreated = false;
  protected stackStarted = false;
  protected observedProvenance?: ControlSensitivityProvenance;

  /** Creates an unstarted runtime bound to one canonical repository root. */
  public constructor(repositoryRoot: string) {
    this.repositoryRoot = realpathSync(repositoryRoot);
    this.runtimeRoot = resolve(
      this.repositoryRoot,
      'test-harness/.assurance-runtime/control-check',
      this.runId,
    );
    this.worktreeRoot = resolve(this.runtimeRoot, 'worktree');
  }

  /** Proves clean source provenance and the registered target's exact reviewed identity. */
  public async validate(
    definition: TenantAdminControlCheckDefinition,
  ): Promise<ControlSensitivityStageObservation> {
    try {
      const source = inspectFoundationProvenance(this.repositoryRoot);
      const target = resolve(this.repositoryRoot, definition.targetPath);
      if (digestRepositoryFile(target) !== definition.originalSha256) {
        return Object.freeze({ status: 'failed' });
      }
      this.observedProvenance = Object.freeze({
        ...source,
        dependencyLockDigest: digestRepositoryFile(resolve(this.repositoryRoot, 'yarn.lock')),
        targetPath: definition.targetPath,
        originalSha256: definition.originalSha256,
      });
      this.persist('validation');
      return Object.freeze({ status: 'passed' });
    } catch {
      return Object.freeze({ status: 'failed' });
    }
  }

  /** Creates the detached worktree, links frozen dependencies, and applies one exact variant. */
  public async prepareVariant(
    definition: TenantAdminControlCheckDefinition,
  ): Promise<ControlSensitivityStageObservation> {
    try {
      mkdirSync(this.runtimeRoot, { recursive: true, mode: 0o700 });
      execFileSync('git', ['worktree', 'add', '--detach', this.worktreeRoot, 'HEAD^{commit}'], {
        cwd: this.repositoryRoot,
        encoding: 'utf8',
        timeout: 30_000,
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      this.worktreeCreated = true;
      const variant = applyControlVariant(this.worktreeRoot, definition);
      this.observedProvenance = Object.freeze({
        ...this.requireProvenance(),
        variantSha256: variant.variantSha256,
      });
      this.persist('variant');
      verifyExactPatchedTarget(this.worktreeRoot, definition.targetPath);
      symlinkSync(
        resolve(this.repositoryRoot, 'node_modules'),
        resolve(this.worktreeRoot, 'node_modules'),
        'dir',
      );
      return Object.freeze({ status: 'passed' });
    } catch {
      return Object.freeze({ status: 'failed' });
    }
  }

  /** Builds the server package from the exact isolated source variant. */
  public async build(): Promise<ControlSensitivityStageObservation> {
    if (!this.worktreeCreated) return Object.freeze({ status: 'failed' });
    const child = await runManagedChild('yarn', ['workspace', '@portaidentity/server', 'build'], {
      cwd: this.worktreeRoot,
      env: process.env,
      stdio: 'pipe',
      maxOutputBytes: checkOutputLimitBytes,
      timeoutMilliseconds: commandTimeoutMilliseconds,
      terminationGraceMilliseconds: 10_000,
      cleanup: () => undefined,
    });
    const observation = childObservation(child);
    if (observation.status === 'passed') this.persist('build');
    return observation;
  }

  /** Starts one operational stack through the retained lifecycle owner. */
  public async start(): Promise<ControlSensitivityStageObservation> {
    const child = await this.lifecycle('start', ['--ci', '--profile', 'operational'], 900_000);
    const observation = childObservation(child);
    this.stackStarted = observation.status === 'passed';
    if (this.stackStarted) {
      this.captureOwnedStack();
      this.persist('startup');
    }
    return observation;
  }

  /** Treats successful lifecycle startup as the migrated, seeded, and healthy fixture proof. */
  public async verifyFixture(): Promise<ControlSensitivityStageObservation> {
    if (!this.stackStarted) return Object.freeze({ status: 'failed' });
    this.persist('fixture');
    return Object.freeze({ status: 'passed' });
  }

  /** Runs only the code-owned live check and accepts only its exact one-line output grammar. */
  public async runCheck(
    definition: TenantAdminControlCheckDefinition,
  ): Promise<ControlSensitivityStageObservation> {
    const child = await runManagedChild(
      process.execPath,
      [
        '--import',
        'tsx',
        'test-harness/assurance/control-sensitivity/live-check.ts',
        definition.id,
      ],
      {
        cwd: this.worktreeRoot,
        env: {
          ...process.env,
          PORTA_ASSURANCE_TENANT_ADMIN_ADAPTER: 'live',
        },
        stdio: 'pipe',
        maxOutputBytes: checkOutputLimitBytes,
        timeoutMilliseconds: commandTimeoutMilliseconds,
        terminationGraceMilliseconds: 10_000,
        cleanup: () => undefined,
      },
    );
    return controlCheckChildObservation(child, definition.expectedSignature);
  }

  /** Stops the owned stack, removes the exact worktree, and proves its runtime directory absent. */
  public async cleanup(): Promise<ControlSensitivityStageObservation> {
    let clean = true;
    if (this.worktreeCreated) {
      const stop = await this.lifecycle('stop', [], 180_000);
      clean = childObservation(stop).status === 'passed';
      if (clean) {
        try {
          execFileSync('git', ['worktree', 'remove', '--force', this.worktreeRoot], {
            cwd: this.repositoryRoot,
            encoding: 'utf8',
            timeout: 30_000,
            stdio: ['ignore', 'ignore', 'ignore'],
          });
        } catch {
          clean = false;
        }
      }
    }
    if (clean) rmSync(this.runtimeRoot, { recursive: true, force: true });
    return Object.freeze({
      status: clean && !existsSync(this.runtimeRoot) ? 'passed' : 'failed',
    });
  }

  /** Returns the immutable identities collected by the staged runtime. */
  public provenance(): ControlSensitivityProvenance | undefined {
    return this.observedProvenance;
  }

  /** Requires validation to establish source provenance before later stages run. */
  protected requireProvenance(): ControlSensitivityProvenance {
    if (this.observedProvenance === undefined) {
      throw new Error('control-check provenance has not been established');
    }
    return this.observedProvenance;
  }

  /** Atomically persists owner-only recovery and provenance state. */
  protected persist(stage: ControlCheckRunRecord['stage']): void {
    mkdirSync(this.runtimeRoot, { recursive: true, mode: 0o700 });
    const path = resolve(this.runtimeRoot, 'run.json');
    const temporary = `${path}.tmp-${randomUUID()}`;
    const record = runRecordSchema.parse({
      version: 1,
      runId: this.runId,
      worktreeRoot: this.worktreeRoot,
      stage,
      provenance: this.requireProvenance(),
    });
    try {
      writeFileSync(temporary, `${JSON.stringify(record, undefined, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
      });
      renameSync(temporary, path);
    } finally {
      rmSync(temporary, { force: true });
    }
  }

  /** Captures exact lifecycle, fixture, container, and Porta image identities after startup. */
  protected captureOwnedStack(): void {
    const active = readActiveCoverageRun(this.worktreeRoot);
    const fixture = readPublicRuntimeFixtureManifest(
      resolve(
        this.worktreeRoot,
        'test-harness/.assurance-runtime',
        active.runId,
        'fixture-public.json',
      ),
    );
    const images = active.lease.containerIds.flatMap((containerId) => {
      const output = execFileSync(
        'docker',
        [
          'inspect',
          '--format',
          '{{.Id}}|{{.Image}}|{{index .Config.Labels "com.docker.compose.service"}}',
          containerId,
        ],
        {
          cwd: this.worktreeRoot,
          encoding: 'utf8',
          timeout: 10_000,
          stdio: ['ignore', 'pipe', 'ignore'],
        },
      ).trim();
      const [observedId, image, service, extra] = output.split('|');
      return extra === undefined && observedId === containerId && service === 'porta'
        ? [image ?? '']
        : [];
    });
    if (images.length !== 1 || !/^sha256:[0-9a-f]{64}$/u.test(images[0] ?? '')) {
      throw new Error('owned Porta image identity is unavailable');
    }
    this.observedProvenance = Object.freeze({
      ...this.requireProvenance(),
      lifecycleRunId: active.runId,
      fixtureIdentity: fixture.fixtureDigest,
      serverImageDigest: images[0],
      containerIds: Object.freeze([...active.lease.containerIds].sort()),
    });
  }

  /** Runs one closed lifecycle action from the disposable worktree. */
  protected lifecycle(
    action: 'start' | 'stop',
    options: readonly string[],
    timeoutMilliseconds: number,
  ): Promise<ManagedChildOutcome> {
    return runManagedChild(
      process.execPath,
      ['--import', 'tsx', 'test-harness/scripts/lifecycle.ts', action, ...options],
      {
        cwd: this.worktreeRoot,
        env: process.env,
        stdio: 'pipe',
        maxOutputBytes: checkOutputLimitBytes,
        timeoutMilliseconds,
        terminationGraceMilliseconds: 10_000,
        cleanup: () => undefined,
      },
    );
  }
}

/** Recovers only the exact repository-owned control-check run selected by UUID. */
export async function recoverLocalControlSensitivityRun(
  repositoryRoot: string,
  runId: string,
): Promise<boolean> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(runId)) {
    return false;
  }
  const canonicalRoot = realpathSync(repositoryRoot);
  const runtimeRoot = resolve(
    canonicalRoot,
    'test-harness/.assurance-runtime/control-check',
    runId,
  );
  const worktreeRoot = resolve(runtimeRoot, 'worktree');
  if (!existsSync(runtimeRoot)) return true;
  let record: ControlCheckRunRecord;
  try {
    record = runRecordSchema.parse(
      JSON.parse(readFileSync(resolve(runtimeRoot, 'run.json'), 'utf8')),
    );
    if (
      record.runId !== runId ||
      resolve(record.worktreeRoot) !== worktreeRoot ||
      (existsSync(worktreeRoot) && realpathSync(record.worktreeRoot) !== realpathSync(worktreeRoot))
    ) {
      return false;
    }
  } catch {
    return false;
  }
  let clean = true;
  if (existsSync(worktreeRoot)) {
    const stop = await runManagedChild(
      process.execPath,
      ['--import', 'tsx', 'test-harness/scripts/lifecycle.ts', 'stop'],
      {
        cwd: worktreeRoot,
        env: process.env,
        stdio: 'pipe',
        maxOutputBytes: checkOutputLimitBytes,
        timeoutMilliseconds: 180_000,
        terminationGraceMilliseconds: 10_000,
        cleanup: () => undefined,
      },
    );
    clean = childObservation(stop).status === 'passed';
  }
  if (clean) {
    for (const containerId of record.provenance.containerIds ?? []) {
      if (!dockerContainerIsAbsent(canonicalRoot, containerId)) {
        clean = false;
        break;
      }
    }
  }
  if (clean && existsSync(worktreeRoot)) {
    try {
      execFileSync('git', ['worktree', 'remove', '--force', worktreeRoot], {
        cwd: canonicalRoot,
        encoding: 'utf8',
        timeout: 30_000,
        stdio: ['ignore', 'ignore', 'ignore'],
      });
    } catch {
      clean = false;
    }
  }
  if (clean) rmSync(runtimeRoot, { recursive: true, force: true });
  return clean && !existsSync(runtimeRoot);
}
