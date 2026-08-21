import assert from 'node:assert/strict';
import test from 'node:test';

import {
  shouldContinueAfterProductionExposure,
  shouldRunProductionSecurityBlocks,
} from '../scripts/harness-profile-admission.js';

test('should exclude production-only blocks from the operational security project', () => {
  assert.equal(shouldRunProductionSecurityBlocks('security', 'operational'), false);
});

test('should admit production-only blocks for the production-security project', () => {
  assert.equal(shouldRunProductionSecurityBlocks('security', 'production-security'), true);
});

test('should exclude production-only blocks from every other harness project', () => {
  for (const project of ['spa', 'bff', 'protocol', 'compatibility']) {
    assert.equal(shouldRunProductionSecurityBlocks(project, 'production-security'), false);
  }
});

test('should continue only after successful, known-product, or admitted incomplete collection', () => {
  assert.equal(shouldContinueAfterProductionExposure(0, false), true);
  assert.equal(shouldContinueAfterProductionExposure(20, false), true);
  assert.equal(shouldContinueAfterProductionExposure(40, true), true);

  for (const exitCode of [21, 30, 40, 50, 60, 70, 130, 143]) {
    assert.equal(
      shouldContinueAfterProductionExposure(exitCode, false),
      false,
      `unexpected exit ${exitCode} must remain terminal`,
    );
  }
});
