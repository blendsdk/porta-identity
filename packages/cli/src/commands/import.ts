/** Conventional command for previewing and applying Porta portability manifests. */

import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { PortabilityManifest, PortabilityResult } from '@portaidentity/sdk';
import type { CommandModule } from 'yargs';
import { createClient } from '../client-factory.js';
import { handleError } from '../error-handler.js';
import type { GlobalOptions } from '../global-options.js';
import { printJson, printTable, success, warn } from '../output.js';
import { confirm } from '../prompt.js';

/** Largest local manifest accepted before an SDK request. */
const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;

/** Parsed arguments for one portability manifest import. */
interface ImportManifestArguments extends GlobalOptions {
  readonly path: string;
  readonly mode: 'keep-existing' | 'update-existing';
  readonly yes: boolean;
}

/** Read one bounded JSON document without exposing local filesystem details. */
async function readManifest(path: string): Promise<PortabilityManifest> {
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    throw new Error('Unable to read manifest file.');
  }
  if (size > MAX_MANIFEST_BYTES) {
    throw new Error('Manifest file is too large; the limit is 64 MiB.');
  }

  let content: string;
  try {
    content = await readFile(path, 'utf-8');
  } catch {
    throw new Error('Unable to read manifest file.');
  }

  try {
    const parsed: unknown = JSON.parse(content);
    // The SDK type describes the outgoing wire contract. The server remains the single strict
    // validation authority, so the CLI deliberately does not maintain a second manifest schema.
    return parsed as PortabilityManifest;
  } catch {
    throw new Error('Manifest contains invalid JSON.');
  }
}

/** Convert a public natural key to stable readable text. */
function naturalKeyText(naturalKey: Readonly<Record<string, string>>): string {
  return Object.entries(naturalKey)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
}

/** Print the ordered bounded errors from one rejected operation. */
function printRejected(result: PortabilityResult, json: boolean): void {
  if (json) {
    printJson(result);
  } else {
    printTable(
      ['Entity', 'Natural key', 'Code'],
      result.errors.map((error) => [
        error.entity_type,
        naturalKeyText(error.natural_key),
        error.code,
      ]),
    );
  }
  process.exitCode = 1;
}

/** Print aggregate operation counts without exposing manifest contents. */
function printSummary(result: PortabilityResult): void {
  printTable(
    ['Entity', 'Created', 'Updated', 'Skipped', 'Rejected'],
    Object.entries(result.summary).map(([entity, counts]) => [
      entity,
      String(counts.created),
      String(counts.updated),
      String(counts.skipped),
      String(counts.rejected),
    ]),
  );
}

/** Print a committed result and each generated credential exactly once. */
function printApplied(result: PortabilityResult, json: boolean): void {
  if (json) {
    printJson(result);
    return;
  }
  printSummary(result);
  if (result.credentials && result.credentials.length > 0) {
    printTable(
      ['Client ID', 'Label', 'Expires', 'Secret'],
      result.credentials.map((credential) => [
        credential.client_id,
        credential.label,
        credential.expires_at,
        credential.secret,
      ]),
    );
    warn('Client secrets are shown once. Store them securely now.');
  }
  success('Portability manifest imported');
}

/** Preview and optionally apply one local portability manifest. */
export const importCommand: CommandModule<GlobalOptions, GlobalOptions> = {
  command: 'import',
  describe: 'Import a Porta portability manifest',
  builder: (yargs) =>
    yargs
      .command<ImportManifestArguments>(
        'manifest [path]',
        'Preview and apply a portability manifest',
        (command) =>
          command
            .positional('path', {
              type: 'string',
              describe: 'Local JSON manifest file',
            })
            .option('mode', {
              type: 'string',
              choices: ['keep-existing', 'update-existing'] as const,
              demandOption: true,
              describe: 'How to handle matching destination records',
            })
            .option('yes', {
              type: 'boolean',
              default: false,
              describe: 'Apply a successful preview without confirmation',
            })
            .check((arguments_) => {
              if (!arguments_.path) throw new Error('Manifest path is required.');
              return true;
            }),
        async (arguments_) => {
          try {
            const manifest = await readManifest(resolve(arguments_.path));
            const client = createClient(arguments_);
            const preview = await client.imports.preview(manifest);
            if (preview.errors.length > 0) {
              printRejected(preview, arguments_.json);
              return;
            }

            if (!arguments_.yes) {
              if (!arguments_.json) printSummary(preview);
              const approved = await confirm('Apply this portability plan?');
              if (!approved) return;
            }

            const applied = await client.imports.apply(manifest, arguments_.mode);
            if (applied.errors.length > 0) {
              printRejected(applied, arguments_.json);
              return;
            }
            printApplied(applied, arguments_.json);
          } catch (error) {
            handleError(error, arguments_.verbose);
          }
        },
      )
      .demandCommand(1, 'Please specify the import subcommand: manifest'),
  handler: () => undefined,
};
