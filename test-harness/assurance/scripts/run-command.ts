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

/** Exit code used when a command's owning phase has not installed its handler yet. */
const setupFailureExit = 30;

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

  reportUnavailable(action);
}

main(process.argv.slice(2));
