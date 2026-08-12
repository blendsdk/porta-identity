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
  coverageEnvironment,
  createCoverageWorkspace,
  extractRawCoverage,
  gracefullyFlushPorta,
  inspectPortaContainer,
  readActiveCoverageRun,
  writeCaptureManifest,
} from '../coverage/index.js';
import {
  removeCoverageObservation,
  runManagedCoverageConversion,
  withOwnedHarnessStack,
  writeCoverageFailureArtifact,
  type CoverageFailureStage,
} from './coverage-orchestration.js';
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
  'coverage-current-failure': {
    display: 'yarn tsx --test test-harness/assurance/tests/coverage-current-surface.spec.test.ts',
    args: [
      '--import',
      'tsx',
      '--test',
      'test-harness/assurance/tests/coverage-current-surface.spec.test.ts',
    ],
  },
  'fault-runner-missing': {
    display: 'yarn tsx --test test-harness/assurance/tests/fault-current-surface.spec.test.ts',
    args: [
      '--import',
      'tsx',
      '--test',
      'test-harness/assurance/tests/fault-current-surface.spec.test.ts',
    ],
  },
};

/** Complete lifecycle suite shared by progressive and final lifecycle selectors. */
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
  'coverage-pipeline': [
    'test-harness/assurance/tests/coverage-dependencies.impl.test.ts',
    'test-harness/assurance/tests/coverage-current-surface.spec.test.ts',
    'test-harness/assurance/tests/coverage-capture.impl.test.ts',
    'test-harness/assurance/tests/coverage-flush-container.impl.test.ts',
    'test-harness/assurance/tests/coverage-orchestration.impl.test.ts',
    'test-harness/assurance/tests/coverage-classification.impl.test.ts',
    'test-harness/assurance/tests/coverage-conversion.impl.test.ts',
  ],
  'coverage-all': [
    'test-harness/assurance/tests/coverage-envelope-and-provenance.spec.test.ts',
    'test-harness/assurance/tests/coverage-mapping-and-reproducibility.spec.test.ts',
    'test-harness/assurance/tests/coverage-observation-policy.spec.test.ts',
    'test-harness/assurance/tests/coverage-dependencies.impl.test.ts',
    'test-harness/assurance/tests/coverage-capture.impl.test.ts',
    'test-harness/assurance/tests/coverage-flush-container.impl.test.ts',
    'test-harness/assurance/tests/coverage-orchestration.impl.test.ts',
    'test-harness/assurance/tests/coverage-classification.impl.test.ts',
    'test-harness/assurance/tests/coverage-conversion.impl.test.ts',
    'test-harness/assurance/tests/coverage-conversion-hardening.impl.test.ts',
  ],
  'assurance-governance': [
    'test-harness/assurance/tests/assurance.spec.test.ts',
    'test-harness/assurance/tests/commands.impl.test.ts',
    'test-harness/assurance/tests/evidence.impl.test.ts',
    'test-harness/assurance/tests/governance.impl.test.ts',
  ],
};

/** Complete fixture specification and implementation files used by the fixture rollup. */
const fixtureRollupFiles = [
  'test-harness/assurance/tests/fixture-ontology.spec.test.ts',
  'test-harness/assurance/tests/assurance-project-collection.spec.test.ts',
  'test-harness/assurance/tests/fixture-isolation-and-repeatability.spec.test.ts',
  'test-harness/assurance/tests/assurance-source-boundaries.spec.test.ts',
  'test-harness/assurance/tests/fixture-runtime-files.impl.test.ts',
] as const;

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
  if (result.code === 0) return 0;
  if (result.code !== null && [20, 21, 30, 60, 70, 130, 143].includes(result.code)) {
    return result.code;
  }
  return nonzeroExit;
}

/** Runs one shell-free lifecycle action used by an internal live-boundary suite. */
async function runLifecycleAction(
  action: 'start' | 'stop' | 'project',
  project?: string,
  profile?: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<Awaited<ReturnType<typeof runManagedChild>>> {
  const actionOptions =
    action === 'start'
      ? ['--ci', ...(profile === undefined ? [] : ['--profile', profile])]
      : action === 'project' && project !== undefined
        ? ['--name', project]
        : [];
  return runManagedChild(
    process.execPath,
    ['--import', 'tsx', 'test-harness/scripts/lifecycle.ts', action, ...actionOptions],
    {
      cwd: process.cwd(),
      env: environment,
      stdio: 'inherit',
      timeoutMilliseconds:
        action === 'start' ? 900_000 : action === 'project' ? 1_800_000 : 120_000,
      terminationGraceMilliseconds: 10_000,
      cleanup: () => undefined,
    },
  );
}

/** Stops or recovers any durable run left by an interrupted or failed start attempt. */
async function cleanupHarnessStack(environment: NodeJS.ProcessEnv = process.env): Promise<number> {
  const stop = await runLifecycleAction('stop', undefined, undefined, environment);
  return managedChildExit(stop, 60) === 0 ? 0 : 60;
}

/** Owns one profile stack across a callback and always applies cleanup-failure precedence. */
async function withHarnessStack(
  profile: string,
  work: () => Promise<number>,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  return withOwnedHarnessStack(
    async () => {
      const start = await runLifecycleAction('start', undefined, profile, environment);
      return managedChildExit(start, setupFailureExit);
    },
    () => cleanupHarnessStack(environment),
    work,
  );
}

/** Captures one fixed-seed harness project from the owned Dockerized Porta process. */
async function runCoverageCommand(options: readonly string[]): Promise<void> {
  if (
    options.length !== 6 ||
    options[0] !== '--project' ||
    options[2] !== '--profile' ||
    options[4] !== '--seed'
  ) {
    process.stderr.write(
      'ASSURANCE_SELECTOR_INVALID: expected --project <project> --profile <profile> --seed <seed>\n',
    );
    process.exitCode = setupFailureExit;
    return;
  }
  const project = options[1];
  const profile = options[3];
  const seed = options[5];
  if (project !== 'protocol' && project !== 'security') {
    process.stderr.write(`ASSURANCE_SELECTOR_UNREGISTERED: ${project ?? ''}\n`);
    process.exitCode = setupFailureExit;
    return;
  }
  if (profile !== 'operational' && profile !== 'production-security') {
    process.stderr.write(`ASSURANCE_PROFILE_UNREGISTERED: ${profile ?? ''}\n`);
    process.exitCode = setupFailureExit;
    return;
  }
  if (seed !== 'coverage-baseline') {
    process.stderr.write(`ASSURANCE_SEED_UNREGISTERED: ${seed ?? ''}\n`);
    process.exitCode = setupFailureExit;
    return;
  }

  const workspace = createCoverageWorkspace(process.cwd(), project, profile);
  const interruption = new AbortController();
  let interruptedExit: 130 | 143 | undefined;
  const interrupt = (exitCode: 130 | 143): void => {
    interruptedExit ??= exitCode;
    interruption.abort();
  };
  const onSigint = (): void => interrupt(130);
  const onSigterm = (): void => interrupt(143);
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);
  let terminalStage: CoverageFailureStage = 'startup';
  try {
    let environment: NodeJS.ProcessEnv;
    try {
      environment = coverageEnvironment(workspace);
    } catch {
      process.exitCode = setupFailureExit;
      removeCoverageObservation(workspace);
      writeCoverageFailureArtifact(workspace, {
        stage: 'startup',
        exitCode: setupFailureExit,
        classification: exitTaxonomy[setupFailureExit],
        project,
        profile,
        seed,
      });
      process.stderr.write('ASSURANCE_COVERAGE_FAILED: stage=startup\n');
      return;
    }
    const result = await withHarnessStack(
      profile,
      async () => {
        let stage: CoverageFailureStage = 'active-run';
        try {
          const activeRun = readActiveCoverageRun(process.cwd());
          stage = 'container-inspect';
          const container = await inspectPortaContainer(
            process.cwd(),
            workspace,
            activeRun,
            interruption.signal,
          );
          stage = 'project';
          const projectResult = await runLifecycleAction(
            'project',
            project,
            undefined,
            environment,
          );
          const projectExit = managedChildExit(projectResult, testFailureExit);
          stage = 'graceful-stop';
          await gracefullyFlushPorta(process.cwd(), container);
          if (projectExit !== 0 || interruptedExit !== undefined) {
            terminalStage = 'project';
            return interruptedExit ?? projectExit;
          }
          stage = 'raw-extract';
          await extractRawCoverage(process.cwd(), workspace, container, interruption.signal);
          stage = 'raw-validate';
          terminalStage = stage;
          const manifest = await writeCaptureManifest(process.cwd(), workspace, container, {
            seed,
            project,
            profile,
          });
          if (manifest.flushStatus !== 'complete') return 40;
          stage = 'conversion';
          terminalStage = stage;
          if (interruptedExit !== undefined) return interruptedExit;
          const conversion = await runManagedCoverageConversion(process.cwd(), workspace);
          const conversionExit = managedChildExit(conversion, 40);
          if (conversionExit !== 0) {
            terminalStage = stage;
            return interruptedExit ?? conversionExit;
          }
          stage = 'observation';
          terminalStage = stage;
          return interruptedExit ?? 0;
        } catch {
          terminalStage = stage;
          return interruptedExit ?? 40;
        }
      },
      environment,
    );
    process.exitCode = result;
    if (result === 0) {
      process.stdout.write(
        `ASSURANCE_COVERAGE_CAPTURE=${workspace.manifestPath}\nASSURANCE_COVERAGE_REPORT=${workspace.reportDirectory}\n`,
      );
    } else {
      removeCoverageObservation(workspace);
      const stage: CoverageFailureStage = result === 60 ? 'cleanup' : terminalStage;
      const classification = exitTaxonomy[result as keyof typeof exitTaxonomy] ?? 'unknown-failure';
      writeCoverageFailureArtifact(workspace, {
        stage,
        exitCode: result,
        classification,
        project,
        profile,
        seed,
      });
      process.stderr.write(`ASSURANCE_COVERAGE_FAILED: stage=${stage}\n`);
    }
  } finally {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  }
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
  if (!['operational', 'production-security'].includes(profile)) {
    process.stderr.write(`ASSURANCE_PROFILE_UNREGISTERED: ${profile}\n`);
    process.exitCode = setupFailureExit;
    return;
  }

  process.exitCode = await withHarnessStack(profile, async () => {
    const projectResult = await runLifecycleAction('project', project);
    return managedChildExit(projectResult, testFailureExit);
  });
}

/** Runs a bounded internal Node suite with an optional exact test-name selector. */
function runNodeSuite(
  files: readonly string[],
  testNamePattern?: string,
): Promise<Awaited<ReturnType<typeof runManagedChild>>> {
  return runManagedChild(
    process.execPath,
    [
      '--import',
      'tsx',
      '--test',
      '--test-concurrency=1',
      ...(testNamePattern === undefined ? [] : [`--test-name-pattern=${testNamePattern}`]),
      ...files,
    ],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
      timeoutMilliseconds: 900_000,
      terminationGraceMilliseconds: 10_000,
      cleanup: () => undefined,
    },
  );
}

/** Runs all fixture cases across separately owned operational and production-security stacks. */
async function runFixtureRollup(): Promise<void> {
  const operationalExit = await withHarnessStack('operational', async () => {
    const operational = await runNodeSuite(fixtureRollupFiles);
    const suiteExit = managedChildExit(operational, testFailureExit);
    if (suiteExit !== 0) return suiteExit;
    const profiles = await runNodeSuite(
      ['test-harness/assurance/tests/assurance-profiles-and-secrets.spec.test.ts'],
      'separate every runtime credential|expose only the exact operational|operational profile',
    );
    return managedChildExit(profiles, testFailureExit);
  });
  if (operationalExit !== 0) {
    process.exitCode = operationalExit;
    return;
  }
  process.exitCode = await withHarnessStack('production-security', async () => {
    const profile = await runNodeSuite(
      ['test-harness/assurance/tests/assurance-profiles-and-secrets.spec.test.ts'],
      '^should verify every public postcondition for the production-security profile$',
    );
    const profileExit = managedChildExit(profile, testFailureExit);
    if (profileExit !== 0) return profileExit;
    const project = await runLifecycleAction('project', 'security');
    return managedChildExit(project, testFailureExit);
  });
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
  if (selector === 'fixtures-all') {
    await runFixtureRollup();
    return;
  }
  const selectedTests = internalTestSuites[selector];
  if (selectedTests === undefined) {
    process.stderr.write(`ASSURANCE_SELECTOR_UNREGISTERED: ${selector}\n`);
    process.exitCode = setupFailureExit;
    return;
  }

  const ownsFixtureStack = selector === 'fixture-ontology';
  const execute = async (): Promise<number> => {
    const result = await runManagedChild(
      process.execPath,
      ['--import', 'tsx', '--test', ...selectedTests],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: 'inherit',
        timeoutMilliseconds: ownsFixtureStack ? 900_000 : 120_000,
        terminationGraceMilliseconds: 2_000,
        cleanup: () => undefined,
      },
    );
    return managedChildExit(result, testFailureExit);
  };
  process.exitCode = ownsFixtureStack
    ? await withHarnessStack('operational', execute)
    : await execute();
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
  if (action === 'coverage') {
    await runCoverageCommand(options);
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
