import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import { verifyExactPatchedTarget } from '../fault/runner.js';
import { runManagedChild, type ManagedChildOutcome } from '../scripts/managed-child.js';
import { digestRepositoryFile, inspectFoundationProvenance } from '../scripts/source-provenance.js';
import type {
  ControlSensitivityRuntime,
  ControlSensitivityStageObservation,
  TenantAdminControlCheckDefinition,
} from './model.js';
import { applyControlVariant } from './variant.js';

const commandTimeoutMilliseconds = 900_000;
const checkOutputLimitBytes = 16 * 1024;

/** Maps a managed child onto one sanitized stage observation. */
function childObservation(child: ManagedChildOutcome): ControlSensitivityStageObservation {
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
 * Local runtime for one defensive tenant/admin control-sensitivity experiment.
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

  /** Exact runtime directory for this experiment. */
  protected readonly runtimeRoot: string;

  /** Detached worktree containing the isolated source variant. */
  protected readonly worktreeRoot: string;

  protected worktreeCreated = false;
  protected stackStarted = false;

  /** Creates an unstarted runtime bound to one canonical repository root. */
  public constructor(repositoryRoot: string) {
    this.repositoryRoot = realpathSync(repositoryRoot);
    this.runtimeRoot = resolve(
      this.repositoryRoot,
      'test-harness/.assurance-runtime/control-sensitivity',
      this.runId,
    );
    this.worktreeRoot = resolve(this.runtimeRoot, 'worktree');
  }

  /** Proves clean source provenance and the registered target's exact reviewed identity. */
  public async validate(
    definition: TenantAdminControlCheckDefinition,
  ): Promise<ControlSensitivityStageObservation> {
    try {
      inspectFoundationProvenance(this.repositoryRoot);
      const target = resolve(this.repositoryRoot, definition.targetPath);
      if (digestRepositoryFile(target) !== definition.originalSha256) {
        return Object.freeze({ status: 'failed' });
      }
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
      symlinkSync(
        resolve(this.repositoryRoot, 'node_modules'),
        resolve(this.worktreeRoot, 'node_modules'),
        'dir',
      );
      applyControlVariant(this.worktreeRoot, definition);
      verifyExactPatchedTarget(this.worktreeRoot, definition.targetPath);
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
    return childObservation(child);
  }

  /** Starts one operational stack through the retained lifecycle owner. */
  public async start(): Promise<ControlSensitivityStageObservation> {
    const child = await this.lifecycle('start', ['--ci', '--profile', 'operational'], 900_000);
    const observation = childObservation(child);
    this.stackStarted = observation.status === 'passed';
    return observation;
  }

  /** Treats successful lifecycle startup as the migrated, seeded, and healthy fixture proof. */
  public async verifyFixture(): Promise<ControlSensitivityStageObservation> {
    return Object.freeze({ status: this.stackStarted ? 'passed' : 'failed' });
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
    if (child.timedOut) return Object.freeze({ status: 'timed-out' });
    if (
      child.code === 1 &&
      child.stdout === '' &&
      child.stderr === `${definition.expectedSignature}\n` &&
      !child.cleanupFailed &&
      !child.outputTruncated &&
      child.forwardedSignal === null
    ) {
      return Object.freeze({ status: 'failed', signature: definition.expectedSignature });
    }
    if (
      child.code === 0 &&
      child.stdout === '' &&
      child.stderr === '' &&
      !child.cleanupFailed &&
      !child.outputTruncated &&
      child.forwardedSignal === null
    ) {
      return Object.freeze({ status: 'passed' });
    }
    return Object.freeze({ status: 'failed' });
  }

  /** Stops the owned stack, removes the exact worktree, and proves its runtime directory absent. */
  public async cleanup(): Promise<ControlSensitivityStageObservation> {
    let clean = true;
    if (this.worktreeCreated) {
      const stop = await this.lifecycle('stop', [], 180_000);
      clean = childObservation(stop).status === 'passed';
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
    if (clean) rmSync(this.runtimeRoot, { recursive: true, force: true });
    return Object.freeze({
      status: clean && !existsSync(this.runtimeRoot) ? 'passed' : 'failed',
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

/** Recovers only the exact repository-owned control-sensitivity run selected by UUID. */
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
    'test-harness/.assurance-runtime/control-sensitivity',
    runId,
  );
  const worktreeRoot = resolve(runtimeRoot, 'worktree');
  if (!existsSync(runtimeRoot)) return true;
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
