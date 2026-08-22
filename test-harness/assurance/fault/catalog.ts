import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

import { curatedFaultCatalogSchema, type CuratedFault, type CuratedFaultCatalog } from './model.js';

/** Resolves a repository-owned regular file without accepting traversal or symlinks. */
export function resolveFaultFile(
  repositoryRoot: string,
  repositoryPath: string,
  expectedPrefix: string,
): string {
  if (isAbsolute(repositoryPath) || repositoryPath.includes('\\')) {
    throw new Error('fault path must be a repository-relative POSIX path');
  }
  const absolutePath = resolve(repositoryRoot, repositoryPath);
  const allowedRoot = resolve(repositoryRoot, expectedPrefix);
  const fromAllowedRoot = relative(allowedRoot, absolutePath);
  if (
    fromAllowedRoot === '' ||
    fromAllowedRoot.startsWith('..') ||
    isAbsolute(fromAllowedRoot) ||
    !lstatSync(absolutePath).isFile() ||
    realpathSync(absolutePath) !== absolutePath
  ) {
    throw new Error('fault path must identify a canonical owned regular file');
  }
  return absolutePath;
}

/** Loads and validates the complete versioned curated-fault catalog. */
export function loadFaultCatalog(repositoryRoot: string): CuratedFaultCatalog {
  const catalogPath = resolveFaultFile(
    repositoryRoot,
    'test-harness/assurance/fault/catalog.json',
    'test-harness/assurance/fault',
  );
  const catalog = curatedFaultCatalogSchema.parse(JSON.parse(readFileSync(catalogPath, 'utf8')));
  for (const fault of catalog.faults) {
    resolveFaultFile(repositoryRoot, fault.target.path, 'test-harness/assurance/fault');
    resolveFaultFile(repositoryRoot, fault.patchPath, 'test-harness/assurance/fault/patches');
  }
  return catalog;
}

/** Selects one stable fault ID and rejects unknown selectors. */
export function selectFault(catalog: CuratedFaultCatalog, faultId: string): CuratedFault {
  const fault = catalog.faults.find((candidate) => candidate.id === faultId);
  if (fault === undefined) throw new Error('selected fault is not registered');
  return fault;
}
