import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldRunProductionSecurityBlocks } from '../scripts/harness-profile-admission.js';

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
