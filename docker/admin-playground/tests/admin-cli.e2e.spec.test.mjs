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

/** Loads the packed CLI journey contract without starting its Docker services. */
async function loadJourneyDriver() {
  return import(pathToFileURL(journeyDriverPath).href);
}

test('should authenticate the packed CLI and restore its terminal when the isolated playground is available', async () => {
  assert.equal(
    await playgroundJourneyIsAvailable(),
    true,
    'admin playground and its journey driver must exist before this specification can pass',
  );
  const journey = await loadJourneyDriver();
  assert.equal(typeof journey.runAdminCliJourney, 'function');

  const result = await journey.runAdminCliJourney({ playgroundRoot });

  assert.equal(result.cliWasPackedAndInstalled, true);
  assert.equal(result.playgroundIssuerWasValidated, true);
  assert.equal(result.verifiedBootstrapIdentityWasVisible, true);
  assert.equal(result.initialOrganizationChooserWasObservedAndCancelled, true);
  assert.equal(result.whoAmIProvedVerifiedEmail, true);
  assert.equal(result.organizationWasExplicitlySwitched, true);
  assert.equal(result.highEntropyOrganizationWasCreatedAndAutoSelected, true);
  assert.equal(result.usersWereBrowsed, true);
  assert.equal(result.userDetailWasOpened, true);
  assert.equal(result.nonceUserWasCreated, true);
  assert.equal(result.usersMenuWasRestored, true);
  assert.equal(result.applicationsWereOpenedWithoutOrganization, true);
  assert.equal(result.deploymentGlobalNoticeWasVisible, true);
  assert.equal(result.nonceApplicationWasCreated, true);
  assert.equal(result.nonceModuleWasCreatedEditedAndDeactivated, true);
  assert.equal(result.organizationClientWasCreated, true);
  assert.equal(result.clientConfigurationWasReloadedAuthoritatively, true);
  assert.equal(result.clientSecretMetadataWasListed, true);
  assert.equal(result.clientSecretWasGeneratedAndRevoked, true);
  assert.equal(result.secretPlaintextWasShownExactlyOnce, true);
  assert.equal(result.secretPlaintextWasDisposedAfterDismissal, true);
  assert.equal(result.organizationSwitchClearedClientWorkspace, true);
  assert.equal(result.testOrganizationWasProvenAbsentBeforeCreate, true);
  assert.equal(result.cleanupUsedIsolatedPackedSdkContext, true);
  assert.equal(result.cleanupVerifiedNonceOwnership, true);
  assert.equal(result.cleanupVerifiedNonceUserOwnership, true);
  assert.equal(result.testUserWasAbsentAfterCleanup, true);
  assert.equal(result.testOrganizationWasAbsentAfterCleanup, true);
  assert.equal(result.testClientAndSecretsWereAbsentAfterCleanup, true);
  assert.equal(result.testModuleWasDeactivatedAfterCleanup, true);
  assert.equal(result.testApplicationWasArchivedAfterCleanup, true);
  assert.equal(result.exitCode, 0);
  assert.equal(result.terminalWasRestored, true);
  assert.equal(result.alternateScreenWasEnteredExactlyOnce, true);
  assert.equal(result.alternateScreenWasLeftAfterJourneyAndCleanup, true);
  assert.equal(result.packedAdminProcessWasReaped, true);
  assert.equal(result.cleanedOnlyPlaygroundResources, true);
});

test('should retain a primary journey failure when cleanup succeeds', async () => {
  // A successful cleanup never replaces or wraps the original journey failure.
  const journey = await loadJourneyDriver();
  assert.equal(typeof journey.combineJourneyAndCleanupErrors, 'function');
  const primaryFailure = new Error('primary journey failure');

  assert.equal(journey.combineJourneyAndCleanupErrors(primaryFailure, undefined), primaryFailure);
});

test('should retain a cleanup failure when the journey succeeds', async () => {
  // Cleanup is the only reported failure when every journey assertion completed successfully.
  const journey = await loadJourneyDriver();
  assert.equal(typeof journey.combineJourneyAndCleanupErrors, 'function');
  const cleanupFailure = new Error('cleanup failure');

  assert.equal(journey.combineJourneyAndCleanupErrors(undefined, cleanupFailure), cleanupFailure);
});

test('should retain simultaneous journey and cleanup failures in order', async () => {
  // When both stages fail, ordered AggregateError evidence keeps the primary failure before cleanup.
  const journey = await loadJourneyDriver();
  assert.equal(typeof journey.combineJourneyAndCleanupErrors, 'function');
  const primaryFailure = new Error('primary journey failure');
  const cleanupFailure = new Error('cleanup failure');

  const combined = journey.combineJourneyAndCleanupErrors(primaryFailure, cleanupFailure);

  assert.ok(combined instanceof AggregateError);
  assert.deepEqual(combined.errors, [primaryFailure, cleanupFailure]);
});
