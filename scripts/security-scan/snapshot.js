/** Build credential-free Git snapshots without copying repository history or configuration. */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';

/** Paths excluded before Git can emit names or read blob contents. */
const excludedPaths = [
  '**/.env*',
  '**/.npmrc',
  '**/.ssh/**',
  '**/.aws/**',
  '**/.git-credentials',
  '**/.netrc',
  '**/.pgpass',
  '**/.my.cnf',
  '**/.docker/**',
  '**/.kube/**',
  '**/auth.json',
  '**/*credentials.json',
  '**/secrets.json',
  '**/*.pem',
  '**/*.key',
  '**/*.p12',
  '**/*.pfx',
  '**/*.crt',
  '**/*.cer',
  '**/id_rsa*',
  '**/id_ed25519*',
  '**/id_ecdsa*',
  '**/.bash_history',
  '**/.zsh_history',
  'scripts/pending-invitations.sql',
];

/**
 * Return path selectors that omit unknown hidden files and protected paths.
 * GitHub workflow/action sources are the only hidden-directory exception.
 * @returns {string[][]} Two disjoint selector groups for safe Git enumeration.
 */
export function sourceSelectors() {
  const excluded = excludedPaths.map((path) => `:(exclude,glob)${path}`);
  return [
    ['.', ':(exclude,glob)**/.*', ':(exclude,glob)**/.*/**', ...excluded],
    ['.github/workflows', '.github/actions', ...excluded],
  ];
}

/**
 * Run Git with literal arguments and no global configuration or interactive prompts.
 * @param {string} root Git worktree root.
 * @param {string[]} args Git arguments.
 * @param {object} [options] Optional input, environment overrides, and binary output.
 * @returns {string|Buffer} Command output, trimmed when textual.
 */
export function git(root, args, options = {}) {
  const result = execFileSync('git', args, {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_TERMINAL_PROMPT: '0',
      GIT_AUTHOR_NAME: 'Porta Security Snapshot',
      GIT_AUTHOR_EMAIL: 'scan@example.invalid',
      GIT_COMMITTER_NAME: 'Porta Security Snapshot',
      GIT_COMMITTER_EMAIL: 'scan@example.invalid',
      GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
      ...options.env,
    },
    input: options.input,
    encoding: options.binary ? undefined : 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 30_000,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return typeof result === 'string' ? result.trim() : result;
}

/**
 * Refuse scans of modified tracked source; untracked operator files are not enumerated.
 * @param {string} root Original worktree root.
 */
export function requireCommittedSource(root) {
  for (const selectors of sourceSelectors()) {
    // --quiet suppresses file names and contents, including on a dirty checkout.
    const result = spawnSync('git', ['diff', '--quiet', 'HEAD', '--', ...selectors], {
      cwd: root,
      stdio: 'ignore',
      timeout: 30_000,
      env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
    });
    if (result.status !== 0)
      throw new Error(
        'Commit your tracked source changes before scanning. Untracked files are excluded.',
      );
  }
}

/**
 * Check whether a stored baseline belongs to the current commit's ancestry.
 * @param {string} root Original Git root.
 * @param {string} base Previously scanned commit.
 * @param {string} head Current commit.
 * @returns {boolean} Whether a committed diff has an unambiguous lineage.
 */
export function isAncestor(root, base, head) {
  try {
    git(root, ['cat-file', '-e', `${base}^{commit}`]);
  } catch {
    return false;
  }
  try {
    git(root, ['merge-base', '--is-ancestor', base, head]);
    return true;
  } catch (error) {
    if (error.status === 1) return false;
    throw new Error('Could not verify the previous scan revision.', { cause: error });
  }
}

/**
 * Enumerate a committed tree using a task-owned index, never the operator's index.
 * @param {string} root Original worktree root.
 * @param {string} revision Original committed revision.
 * @param {string} index Task-owned temporary Git index.
 * @returns {Map<string, {mode: string, oid: string}>} Regular, allowed source blobs.
 */
function committedEntries(root, revision, index) {
  const env = { GIT_INDEX_FILE: index };
  git(root, ['read-tree', revision], { env });
  const entries = new Map();
  for (const selectors of sourceSelectors()) {
    const records = git(root, ['ls-files', '--stage', '-z', '--', ...selectors], {
      env,
      binary: true,
    });
    for (const record of records.toString('utf8').split('\0').filter(Boolean)) {
      const separator = record.indexOf('\t');
      const [mode, oid, stage] = record.slice(0, separator).split(' ');
      const path = record.slice(separator + 1);
      if (
        separator < 0 ||
        stage !== '0' ||
        posix.isAbsolute(path) ||
        path.split('/').includes('..') ||
        path.includes('\\')
      ) {
        throw new Error('Unsafe path in committed source.');
      }
      if (mode === '100644' || mode === '100755') entries.set(path, { mode, oid });
    }
  }
  return entries;
}

/**
 * Rebuild one sanitized revision, optionally materializing its files for the scanner.
 * Only selected regular blobs are read; symlinks, submodules and secret stores never are.
 * @param {string} original Original repository.
 * @param {string} source Synthetic scanner repository.
 * @param {Map<string, {mode: string, oid: string}>} entries Allowed source files.
 * @param {boolean} materialize Whether this is the visible current tree.
 * @param {string|undefined} parent Synthetic baseline commit, if any.
 * @param {(message: string) => void} progress Operator progress callback.
 * @returns {string} Synthetic commit ID with no original history attached.
 */
function buildRevision(original, source, entries, materialize, parent, progress) {
  git(source, ['read-tree', '--empty']);
  const index = [];
  const label = materialize ? 'Current source' : 'Baseline source';
  let processed = 0;
  progress(`${label}: 0/${entries.size} files`);
  for (const [path, { mode, oid }] of entries) {
    const content = git(original, ['cat-file', 'blob', oid], { binary: true });
    const syntheticOid = git(source, ['hash-object', '-w', '--stdin'], { input: content });
    index.push(`${mode} ${syntheticOid}\t${path}\0`);
    if (materialize) {
      const target = join(source, path);
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      writeFileSync(target, content, { mode: mode === '100755' ? 0o700 : 0o600, flag: 'wx' });
    }
    processed += 1;
    if (processed % 250 === 0 || processed === entries.size) {
      progress(`${label}: ${processed}/${entries.size} files`);
    }
  }
  git(source, ['update-index', '-z', '--index-info'], { input: index.join('') });
  const tree = git(source, ['write-tree']);
  return git(source, [
    'commit-tree',
    tree,
    ...(parent ? ['-p', parent] : []),
    '-m',
    'Sanitized security snapshot',
  ]);
}

/**
 * Create a clean repository containing only the selected baseline and current source.
 * Minimal Git metadata avoids creating or copying a .git/config credential store.
 * @param {string} original Original repository root.
 * @param {string} run Task-owned run directory outside the repository.
 * @param {string} revision Original HEAD to scan.
 * @param {string|null} baseline Original baseline for incremental scans.
 * @param {(message: string) => void} [progress] Optional stage and file-count output.
 * @returns {object} Snapshot path, synthetic revisions, and provenance manifest.
 */
export function createSnapshot(original, run, revision, baseline, progress = () => {}) {
  const source = join(run, 'source');
  const index = join(run, 'source-index');
  mkdirSync(join(source, '.git', 'objects'), { recursive: true, mode: 0o700 });
  mkdirSync(join(source, '.git', 'refs', 'heads'), { recursive: true, mode: 0o700 });
  writeFileSync(join(source, '.git', 'HEAD'), 'ref: refs/heads/scan\n', { mode: 0o600 });
  try {
    const base = baseline
      ? buildRevision(
          original,
          source,
          committedEntries(original, baseline, index),
          false,
          undefined,
          progress,
        )
      : null;
    const entries = committedEntries(original, revision, index);
    const head = buildRevision(original, source, entries, true, base ?? undefined, progress);
    writeFileSync(join(source, '.git', 'HEAD'), `${head}\n`);
    const manifest = {
      revision,
      baseline,
      syntheticHead: head,
      syntheticBase: base,
      files: [...entries].map(([path, { mode, oid }]) => ({ path, mode, originalBlob: oid })),
    };
    return { source, base, head, manifest };
  } finally {
    rmSync(index, { force: true });
    rmSync(`${index}.lock`, { force: true });
  }
}
