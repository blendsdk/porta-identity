/** Isolated Git repositories and a fake external scanner for scan-wrapper tests. */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/** Repository-owned entry point tested as an operator would invoke it. */
const script = resolve(import.meta.dirname, '../../scripts/security-scan.js');

/**
 * Create a temporary repository without copying Git configuration or credentials.
 * Private ancestry is required by the scanner, so use sticky OS temporary space.
 * @param {import('node:test').TestContext} context Test cleanup owner.
 * @returns {object} Fixture paths, commit builder, wrapper runner, and scanner calls.
 */
export function scanFixture(context) {
  const root = mkdtempSync(join(tmpdir(), 'porta-security-test-'));
  const repository = join(root, 'repository');
  const state = join(root, 'state');
  const bin = join(root, 'bin');
  const calls = join(root, 'calls.jsonl');
  const control = join(root, 'control.json');
  mkdirSync(join(repository, '.git', 'objects'), { recursive: true });
  mkdirSync(join(repository, '.git', 'refs', 'heads'), { recursive: true });
  mkdirSync(bin);
  writeFileSync(join(repository, '.git', 'HEAD'), 'ref: refs/heads/test\n');
  writeFileSync(control, '{}');
  context.after(() => rmSync(root, { recursive: true, force: true }));

  const environment = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_AUTHOR_NAME: 'Fixture',
    GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
    GIT_COMMITTER_NAME: 'Fixture',
    GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
  };
  const git = (args, input) =>
    execFileSync('git', args, {
      cwd: repository,
      env: environment,
      input,
      encoding: 'utf8',
    }).trim();

  writeFileSync(
    join(bin, 'cs'),
    `#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
const args = process.argv.slice(2);
const control = JSON.parse(readFileSync(${JSON.stringify(control)}, 'utf8'));
appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ args, cwd: process.cwd(), unrelatedToken: Boolean(process.env.UNRELATED_TEST_TOKEN) }) + '\\n');
if (args[0] === '--version') { console.log(control.version || '0.8.3'); process.exit(0); }
if (args[0] === 'export') {
  if (control.invalidExport) process.exit(2);
  writeFileSync(args[args.indexOf('--output') + 1], JSON.stringify({ findings: control.findings || [] }));
  process.exit(0);
}
if (args.includes('--dry-run')) process.exit(0);
const source = args[1];
const files = execFileSync('git', ['ls-files', '-z'], { cwd: source, encoding: 'utf8' }).split('\\0').filter(Boolean);
appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ files, copiedGitConfig: existsSync(join(source, '.git/config')) }) + '\\n');
const current = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim();
if (args.includes('--diff')) {
  const base = args[args.indexOf('--diff') + 1];
  const diff = execFileSync('git', ['diff', '--name-status', base, current], { cwd: source, encoding: 'utf8' });
  appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ diff }) + '\\n');
}
if (control.exit) process.exit(control.exit);
const output = args[args.indexOf('--output-dir') + 1];
mkdirSync(output, { recursive: true });
if (!control.missingReport) writeFileSync(join(output, 'report.md'), '# Completed fixture scan\\n');
`,
    { mode: 0o700 },
  );

  /** Build one committed fixture revision; only ordinary source files are written. */
  function commit(files, parent = undefined) {
    for (const [name, content] of Object.entries(files)) {
      const target = join(repository, name);
      if (content === null) {
        rmSync(target, { force: true });
        continue;
      }
      mkdirSync(resolve(target, '..'), { recursive: true });
      writeFileSync(target, content);
    }
    git(['add', '--all']);
    const tree = git(['write-tree']);
    const previous =
      parent ??
      spawnSync('git', ['rev-parse', '--verify', 'HEAD'], {
        cwd: repository,
        env: environment,
        encoding: 'utf8',
      }).stdout.trim();
    const revision = git([
      'commit-tree',
      tree,
      ...(previous ? ['-p', previous] : []),
      '-m',
      'Fixture revision',
    ]);
    git(['update-ref', 'refs/heads/test', revision]);
    return revision;
  }
  return {
    root,
    repository,
    state,
    bin,
    git,
    commit,
    configure(value) {
      writeFileSync(control, JSON.stringify(value));
    },
    run(...args) {
      return spawnSync(process.execPath, [script, '--state-dir', state, ...args], {
        cwd: repository,
        env: { ...environment, UNRELATED_TEST_TOKEN: 'not-a-real-token' },
        encoding: 'utf8',
      });
    },
    calls() {
      return readFileSync(calls, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
    },
    baseline() {
      return JSON.parse(readFileSync(join(state, 'last-success.json'), 'utf8'));
    },
  };
}
