import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

/** Returns one SHA-256 identity for exact bytes. */
export function sha256Bytes(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Returns a canonical relative path and rejects traversal or symlink aliases. */
export function requireCanonicalChild(root: string, candidate: string): string {
  const absoluteRoot = realpathSync(root);
  const absoluteCandidate = realpathSync(candidate);
  const fromRoot = relative(absoluteRoot, absoluteCandidate);
  if (fromRoot === '' || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    throw new Error('packed consumer path escapes its owner');
  }
  return absoluteCandidate;
}

/**
 * Hashes a regular directory tree by stable relative path and exact file bytes.
 *
 * Installed packages may contain a package-manager-owned nested `node_modules` directory that was
 * not part of the archive. Callers may exclude that one top-level dependency directory while the
 * package manifest and every published file remain part of the digest.
 */
export function digestRegularTree(
  directory: string,
  excludedTopLevelNames: ReadonlySet<string> = new Set(),
): string {
  const digest = createHash('sha256');
  for (const path of listRegularFiles(directory, '', excludedTopLevelNames)) {
    digest.update(path);
    digest.update('\0');
    digest.update(readFileSync(resolve(directory, path)));
    digest.update('\0');
  }
  return digest.digest('hex');
}

/** Lists regular files without accepting symbolic links or special filesystem entries. */
function listRegularFiles(
  directory: string,
  prefix = '',
  excludedTopLevelNames: ReadonlySet<string> = new Set(),
): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    if (prefix === '' && excludedTopLevelNames.has(entry.name)) continue;
    const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    const absolutePath = resolve(directory, entry.name);
    const metadata = lstatSync(absolutePath);
    if (metadata.isSymbolicLink())
      throw new Error(`packed archive content cannot contain symlinks: ${relativePath}`);
    if (metadata.isDirectory())
      files.push(...listRegularFiles(absolutePath, relativePath, excludedTopLevelNames));
    else if (metadata.isFile()) files.push(relativePath);
    else throw new Error('packed archive content must contain only regular files and directories');
  }
  return files;
}
