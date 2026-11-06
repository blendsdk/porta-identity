/**
 * CLI management of client service-account bindings.
 *
 * These commands are used by a human administrator with existing CLI
 * credentials. They never obtain or store a machine credential, never retry a
 * mutation, and never read the binding before a replacement.
 *
 * Usage:
 *   porta client service-account get <client-id>
 *   porta client service-account set <client-id> --policy-file <path> [--email <address>]
 *   porta client service-account revoke <client-id>
 *
 * @module commands/client-service-account
 */

import type { CommandModule } from 'yargs';
import type { GlobalOptions } from '../global-options.js';
import type { ClientServiceAccount } from '@portaidentity/sdk';

import { createClient } from '../client-factory.js';
import { reportHumanError, reportJsonError } from '../error-handler.js';
import { printJson, success, info, formatDate, sanitizeTerminalText } from '../output.js';
import {
  readServiceAccountPolicyFile,
  requireServiceAccountEmail,
} from './client-service-account-input.js';

/** Arguments shared by the read and revoke operations. */
interface ServiceAccountClientArgs extends GlobalOptions {
  'client-id': string;
}

/** Arguments for the complete policy replacement. */
interface ServiceAccountSetArgs extends ServiceAccountClientArgs {
  'policy-file': string;
  email?: string;
}

/** Print one secret-free binding as calm, copy-pasteable human text. */
function printBinding(binding: ClientServiceAccount): void {
  info(`Binding:         ${sanitizeTerminalText(binding.id)}`);
  info(`Client:          ${sanitizeTerminalText(binding.clientId)}`);
  info(`Service account: ${sanitizeTerminalText(binding.serviceAccountId)}`);
  info(`Email:           ${sanitizeTerminalText(binding.accountEmail)}`);
  info(`Status:          ${binding.status}`);
  info(`Created:         ${formatDate(binding.createdAt)}`);
  info(`Updated:         ${formatDate(binding.updatedAt)}`);
  info('');
  info(`Targets (${binding.targets.length}):`);
  for (const target of binding.targets) {
    info(`  ${sanitizeTerminalText(target.organizationId)}`);
    const roles = target.allowedRoles
      .map((role) => `${sanitizeTerminalText(role.applicationId)}/${sanitizeTerminalText(role.roleId)}`)
      .join(', ');
    const claims = target.allowedClaimDefinitions
      .map(
        (claim) =>
          `${sanitizeTerminalText(claim.applicationId)}/${sanitizeTerminalText(claim.claimDefinitionId)}`,
      )
      .join(', ');
    info(`    Roles:  ${roles || '—'}`);
    info(`    Claims: ${claims || '—'}`);
  }
}

/** Report a failure through the shared classification boundary without throwing inside yargs. */
function fail(argv: GlobalOptions, error: unknown): void {
  if (argv.json) {
    reportJsonError(error);
    return;
  }
  reportHumanError(error, argv.verbose);
}

/** The client service-account subcommand group — registered under `client`. */
export const clientServiceAccountCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'service-account',
  describe: 'Manage the invitation service-account binding of a client',
  builder: (yargs) =>
    yargs
      .command<ServiceAccountClientArgs>(
        'get <client-id>',
        'Show the secret-free service-account binding',
        (y) =>
          y.positional('client-id', {
            type: 'string',
            demandOption: true,
            description: 'Client UUID (internal identifier)',
          }),
        async (argv) => {
          try {
            const client = createClient(argv);
            const binding = await client.clients.getServiceAccount(argv['client-id']);
            if (argv.json) printJson(binding);
            else printBinding(binding);
          } catch (error) {
            fail(argv, error);
          }
        },
      )
      .command<ServiceAccountSetArgs>(
        'set <client-id>',
        'Replace the complete binding policy (initial binding requires --email)',
        (y) =>
          y
            .positional('client-id', {
              type: 'string',
              demandOption: true,
              description: 'Client UUID (internal identifier)',
            })
            .option('policy-file', {
              type: 'string',
              demandOption: true,
              description: 'UTF-8 JSON policy file: {targets:[...]}; at most 100 KiB',
            })
            .option('email', {
              type: 'string',
              description: 'Account email for the first binding; immutable afterwards',
            }),
        async (argv) => {
          try {
            const email =
              argv.email === undefined ? undefined : requireServiceAccountEmail(argv.email);
            const policy = await readServiceAccountPolicyFile(argv['policy-file']);
            const client = createClient(argv);
            const input = email === undefined ? policy : { ...policy, accountEmail: email };
            const binding = await client.clients.setServiceAccount(argv['client-id'], input);
            if (argv.json) printJson(binding);
            else success(`Service-account binding saved: ${sanitizeTerminalText(binding.id)}`);
          } catch (error) {
            fail(argv, error);
          }
        },
      )
      .command<ServiceAccountClientArgs>(
        'revoke <client-id>',
        'Revoke the binding while keeping its permanent ownership history',
        (y) =>
          y.positional('client-id', {
            type: 'string',
            demandOption: true,
            description: 'Client UUID (internal identifier)',
          }),
        async (argv) => {
          try {
            const client = createClient(argv);
            await client.clients.revokeServiceAccount(argv['client-id']);
            if (argv.json) {
              printJson({ clientId: argv['client-id'], status: 'revoked' });
            } else {
              success(`Service-account binding revoked for ${sanitizeTerminalText(argv['client-id'])}`);
            }
          } catch (error) {
            fail(argv, error);
          }
        },
      )
      .demandCommand(1, 'Specify a service-account subcommand: get, set, revoke'),
  handler: () => {
    // No-op — subcommands handle execution.
  },
};
