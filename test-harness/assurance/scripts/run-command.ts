import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

import {
  assuranceCommandActions,
  commandContracts,
  commandContractVersion,
  exitPrecedence,
  exitTaxonomy,
  isAssuranceCommandAction,
  rootAliasForAction,
} from '../commands.js';
import { redSignatureRegistrySchema } from '../schema.js';
import {
  AssuranceCleanupError,
  AssuranceSetupError,
  renderFoundationReport,
  runFoundationValidation,
} from './foundation-artifacts.js';
import { runManagedChild } from './managed-child.js';
import { matchRedSignature } from './validate-assurance.js';

/** Exit code used when a command's owning phase has not installed its handler yet. */
const setupFailureExit = 30;

/** Exit code used when the internal test runner reports an assertion or collection failure. */
const testFailureExit = 21;

/** Exit code used when a bounded child process exceeds the command contract. */
const timeoutExit = 70;

/** Maximum TAP output retained while matching one exact RED signature. */
const redOutputLimitBytes = 256 * 1024;

/** Shell-free child definitions for RED cases installed by their owning phase. */
const redCommands: Readonly<
  Record<string, { readonly display: string; readonly args: readonly string[] }>
> = {
  'lifecycle-current-failure': {
    display: 'yarn tsx --test test-harness/assurance/tests/lifecycle-current-surface.spec.test.ts',
    args: [
      '--import',
      'tsx',
      '--test',
      'test-harness/assurance/tests/lifecycle-current-surface.spec.test.ts',
    ],
  },
  'fixture-current-failure': {
    display: 'yarn tsx --test test-harness/assurance/tests/fixture-current-surface.spec.test.ts',
    args: [
      '--import',
      'tsx',
      '--test',
      'test-harness/assurance/tests/fixture-current-surface.spec.test.ts',
    ],
  },
};

/** Complete lifecycle suite shared by progressive and final Phase 2 selectors. */
const lifecycleTestFiles = [
  'test-harness/assurance/tests/lifecycle-leasing.spec.test.ts',
  'test-harness/assurance/tests/lifecycle-cleanup.spec.test.ts',
  'test-harness/assurance/tests/lifecycle-compatibility.spec.test.ts',
  'test-harness/assurance/tests/lifecycle-outcomes.spec.test.ts',
  'test-harness/assurance/tests/reset-success.spec.test.ts',
  'test-harness/assurance/tests/reset-interruptions.spec.test.ts',
  'test-harness/assurance/tests/reset-recovery.spec.test.ts',
  'test-harness/assurance/tests/reset-verification.spec.test.ts',
  'test-harness/assurance/tests/lifecycle-recovery.impl.test.ts',
  'test-harness/assurance/tests/lifecycle-runtime.impl.test.ts',
  'test-harness/assurance/tests/reset-finalization.impl.test.ts',
  'test-harness/assurance/tests/lifecycle-quality-boundaries.spec.test.ts',
  'test-harness/assurance/tests/lifecycle-intent-safety.spec.test.ts',
  'test-harness/assurance/tests/lifecycle-operation-serialization.spec.test.ts',
] as const;

/** Registered selector-to-specification mappings for internal Node suites. */
const internalTestSuites: Readonly<Record<string, readonly string[]>> = {
  'assurance-foundation': ['test-harness/assurance/tests/assurance-foundation.impl.test.ts'],
  'assurance-signal-probe': ['test-harness/assurance/tests/signal-probe.impl.fixture.ts'],
  lifecycle: lifecycleTestFiles,
  'lifecycle-all': lifecycleTestFiles,
  'fixture-ontology': [
    'test-harness/assurance/tests/fixture-ontology.spec.test.ts',
    'test-harness/assurance/tests/fixture-runtime-files.impl.test.ts',
  ],
  'project-collection': ['test-harness/assurance/tests/assurance-project-collection.spec.test.ts'],
  'assurance-governance': [
    'test-harness/assurance/tests/assurance.spec.test.ts',
    'test-harness/assurance/tests/commands.impl.test.ts',
    'test-harness/assurance/tests/evidence.impl.test.ts',
    'test-harness/assurance/tests/governance.impl.test.ts',
  ],
};

/** Converts one managed child outcome to the stable assurance exit taxonomy. */
function managedChildExit(
  result: Awaited<ReturnType<typeof runManagedChild>>,
  nonzeroExit: number,
): number {
  if (result.cleanupFailed) return 60;
  if (result.forwardedSignal === 'SIGINT') return 130;
  if (result.forwardedSignal === 'SIGTERM') return 143;
  if (result.timedOut) return timeoutExit;
  if (result.setupFailed) return setupFailureExit;
  return result.code === 0 ? 0 : nonzeroExit;
}

/** Runs one shell-free lifecycle action used by an internal live-boundary suite. */
async function runLifecycleAction(
  action: 'start' | 'stop' | 'project',
  project?: string,
): Promise<Awaited<ReturnType<typeof runManagedChild>>> {
  const actionOptions =
    action === 'start'
      ? ['--ci']
      : action === 'project' && project !== undefined
        ? ['--name', project]
        : [];
  return runManagedChild(
    process.execPath,
    ['--import', 'tsx', 'test-harness/scripts/lifecycle.ts', action, ...actionOptions],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
      timeoutMilliseconds: action === 'start' ? 900_000 : 120_000,
      terminationGraceMilliseconds: 10_000,
      cleanup: () => undefined,
    },
  );
}

/** Executes one allowlisted Playwright project against an owned operational stack. */
async function runHarnessCommand(options: readonly string[]): Promise<void> {
  if (options.length !== 4 || options[0] !== '--project' || options[2] !== '--profile') {
    process.stderr.write(
      'ASSURANCE_SELECTOR_INVALID: expected --project <project> --profile <profile>\n',
    );
    process.exitCode = setupFailureExit;
    return;
  }
  const project = options[1] ?? '';
  const profile = options[3] ?? '';
  if (!['spa', 'bff', 'protocol', 'security', 'compatibility'].includes(project)) {
    process.stderr.write(`ASSURANCE_SELECTOR_UNREGISTERED: ${project}\n`);
    process.exitCode = setupFailureExit;
    return;
  }
  if (profile !== 'operational') {
    process.stderr.write(`ASSURANCE_PROFILE_UNAVAILABLE: ${profile}\n`);
    process.exitCode = setupFailureExit;
    return;
  }

  const startResult = await runLifecycleAction('start');
  const startExit = managedChildExit(startResult, setupFailureExit);
  if (startExit !== 0) {
    process.exitCode = startExit;
    return;
  }
  const projectResult = await runLifecycleAction('project', project);
  const stopResult = await runLifecycleAction('stop');
  if (managedChildExit(stopResult, 60) !== 0) {
    process.exitCode = 60;
    return;
  }
  process.exitCode = managedChildExit(projectResult, 20);
}

/** Serializes the complete frozen command contract for repository checks and operators. */
function describeAllContracts(): string {
  return JSON.stringify({
    version: commandContractVersion,
    commands: commandContracts,
    exitTaxonomy,
    exitPrecedence,
  });
}

/** Prints one command's selector, prerequisites, timeout, artifacts, and recovery contract. */
function printCommandHelp(action: (typeof assuranceCommandActions)[number]): void {
  const alias = rootAliasForAction(action);
  const contract = commandContracts[alias];
  const selector = contract.selectorGrammar === '' ? '' : ` ${contract.selectorGrammar}`;

  process.stdout.write(
    [
      `Usage: yarn ${alias}${selector}`,
      `Timeout: ${contract.timeout}`,
      `Artifacts: test-harness/.assurance-results/<run-id>/${contract.artifactSubdirectory}`,
      `Prerequisites: ${contract.prerequisites.join('; ')}`,
      `Signals: ${contract.signalContract}`,
      `Cleanup: ${contract.cleanupContract}`,
    ].join('\n') + '\n',
  );
}

/** Reports a deterministic setup failure until a later phase installs the command handler. */
function reportUnavailable(action: (typeof assuranceCommandActions)[number]): void {
  process.stderr.write(
    `ASSURANCE_HANDLER_UNAVAILABLE: assurance:${action} is registered but its handler is not installed\n`,
  );
  process.exitCode = setupFailureExit;
}

/** Executes one registered internal Node test suite without passing input through a shell. */
async function runInternalTests(options: readonly string[]): Promise<void> {
  const normalizedOptions = options.length === 0 ? ['--select', 'assurance-governance'] : options;
  if (normalizedOptions.length !== 2 || normalizedOptions[0] !== '--select') {
    process.stderr.write(
      'ASSURANCE_SELECTOR_INVALID: expected --select <registered-suite|ST-ID|internal-test-path>\n',
    );
    process.exitCode = setupFailureExit;
    return;
  }

  const selector = normalizedOptions[1] ?? '';
  const selectedTests = internalTestSuites[selector];
  if (selectedTests === undefined) {
    process.stderr.write(`ASSURANCE_SELECTOR_UNREGISTERED: ${selector}\n`);
    process.exitCode = setupFailureExit;
    return;
  }

  const ownsFixtureStack = selector === 'fixture-ontology';
  if (ownsFixtureStack) {
    const startResult = await runLifecycleAction('start');
    const startExit = managedChildExit(startResult, setupFailureExit);
    if (startExit !== 0) {
      process.exitCode = startExit;
      return;
    }
  }

  const result = await runManagedChild(
    process.execPath,
    ['--import', 'tsx', '--test', ...selectedTests],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
      timeoutMilliseconds: 120_000,
      terminationGraceMilliseconds: 2_000,
      cleanup: () => undefined,
    },
  );

  if (ownsFixtureStack) {
    const stopResult = await runLifecycleAction('stop');
    const stopExit = managedChildExit(stopResult, 60);
    if (stopExit !== 0) {
      process.exitCode = 60;
      return;
    }
  }

  process.exitCode = managedChildExit(result, testFailureExit);
}

/** Runs one allowlisted RED child and accepts only its exact registered assertion failure. */
async function runRedCommand(options: readonly string[]): Promise<void> {
  if (options.length !== 4 || options[0] !== '--case' || options[2] !== '--signature') {
    process.stderr.write(
      'ASSURANCE_SELECTOR_INVALID: expected --case <ST-ID> --signature <signature-id>\n',
    );
    process.exitCode = setupFailureExit;
    return;
  }

  const caseId = options[1] ?? '';
  const signatureId = options[3] ?? '';
  const command = redCommands[signatureId];
  if (command === undefined) {
    process.stderr.write('ASSURANCE_RED_UNAVAILABLE: signature handler is not installed\n');
    process.exitCode = setupFailureExit;
    return;
  }

  try {
    const registry = redSignatureRegistrySchema.parse(
      JSON.parse(
        readFileSync(resolve(process.cwd(), 'test-harness/assurance/red-signatures.json'), 'utf8'),
      ),
    );
    const signature = registry.signatures.find((candidate) => candidate.id === signatureId);
    if (
      signature === undefined ||
      signature.command !== command.display ||
      signature.normalizedFailureExit !== testFailureExit
    ) {
      throw new Error('registered RED command contract does not match its handler');
    }

    const result = await runManagedChild(process.execPath, command.args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'pipe',
      maxOutputBytes: redOutputLimitBytes,
      timeoutMilliseconds: 120_000,
      terminationGraceMilliseconds: 2_000,
      cleanup: () => undefined,
    });
    if (result.cleanupFailed) {
      process.exitCode = 60;
      return;
    }
    if (result.forwardedSignal === 'SIGINT') {
      process.exitCode = 130;
      return;
    }
    if (result.forwardedSignal === 'SIGTERM') {
      process.exitCode = 143;
      return;
    }
    if (result.timedOut) {
      process.exitCode = timeoutExit;
      return;
    }
    if (result.setupFailed || result.outputTruncated || result.code === null) {
      process.exitCode = setupFailureExit;
      return;
    }

    const boundedOutput = `${result.stdout}\n${result.stderr}`;
    matchRedSignature(registry, caseId, signatureId, result.code, boundedOutput);
    if (!/(?:^|\n)# pass 0(?:\r?\n|$)/u.test(boundedOutput)) {
      throw new Error('RED child did not report zero passing cases');
    }
    if (!/(?:^|\n)# fail 1(?:\r?\n|$)/u.test(boundedOutput)) {
      throw new Error('RED child did not report exactly one failing case');
    }
    if (boundedOutput.split(signature.marker).length !== 2) {
      throw new Error('RED marker must occur exactly once');
    }

    process.stdout.write(
      `ASSURANCE_RED_MATCHED: case=${caseId} signature=${signatureId} raw-exit=${result.code}\n`,
    );
  } catch (error) {
    process.stderr.write(`ASSURANCE_RED_REJECTED: ${errorMessage(error)}\n`);
    process.exitCode = testFailureExit;
  }
}

/** Returns a minimal diagnostic message without serializing an exception or stack. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown assurance command failure';
}

/** Validates committed foundation definitions and creates one ignored evidence run. */
function runValidationCommand(options: readonly string[]): void {
  if (options.length !== 0) {
    process.stderr.write('ASSURANCE_SELECTOR_INVALID: assurance:validate accepts no options\n');
    process.exitCode = setupFailureExit;
    return;
  }
  try {
    const runId = runFoundationValidation(process.cwd());
    process.stdout.write(`ASSURANCE_RUN_ID=${runId}\n`);
  } catch (error) {
    if (error instanceof AssuranceCleanupError) {
      process.stderr.write(
        `ASSURANCE_CLEANUP_FAILED: run=${error.runId} recovery=${error.recoveryCommand}\n`,
      );
      process.exitCode = 60;
      return;
    }
    if (error instanceof AssuranceSetupError) {
      process.stderr.write(`ASSURANCE_SETUP_FAILED: ${errorMessage(error)}\n`);
      process.exitCode = setupFailureExit;
      return;
    }
    process.stderr.write(`ASSURANCE_VALIDATION_FAILED: ${errorMessage(error)}\n`);
    process.exitCode = testFailureExit;
  }
}

/** Renders one sanitized owned run selected by an exact UUID. */
function runReportCommand(options: readonly string[]): void {
  if (options.length !== 2 || options[0] !== '--run') {
    process.stderr.write('ASSURANCE_SELECTOR_INVALID: expected --run <run-uuid>\n');
    process.exitCode = setupFailureExit;
    return;
  }
  try {
    const reportPath = renderFoundationReport(process.cwd(), options[1] ?? '');
    process.stdout.write(`ASSURANCE_REPORT=${reportPath}\n`);
  } catch (error) {
    process.stderr.write(`ASSURANCE_REPORT_FAILED: ${errorMessage(error)}\n`);
    process.exitCode = testFailureExit;
  }
}

/** Runs the root dispatcher without interpreting untrusted input as code or shell syntax. */
async function main(arguments_: readonly string[]): Promise<void> {
  const [action, ...options] = arguments_;

  if (action === '--describe-all' && options.length === 0) {
    process.stdout.write(`${describeAllContracts()}\n`);
    return;
  }
  if (action === undefined || !isAssuranceCommandAction(action)) {
    process.stderr.write(
      `ASSURANCE_COMMAND_INVALID: expected one of ${assuranceCommandActions.join(', ')}\n`,
    );
    process.exitCode = setupFailureExit;
    return;
  }
  if (options.length === 1 && (options[0] === '--help' || options[0] === '-h')) {
    printCommandHelp(action);
    return;
  }
  if (action === 'test') {
    await runInternalTests(options);
    return;
  }
  if (action === 'red') {
    await runRedCommand(options);
    return;
  }
  if (action === 'harness') {
    await runHarnessCommand(options);
    return;
  }
  if (action === 'validate') {
    runValidationCommand(options);
    return;
  }
  if (action === 'report') {
    runReportCommand(options);
    return;
  }

  reportUnavailable(action);
}

await main(process.argv.slice(2));
