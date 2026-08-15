import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

import type { TenantAdminControlCheckDefinition } from './model.js';

/** Immutable identities produced for one verified isolated source variant. */
export interface AppliedControlVariant {
  /** Exact repository-relative target path. */
  readonly targetPath: string;
  /** Original source identity verified before transformation. */
  readonly originalSha256: string;
  /** Resulting source identity after every reviewed replacement. */
  readonly variantSha256: string;
}

/** Returns a SHA-256 identity for text without exposing it. */
function digestText(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

/** Counts non-overlapping exact literal occurrences. */
function occurrenceCount(value: string, candidate: string): number {
  if (candidate.length === 0) return 0;
  return value.split(candidate).length - 1;
}

/**
 * Applies one code-owned defensive source variant inside a disposable worktree.
 *
 * The target must be a canonical regular file below the supplied worktree. Every reviewed source
 * literal must occur exactly once so source drift cannot silently broaden the transformation.
 */
export function applyControlVariant(
  worktreeRoot: string,
  definition: TenantAdminControlCheckDefinition,
): AppliedControlVariant {
  const canonicalRoot = realpathSync(worktreeRoot);
  if (isAbsolute(definition.targetPath) || definition.targetPath.includes('\\')) {
    throw new Error('control-check target must be a repository-relative POSIX path');
  }
  const target = resolve(canonicalRoot, definition.targetPath);
  const relation = relative(canonicalRoot, target);
  if (
    relation === '' ||
    relation.startsWith('..') ||
    isAbsolute(relation) ||
    !lstatSync(target).isFile() ||
    realpathSync(target) !== target
  ) {
    throw new Error('control-check target must be a canonical worktree file');
  }
  const original = readFileSync(target, 'utf8');
  if (digestText(original) !== definition.originalSha256) {
    throw new Error('control-check target identity does not match the reviewed source');
  }
  let variant = original;
  for (const replacement of definition.replacements) {
    if (occurrenceCount(variant, replacement.before) !== 1) {
      throw new Error('reviewed control-check source literal must occur exactly once');
    }
    variant = variant.replace(replacement.before, replacement.after);
  }
  if (variant === original) throw new Error('control-check transformation made no source change');
  writeFileSync(target, variant, { encoding: 'utf8', flag: 'w' });
  return Object.freeze({
    targetPath: definition.targetPath,
    originalSha256: definition.originalSha256,
    variantSha256: digestText(variant),
  });
}
