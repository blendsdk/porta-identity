import process from 'node:process';
import { spawnSync } from 'node:child_process';

import {
  assuranceCommandActions,
  commandContracts,
  commandContractVersion,
  exitPrecedence,
  exitTaxonomy,
  isAssuranceCommandAction,
  rootAliasForAction,
} from '../commands.js';

/** Exit code used when a command's owning phase has not installed its handler yet. */
const setupFailureExit = 30;

/** Exit code used when the internal test runner reports an assertion or collection failure. */
const testFailureExit = 21;

/** Exit code used when a bounded child process exceeds the command contract. */
const timeoutExit = 70;

/** Initial selector-to-specification mapping installed by the foundation phase. */
const internalTestSuites: Readonly<Record<string, string>> = {
  'assurance-foundation': 'test-harness/assurance/tests/assurance-foundation.spec.test.ts',
};

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

/** Returns whether a child-process error carries one exact platform error code. */
function errorHasCode(error: Error, expectedCode: string): boolean {
  return 'code' in error && error.code === expectedCode;
}

/** Executes one registered internal Node test suite without passing input through a shell. */
function runInternalTests(options: readonly string[]): void {
  if (options.length !== 2 || options[0] !== '--select') {
    process.stderr.write(
      'ASSURANCE_SELECTOR_INVALID: expected --select <registered-suite|ST-ID|internal-test-path>\n',
    );
    process.exitCode = setupFailureExit;
    return;
  }

  const selectedTest = internalTestSuites[options[1] ?? ''];
  if (selectedTest === undefined) {
    process.stderr.write(`ASSURANCE_SELECTOR_UNREGISTERED: ${options[1] ?? ''}\n`);
    process.exitCode = setupFailureExit;
    return;
  }

  const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', selectedTest], {
    cwd: process.cwd(),
    stdio: 'inherit',
    timeout: 120_000,
    killSignal: 'SIGTERM',
  });

  if (result.error !== undefined) {
    process.stderr.write(`ASSURANCE_TEST_RUNNER_ERROR: ${result.error.message}\n`);
    process.exitCode = errorHasCode(result.error, 'ETIMEDOUT') ? timeoutExit : setupFailureExit;
    return;
  }
  if (result.signal === 'SIGINT') {
    process.exitCode = 130;
    return;
  }
  if (result.signal === 'SIGTERM') {
    process.exitCode = 143;
    return;
  }

  process.exitCode = result.status === 0 ? 0 : testFailureExit;
}

/** Runs the root dispatcher without interpreting untrusted input as code or shell syntax. */
function main(arguments_: readonly string[]): void {
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
    runInternalTests(options);
    return;
  }

  reportUnavailable(action);
}

main(process.argv.slice(2));
