import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

/** Signals that immutable source provenance cannot be established. */
export class AssuranceProvenanceError extends Error {
  /** Creates a provenance error without retaining command output or repository contents. */
  public constructor(message: string) {
    super(message);
    this.name = 'AssuranceProvenanceError';
  }
}

/** Returns the SHA-256 identity of one repository file. */
export function digestRepositoryFile(path: string): string {
  return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
}

/** Returns every regular file beneath a directory in stable relative-path order. */
function listRegularFiles(directory: string, prefix = ''): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...listRegularFiles(absolutePath, relativePath));
    else if (entry.isFile()) files.push(relativePath);
    else
      throw new AssuranceProvenanceError(
        `assurance tooling contains a non-regular path: ${relativePath}`,
      );
  }
  return files;
}

/** Proves the worktree is clean and returns commit, tree, and assurance-tool identities. */
export function inspectFoundationProvenance(repositoryRoot: string): {
  commitIdentity: string;
  treeIdentity: string;
  assuranceToolDigest: string;
} {
  const canonicalRoot = realpathSync(repositoryRoot);
  let gitRoot: string;
  try {
    gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: canonicalRoot,
      encoding: 'utf8',
      timeout: 5_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    throw new AssuranceProvenanceError('assurance validation requires a Git worktree');
  }
  if (realpathSync(gitRoot) !== canonicalRoot) {
    throw new AssuranceProvenanceError('assurance validation must run from the Git worktree root');
  }
  const status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: canonicalRoot,
    encoding: 'utf8',
    timeout: 10_000,
  }).trim();
  if (status !== '')
    throw new AssuranceProvenanceError('assurance evidence requires a clean source tree');

  const commit = execFileSync('git', ['rev-parse', 'HEAD^{commit}'], {
    cwd: canonicalRoot,
    encoding: 'utf8',
    timeout: 5_000,
  }).trim();
  const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {
    cwd: canonicalRoot,
    encoding: 'utf8',
    timeout: 5_000,
  }).trim();
  const ownedInputs = [
    'package.json',
    'yarn.lock',
    'test-harness/eslint.config.js',
    'test-harness/tsconfig.assurance.json',
    ...listRegularFiles(resolve(canonicalRoot, 'test-harness/assurance')).map(
      (path) => `test-harness/assurance/${path}`,
    ),
  ].sort();
  const digest = createHash('sha256');
  for (const repositoryPath of ownedInputs) {
    digest.update(repositoryPath);
    digest.update('\0');
    digest.update(readFileSync(resolve(canonicalRoot, repositoryPath)));
    digest.update('\0');
  }
  return {
    commitIdentity: `commit:${commit}`,
    treeIdentity: `tree:${tree}`,
    assuranceToolDigest: `sha256:${digest.digest('hex')}`,
  };
}
