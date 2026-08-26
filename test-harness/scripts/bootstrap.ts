/**
 * Owner-only harness bootstrap entry point.
 *
 * The reset controller passes the synthetic administrator password through a mode-0600 file so
 * it never appears in the process argument list. The file is removed before Porta's bootstrap
 * services are invoked.
 */

import { readFileSync, realpathSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { z } from 'zod';

const inputPath = process.env.HARNESS_BOOTSTRAP_INPUT;
if (inputPath === undefined) throw new Error('HARNESS_BOOTSTRAP_INPUT is required');
const canonicalInput = realpathSync(inputPath);
const expectedDirectory = realpathSync(
  resolve(process.cwd(), 'test-harness/.assurance-runtime', process.env.HARNESS_RUN_ID ?? ''),
);
if (dirname(canonicalInput) !== expectedDirectory) {
  throw new Error('bootstrap input is outside the active runtime directory');
}
const input = z
  .object({ password: z.string().min(15).max(128) })
  .strict()
  .parse(JSON.parse(readFileSync(canonicalInput, 'utf8')));
rmSync(canonicalInput);

const { initCommand } = await import('../../packages/server/src/cli/commands/init.js');
if (typeof initCommand.handler !== 'function') throw new Error('Porta init handler is unavailable');
await initCommand.handler({
  _: ['init'],
  $0: 'porta',
  json: false,
  verbose: false,
  force: false,
  'dry-run': false,
  dryRun: false,
  email: 'admin@test-harness.local',
  'given-name': 'Admin',
  givenName: 'Admin',
  'family-name': 'User',
  familyName: 'User',
  password: input.password,
});
