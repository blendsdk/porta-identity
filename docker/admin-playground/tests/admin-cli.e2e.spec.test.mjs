/**
 * Packed CLI authentication specification for the isolated administration playground.
 */

import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const playgroundRoot = resolve(import.meta.dirname, '..');
const composePath = resolve(playgroundRoot, 'compose.yml');
const journeyDriverPath = resolve(import.meta.dirname, 'support/admin-cli-journey.mjs');

/** Returns true only after the playground and its controlled journey driver exist. */
async function playgroundJourneyIsAvailable() {
  try {
    await Promise.all([access(composePath), access(journeyDriverPath)]);
    return true;
  } catch {
    return false;
  }
}

test('should authenticate the packed CLI and restore its terminal when the isolated playground is available', async () => {
  assert.equal(
    await playgroundJourneyIsAvailable(),
    true,
    'admin playground and its journey driver must exist before this specification can pass',
  );
  const journey = await import(pathToFileURL(journeyDriverPath).href);
  assert.equal(typeof journey.runAdminCliJourney, 'function');

  const result = await journey.runAdminCliJourney({ playgroundRoot });

  assert.equal(result.cliWasPackedAndInstalled, true);
  assert.equal(result.playgroundIssuerWasValidated, true);
  assert.equal(result.verifiedBootstrapIdentityWasVisible, true);
  assert.equal(result.exitCode, 0);
  assert.equal(result.terminalWasRestored, true);
  assert.equal(result.cleanedOnlyPlaygroundResources, true);
});
