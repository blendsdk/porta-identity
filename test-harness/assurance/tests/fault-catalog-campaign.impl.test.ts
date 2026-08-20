import assert from 'node:assert/strict';
import test from 'node:test';

import { loadFaultCatalog } from '../fault/catalog.js';
import {
  classifyFaultCatalogCampaignExit,
  expandCuratedFaultCatalog,
  isFullCatalogSelection,
  type FaultCatalogCampaignTupleEntry,
} from '../fault/campaign.js';
import { curatedFaultCatalogSchema } from '../fault/model.js';

/** Builds one sanitized completed tuple for precedence tests. */
function entry(
  classification: FaultCatalogCampaignTupleEntry['classification'],
  overrides: Partial<FaultCatalogCampaignTupleEntry> = {},
): FaultCatalogCampaignTupleEntry {
  return {
    faultId: 'foundation-smoke',
    claimId: 'CLAIM-R6-01',
    sentinelId: 'ST-64',
    identity: 'foundation-smoke::CLAIM-R6-01::ST-64',
    ordinal: 0,
    executionStatus: 'completed',
    classification,
    notRunReason: null,
    exactSignatureObserved: classification === 'killed',
    killedClaimIds: classification === 'killed' ? ['CLAIM-R6-01'] : [],
    blockedClaimIds:
      classification === 'survived' || classification === 'timeout' ? ['CLAIM-R6-01'] : [],
    freshDetachedWorktree: true,
    primaryTreeUnchanged: true,
    ownedResourcesRemovedOrRecovered: true,
    ...overrides,
  };
}

test('should admit only the reserved aggregate selection', () => {
  assert.equal(
    isFullCatalogSelection({
      faultId: 'full-catalog',
      claimId: 'catalog',
      sentinelId: 'all',
    }),
    true,
  );
  for (const selection of [
    { faultId: 'full-catalog', claimId: 'catalog', sentinelId: 'ST-64' },
    { faultId: 'full-catalog', claimId: 'CLAIM-R6-01', sentinelId: 'all' },
    { faultId: 'foundation-smoke', claimId: 'catalog', sentinelId: 'all' },
    { faultId: 'full-catalog*', claimId: 'catalog', sentinelId: 'all' },
  ]) {
    assert.equal(isFullCatalogSelection(selection), false);
  }
});

test('should expand the validated current catalog once in deterministic order', () => {
  const catalog = loadFaultCatalog(process.cwd());
  const first = expandCuratedFaultCatalog(catalog);
  const second = expandCuratedFaultCatalog(catalog);
  assert.deepEqual(first, second);
  assert.equal(first.length, 2);
  assert.deepEqual(
    first.map((tuple) => tuple.identity),
    ['foundation-smoke::CLAIM-R6-01::ST-64', 'foundation-smoke::CLAIM-R6-03::ST-66'],
  );
});

test('should reject duplicate tuple identities across the complete catalog', () => {
  const catalog = loadFaultCatalog(process.cwd());
  const foundation = catalog.faults[0];
  assert.ok(foundation);
  const parsed = curatedFaultCatalogSchema.safeParse({
    ...catalog,
    faults: [foundation, { ...foundation }],
  });
  assert.equal(parsed.success, false);
  if (parsed.success) return;
  assert.ok(
    parsed.error.issues.some(
      (issue) => issue.message === 'fault catalog tuples must have globally unique identities',
    ),
  );
});

test('should apply cleanup, signal, timeout, invalid, infrastructure, and survivor precedence', () => {
  assert.equal(classifyFaultCatalogCampaignExit([entry('killed')], undefined), 0);
  assert.equal(classifyFaultCatalogCampaignExit([entry('survived')], undefined), 21);
  assert.equal(
    classifyFaultCatalogCampaignExit(
      [entry('survived'), entry('infrastructure-failed')],
      undefined,
    ),
    30,
  );
  assert.equal(
    classifyFaultCatalogCampaignExit([entry('infrastructure-failed'), entry('invalid')], undefined),
    50,
  );
  assert.equal(
    classifyFaultCatalogCampaignExit([entry('invalid'), entry('timeout')], undefined),
    70,
  );
  assert.equal(classifyFaultCatalogCampaignExit([entry('timeout')], 130), 130);
  assert.equal(classifyFaultCatalogCampaignExit([entry('timeout')], 143), 143);
  assert.equal(
    classifyFaultCatalogCampaignExit(
      [entry('killed', { ownedResourcesRemovedOrRecovered: false })],
      143,
    ),
    60,
  );
  assert.equal(
    classifyFaultCatalogCampaignExit([entry('killed', { primaryTreeUnchanged: false })], 130),
    60,
  );
});

test('should distinguish completed entries from explicitly unattempted tuples', () => {
  const completed = entry('killed');
  const notRun: FaultCatalogCampaignTupleEntry = {
    ...completed,
    ordinal: 1,
    executionStatus: 'not-run',
    classification: null,
    notRunReason: 'SIGNAL_RECEIVED',
    exactSignatureObserved: false,
    killedClaimIds: [],
    blockedClaimIds: [],
    freshDetachedWorktree: false,
  };
  assert.equal(completed.executionStatus, 'completed');
  assert.equal(notRun.executionStatus, 'not-run');
  assert.equal(notRun.classification, null);
  assert.deepEqual(notRun.killedClaimIds, []);
});
