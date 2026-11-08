/** Failure, source-isolation, and state-integrity contracts for scan automation. */
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { scanFixture } from './security-scan-fixture.mjs';

// Runtime snapshots must not inherit a link to any operator-owned filesystem path.
test('should exclude symlinks and untracked files without copying Git configuration', (context) => {
  const fixture = scanFixture(context);
  fixture.commit({ 'src/app.js': 'one' });
  writeFileSync(join(fixture.root, 'operator.txt'), 'operator-owned fixture');
  symlinkSync(join(fixture.root, 'operator.txt'), join(fixture.repository, 'src/link.txt'));
  fixture.commit({});
  writeFileSync(join(fixture.repository, 'untracked.sql'), 'untracked fixture');
  const run = fixture.run();
  assert.equal(run.status, 0, run.stderr);
  const snapshot = fixture.calls().find(({ files }) => files);
  assert.deepEqual(snapshot.files, ['src/app.js']);
  assert.equal(snapshot.copiedGitConfig, false);
  const runPath = fixture.baseline().run;
  assert.equal(existsSync(join(runPath, 'source')), false);
  assert.equal(existsSync(join(runPath, 'tmp')), false);
});

test('should refuse concurrent runs and preserve the existing lock', (context) => {
  const fixture = scanFixture(context);
  fixture.commit({ 'src/app.js': 'one' });
  mkdirSync(fixture.state, { mode: 0o700 });
  mkdirSync(join(fixture.state, 'lock'));
  const run = fixture.run();
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /lock/);
  assert.equal(existsSync(join(fixture.state, 'lock')), true);
});

test('should refuse corrupt baseline state without replacing it', (context) => {
  const fixture = scanFixture(context);
  fixture.commit({ 'src/app.js': 'one' });
  assert.equal(fixture.run().status, 0);
  const path = join(fixture.state, 'last-success.json');
  writeFileSync(path, '{broken');
  const run = fixture.run();
  assert.notEqual(run.status, 0);
  assert.equal(readFileSync(path, 'utf8'), '{broken');
});

test('should reject linked baseline files without reading or replacing their targets', (context) => {
  const fixture = scanFixture(context);
  fixture.commit({ 'src/app.js': 'one' });
  mkdirSync(fixture.state, { mode: 0o700 });
  const target = join(fixture.root, 'operator.json');
  writeFileSync(target, 'operator-owned fixture');
  symlinkSync(target, join(fixture.state, 'last-success.json'));
  const run = fixture.run();
  assert.notEqual(run.status, 0);
  assert.equal(readFileSync(target, 'utf8'), 'operator-owned fixture');
});

test('should reject shared state directories without changing their permissions', (context) => {
  const fixture = scanFixture(context);
  fixture.commit({ 'src/app.js': 'one' });
  mkdirSync(fixture.state, { mode: 0o700 });
  chmodSync(fixture.state, 0o777);
  const run = fixture.run();
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /shared|0700/);
  assert.deepEqual(readdirSync(fixture.state), []);
});

test('should reject linked output roots without touching their targets', (context) => {
  const fixture = scanFixture(context);
  fixture.commit({ 'src/app.js': 'one' });
  const target = join(fixture.root, 'operator-directory');
  mkdirSync(target, { mode: 0o700 });
  symlinkSync(target, fixture.state);
  const run = fixture.run();
  assert.notEqual(run.status, 0);
  assert.deepEqual(readdirSync(target), []);
});

test('should reject unknown arguments and conflicting modes before invoking the scanner', (context) => {
  const fixture = scanFixture(context);
  fixture.commit({ 'src/app.js': 'one' });
  for (const args of [['--model', 'other'], ['full', 'diff'], ['--patch'], ['--status', 'full']]) {
    const run = fixture.run(...args);
    assert.notEqual(run.status, 0);
  }
  assert.equal(existsSync(join(fixture.root, 'calls.jsonl')), false);
});

test('should fall back to a full scan on divergent history and reject explicit diffs', (context) => {
  const fixture = scanFixture(context);
  const first = fixture.commit({ 'src/app.js': 'one' });
  fixture.commit({ 'src/app.js': 'two' });
  assert.equal(fixture.run().status, 0);
  fixture.commit({ 'src/app.js': 'different branch' }, first);
  const rejected = fixture.run('diff');
  assert.notEqual(rejected.status, 0);
  const run = fixture.run();
  assert.equal(run.status, 0, run.stderr);
  assert.equal(fixture.baseline().mode, 'full');
});
