/** Operator contracts for full-first, committed incremental security scans. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { scanFixture } from './security-scan-fixture.mjs';

// The first completed scan establishes a revision, not a claim of vulnerability absence.
test('should run a full scan first and preserve completed findings', (context) => {
  const fixture = scanFixture(context);
  const revision = fixture.commit({ 'src/app.js': 'export const value = 1;\n' });
  fixture.configure({ findings: [{ title: 'Fixture finding', severity: 'medium' }] });
  const run = fixture.run();
  assert.equal(run.status, 0, run.stderr);
  assert.equal(fixture.baseline().revision, revision);
  const scan = fixture.calls().find(({ args }) => args?.[0] === 'scan');
  assert.ok(!scan.args.includes('--diff'));
  assert.equal(scan.args[scan.args.indexOf('--model') + 1], 'gpt-6.1-sol');
  assert.ok(scan.args.includes('approval_policy="never"'));
  assert.equal(scan.unrelatedToken, false);
  assert.match(run.stdout, /1 finding/);
  assert.match(run.stdout, /Preparing.*snapshot/i);
  assert.match(run.stdout, /Current source: 1\/1 files/);
  assert.match(run.stdout, /Starting Codex Security/);
  assert.ok(!scan.args.includes('--headless'));
});

// Diffs must include deletions and use the most recent completed revision.
test('should scan committed changes including deleted files since the last completed scan', (context) => {
  const fixture = scanFixture(context);
  fixture.commit({ 'src/app.js': 'one', 'src/removed.js': 'old' });
  assert.equal(fixture.run().status, 0);
  const revision = fixture.commit({ 'src/app.js': 'two', 'src/removed.js': null });
  const run = fixture.run();
  assert.equal(run.status, 0, run.stderr);
  assert.equal(fixture.baseline().revision, revision);
  const scan = fixture
    .calls()
    .filter(({ args }) => args?.[0] === 'scan')
    .at(-1);
  assert.ok(scan.args.includes('--diff'));
  assert.match(fixture.calls().findLast(({ diff }) => diff)?.diff, /D\s+src\/removed.js/);
});

test('should skip an unchanged completed revision and support forced full scans', (context) => {
  const fixture = scanFixture(context);
  fixture.commit({ 'src/app.js': 'one' });
  assert.equal(fixture.run().status, 0);
  const before = fixture.calls().filter(({ args }) => args?.[0] === 'scan').length;
  assert.equal(fixture.run().status, 0);
  assert.equal(fixture.calls().filter(({ args }) => args?.[0] === 'scan').length, before);
  assert.equal(fixture.run('--force-full').status, 0);
  assert.ok(
    !fixture
      .calls()
      .filter(({ args }) => args?.[0] === 'scan')
      .at(-1)
      .args.includes('--diff'),
  );
});

test('should require a completed baseline for explicit diff mode', (context) => {
  const fixture = scanFixture(context);
  fixture.commit({ 'src/app.js': 'one' });
  const run = fixture.run('diff');
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /full scan/i);
  assert.equal(existsSync(join(fixture.state, 'last-success.json')), false);
});

test('should run a new full scan after scanner versions change', (context) => {
  const fixture = scanFixture(context);
  fixture.commit({ 'src/app.js': 'one' });
  assert.equal(fixture.run().status, 0);
  fixture.configure({ version: '0.8.4' });
  const run = fixture.run();
  assert.equal(run.status, 0, run.stderr);
  assert.ok(
    !fixture
      .calls()
      .filter(({ args }) => args?.[0] === 'scan')
      .at(-1)
      .args.includes('--diff'),
  );
});

test('should leave the baseline unchanged after a failed or incomplete scan', (context) => {
  const fixture = scanFixture(context);
  fixture.commit({ 'src/app.js': 'one' });
  assert.equal(fixture.run().status, 0);
  const baseline = readFileSync(join(fixture.state, 'last-success.json'), 'utf8');
  fixture.commit({ 'src/app.js': 'two' });
  for (const failure of [{ exit: 2 }, { invalidExport: true }, { missingReport: true }]) {
    fixture.configure(failure);
    const run = fixture.run();
    assert.notEqual(run.status, 0);
    assert.equal(readFileSync(join(fixture.state, 'last-success.json'), 'utf8'), baseline);
    assert.equal(existsSync(join(fixture.state, 'lock')), false);
  }
});

test('should preflight without advancing state and show status without a model call', (context) => {
  const fixture = scanFixture(context);
  fixture.commit({ 'src/app.js': 'one' });
  const run = fixture.run('--plan-only');
  assert.equal(run.status, 0, run.stderr);
  assert.ok(
    fixture
      .calls()
      .find(({ args }) => args?.[0] === 'scan')
      .args.includes('--dry-run'),
  );
  assert.equal(existsSync(join(fixture.state, 'last-success.json')), false);
  const before = fixture.calls().length;
  assert.equal(fixture.run('--status').status, 0);
  assert.equal(fixture.calls().length, before);
});

test('should reject dirty tracked source without reading untracked operator files', (context) => {
  const fixture = scanFixture(context);
  fixture.commit({ 'src/app.js': 'one' });
  writeFileSync(join(fixture.repository, 'operator-notes.sql'), 'untracked fixture');
  assert.equal(fixture.run('--plan-only').status, 0);
  writeFileSync(join(fixture.repository, 'src/app.js'), 'uncommitted');
  const run = fixture.run();
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /commit.*changes/i);
});
