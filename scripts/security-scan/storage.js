/** Private, atomic operator state for repeated source-security scans. */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** Model pinned for both full and incremental review. */
export const MODEL = 'gpt-6.1-sol';

/**
 * Select a stable, repository-specific state location outside the checkout.
 * @param {string} root Canonical original repository root.
 * @param {string|undefined} selected Explicit operator state directory.
 * @returns {string} Absolute state directory.
 */
export function stateDirectory(root, selected) {
  if (selected?.split(/[\\/]/).includes('..'))
    throw new Error('State directory must not contain .. segments.');
  const key = createHash('sha256').update(root).digest('hex').slice(0, 16);
  const directory = resolve(
    selected ?? join(homedir(), '.local', 'state', 'porta-codex-security', key),
  );
  const protectedDirectories = new Set([
    '.git',
    '.ssh',
    '.aws',
    '.codex',
    '.porta',
    '.docker',
    '.kube',
    '.gnupg',
  ]);
  if (directory.split(sep).some((part) => protectedDirectories.has(part))) {
    throw new Error('State must not be placed inside a credential or tool-authentication store.');
  }
  const relation = relative(root, directory);
  if (
    !relation ||
    (!(relation === '..' || relation.startsWith(`..${sep}`)) && !isAbsolute(relation))
  ) {
    throw new Error('Scan state and results must be outside the repository.');
  }
  return directory;
}

/**
 * Refuse linked or shared output ancestry without changing existing permissions.
 * This mirrors Codex Security's private-output requirement and protects scan data.
 * @param {string} directory Absolute state directory.
 * @param {boolean} [create] Create missing private directories after validation.
 */
export function requirePrivateDirectory(directory, create = true) {
  const missing = [];
  let current = directory;
  for (;;) {
    if (existsSync(current)) {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory())
        throw new Error('State path must contain only real directories.');
      if (existsSync(join(current, '.git')))
        throw new Error('State must be outside every Git worktree.');
      if (stat.mode & 0o022 && !(stat.mode & 0o1000))
        throw new Error(
          `State ancestor is shared: ${current}. Choose a private --state-dir; existing permissions will not be changed.`,
        );
      if (current === directory && (stat.uid !== process.getuid() || stat.mode & 0o077)) {
        throw new Error('Existing state directory must be owned by you and have mode 0700.');
      }
    } else {
      // lstat also detects broken links; existsSync alone deliberately does not.
      try {
        lstatSync(current);
        throw new Error('Linked state paths are not allowed.');
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      missing.push(current);
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  if (create) for (const path of missing.reverse()) mkdirSync(path, { mode: 0o700 });
}

/**
 * Read validated baseline metadata without following links or accepting foreign state.
 * @param {string} directory Private state directory.
 * @param {string} repository Original repository identity.
 * @returns {object|null} Last completed source scan, or no baseline.
 */
export function readBaseline(directory, repository) {
  const path = join(directory, 'last-success.json');
  if (!existsSync(path)) {
    try {
      lstatSync(path);
      throw new Error('Linked baseline files are not allowed.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return null;
  }
  if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())
    throw new Error('Baseline must be a regular file.');
  const baseline = JSON.parse(readFileSync(path, 'utf8'));
  if (
    baseline.schemaVersion !== 1 ||
    baseline.repository !== repository ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(baseline.revision) ||
    typeof baseline.scannerVersion !== 'string' ||
    typeof baseline.policyDigest !== 'string' ||
    typeof baseline.model !== 'string' ||
    typeof baseline.completedAt !== 'string'
  ) {
    throw new Error(
      'Invalid scan baseline. Preserve it for investigation and use a new --state-dir.',
    );
  }
  return baseline;
}

/**
 * Atomically replace owned metadata so interruption cannot truncate the baseline.
 * @param {string} path Destination inside private state.
 * @param {object} value Serializable metadata.
 */
export function writeMetadata(path, value) {
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  renameSync(temporary, path);
}
