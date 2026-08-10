import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { claimSchema, redSignatureRegistrySchema, traceabilitySchema } from '../schema.js';

/** Public options for resolving an allowlisted repository reference. */
export interface RepositoryReferenceOptions {
  /** Absolute repository root used only as a trusted resolution anchor. */
  repositoryRoot: string;
  /** Repository-relative directory that the resolved reference must remain beneath. */
  allowedRoot: string;
}

/** Minimal known-test record used to validate sentinel references. */
interface KnownTest {
  /** Canonical repository-relative test path. */
  path: string;
  /** Exact collected case names. */
  cases: readonly string[];
  /** Sole runner that owns the file. */
  runner: string;
}

/** Returns whether an unknown value is a plain property record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Extracts only structurally valid known-test records from an untrusted context. */
function readKnownTests(context: unknown): KnownTest[] {
  if (!isRecord(context) || !Array.isArray(context.knownTests)) return [];

  return context.knownTests.flatMap((candidate) => {
    if (
      !isRecord(candidate) ||
      typeof candidate.path !== 'string' ||
      typeof candidate.runner !== 'string' ||
      !Array.isArray(candidate.cases) ||
      !candidate.cases.every((caseName) => typeof caseName === 'string')
    ) {
      return [];
    }
    return [{ path: candidate.path, cases: candidate.cases, runner: candidate.runner }];
  });
}

/** Rejects duplicate strings and names the first duplicated value. */
function requireUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

/** Returns values once in their first-seen order. */
function uniqueInOrder(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/** Requires a committed node list to equal the nodes derived from exact mappings. */
function requireExactNodeList(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  if (
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error(`traceability ${label} list does not match exact mappings`);
  }
}

/** Validates a claim catalog and preserves its original records. */
export function validateCatalog<T>(claims: readonly T[], context: unknown): T[] {
  const parsedClaims = claims.map((claim) => claimSchema.parse(claim));
  requireUnique(
    parsedClaims.map((claim) => claim.id),
    'claim identifier',
  );

  const knownTests = readKnownTests(context);
  if (knownTests.length > 0) {
    for (const claim of parsedClaims) {
      for (const sentinel of claim.sentinels) {
        const knownTest = knownTests.find((candidate) => candidate.path === sentinel.test);
        if (knownTest === undefined) {
          throw new Error(`unknown sentinel test: ${sentinel.test}`);
        }
        if (!knownTest.cases.includes(sentinel.case)) {
          throw new Error(`unknown sentinel case: ${sentinel.case}`);
        }
        if (knownTest.runner !== sentinel.runner) {
          throw new Error(`runner mismatch for sentinel: ${sentinel.test}`);
        }
      }
    }
  }

  return [...claims];
}

/** Requires the evidence needed before a claim may enter the assured state. */
function requireAssuredEvidence(claim: Record<string, unknown>): void {
  if (!Array.isArray(claim.gaps) || claim.gaps.length > 0) {
    throw new Error('cannot enter assured state while named gaps exist');
  }
  if (!isRecord(claim.evidence) || claim.evidence.current !== true) {
    throw new Error('cannot enter assured state with stale or missing evidence');
  }
  const results = claim.evidence.results;
  if (
    !Array.isArray(results) ||
    results.length === 0 ||
    results.some((result) => !isRecord(result) || result.status !== 'passed')
  ) {
    throw new Error('cannot enter assured state without green verification results');
  }
  const faultIds = claim.evidence.faultIds;
  const killedFaultIds = claim.evidence.killedFaultIds;
  if (
    !Array.isArray(faultIds) ||
    faultIds.length === 0 ||
    !Array.isArray(killedFaultIds) ||
    killedFaultIds.length === 0 ||
    !faultIds.every((faultId) => killedFaultIds.includes(faultId))
  ) {
    throw new Error('cannot enter assured state without killed fault evidence');
  }
}

/** Applies one validated claim-state transition. */
export function transitionClaim<T extends object>(
  claim: T,
  nextStatus: string,
  context: unknown,
): T & { status: string } {
  if (nextStatus === 'assured') {
    if (!isRecord(claim)) throw new Error('cannot enter assured state with an invalid claim');
    requireAssuredEvidence(claim);
  }

  const transitioned = { ...claim, status: nextStatus };
  validateCatalog([transitioned], context);
  return transitioned;
}

/** Imports inventory as untrusted claim candidates without granting assurance. */
export function importInventory(
  claims: readonly unknown[],
  knownTests: readonly unknown[],
): Array<{ status: string; source?: unknown }> {
  return [
    ...claims.map((source) => ({ status: 'unreviewed', source })),
    ...knownTests.map((source) => ({ status: 'unreviewed', source })),
  ];
}

/** Records a confirmed product defect while returning a blocked claim. */
export function recordProductDefect<T extends object, D>(
  claim: T,
  defect: D,
): { claim: T & { status: string }; defect: D } {
  if (!isRecord(defect) || typeof defect.routing !== 'string') {
    throw new Error('product defect requires a routing destination');
  }
  return { claim: { ...claim, status: 'blocked' }, defect };
}

/** Rejects an oracle that derives expectations from implementation behavior. */
export function validateOracle<T>(oracle: T): T {
  if (!isRecord(oracle)) throw new Error('independent oracle must be an object');
  if (oracle.sourceKind === 'production-helper' || oracle.sourceKind === 'current-output') {
    throw new Error('self-derived oracle cannot use a production helper or current output');
  }
  return oracle;
}

/** Returns whether a sentinel supplies exact, non-vacuous evidence. */
export function assessSentinel(sentinel: unknown): { trusted: boolean } {
  if (!isRecord(sentinel)) return { trusted: false };
  const vacuousPatterns = new Set([
    'conditional-early-exit',
    'swallowed-setup',
    'broad-status-allowlist',
    'not-500',
  ]);
  if (typeof sentinel.pattern === 'string' && vacuousPatterns.has(sentinel.pattern)) {
    return { trusted: false };
  }
  return { trusted: sentinel.trusted === true };
}

/** Validates that incomplete review results retain named gaps and honest conclusions. */
export function completeSurfaceReview<T>(review: T): T {
  if (!isRecord(review)) throw new Error('surface review must be an object');
  if (review.evidenceSufficient === false) {
    if (!Array.isArray(review.gaps) || review.gaps.length === 0) {
      throw new Error('insufficient evidence requires a named gap');
    }
    if (review.safetyImplication !== undefined) {
      throw new Error('insufficient evidence cannot imply safety');
    }
  }
  return review;
}

/** Validates supported-surface contract coverage and preserves the definitions. */
export function validateSurfaceClaims<T>(claims: readonly T[]): T[] {
  const requiredSurfaces = ['oidc', 'admin', 'sdk', 'cli', 'email', 'config', 'lifecycle'];
  const seen = new Set<string>();
  for (const claim of claims) {
    if (
      !isRecord(claim) ||
      typeof claim.surface !== 'string' ||
      !Array.isArray(claim.claimIds) ||
      claim.claimIds.length === 0 ||
      !isRecord(claim.contract) ||
      typeof claim.contract.observation !== 'string' ||
      claim.contract.observation.length === 0 ||
      !Object.hasOwn(claim.contract, 'expected')
    ) {
      throw new Error('surface claim requires a named surface and exact contract');
    }
    if (seen.has(claim.surface)) throw new Error(`duplicate surface claim: ${claim.surface}`);
    seen.add(claim.surface);
  }
  for (const surface of requiredSurfaces) {
    if (!seen.has(surface)) throw new Error(`missing supported surface claim: ${surface}`);
  }
  return [...claims];
}

/** Validates specification naming and single-runner ownership. */
export function validateTestOwnership<T>(ownership: readonly T[]): T[] {
  for (const entry of ownership) {
    if (!isRecord(entry) || typeof entry.path !== 'string' || !Array.isArray(entry.runners)) {
      throw new Error('test ownership requires a path and runner list');
    }
    if (entry.runners.length !== 1) throw new Error('test files require exactly one runner');
    if (
      entry.path.startsWith('test-harness/assurance/') &&
      !/\.(?:spec|impl)\.test\.ts$/u.test(entry.path)
    ) {
      throw new Error('internal tests require spec.test.ts or impl.test.ts naming');
    }
  }
  return [...ownership];
}

/** Reads a string array from an untrusted graph property. */
function readStringArray(graph: Record<string, unknown>, property: string): string[] {
  const value = graph[property];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new Error(`traceability ${property} must be a string array`);
  }
  return value;
}

/** Validates a compact directed graph used by focused specification cases. */
function validateDirectedTraceability(
  graph: Record<string, unknown>,
  knownClaimIds: ReadonlySet<string>,
): void {
  const requirements = readStringArray(graph, 'requirements');
  const cases = readStringArray(graph, 'cases');
  const tasks = readStringArray(graph, 'tasks');
  const claims = readStringArray(graph, 'claims');
  for (const [label, nodes] of Object.entries({ requirements, cases, tasks, claims })) {
    requireUnique(nodes, `traceability ${label}`);
  }
  for (const claimId of claims) {
    if (!knownClaimIds.has(claimId)) throw new Error(`unknown traceability claim: ${claimId}`);
  }

  const nodes = new Set([...requirements, ...cases, ...tasks, ...claims]);
  if (!Array.isArray(graph.edges)) throw new Error('traceability edges must be an array');
  for (const edge of graph.edges) {
    if (!isRecord(edge) || typeof edge.from !== 'string' || typeof edge.to !== 'string') {
      throw new Error('traceability edge requires string from/to nodes');
    }
    if (!nodes.has(edge.from)) throw new Error(`unknown traceability node: ${edge.from}`);
    if (!nodes.has(edge.to)) throw new Error(`unknown traceability node: ${edge.to}`);
  }
}

/** Validates requirement, case, task, and claim graph references. */
export function validateTraceability<T>(traceability: T, claims: readonly unknown[]): T {
  if (!isRecord(traceability)) throw new Error('traceability graph must be an object');
  const knownClaimIds = new Set(
    claims.flatMap((claim) => (isRecord(claim) && typeof claim.id === 'string' ? [claim.id] : [])),
  );

  if ('mappings' in traceability) {
    const parsed = traceabilitySchema.parse(traceability);
    requireUnique(parsed.requirements, 'traceability requirement');
    requireUnique(parsed.cases, 'traceability case');
    requireUnique(parsed.tasks, 'traceability task');
    requireUnique(parsed.claims, 'traceability claim');
    requireUnique(
      parsed.mappings.map((mapping) => mapping.requirement),
      'traceability mapping requirement',
    );
    requireUnique(
      parsed.mappings.map((mapping) => mapping.claim),
      'traceability mapping claim',
    );
    requireExactNodeList(
      parsed.requirements,
      parsed.mappings.map((mapping) => mapping.requirement),
      'requirement',
    );
    requireExactNodeList(
      parsed.cases,
      uniqueInOrder(parsed.mappings.flatMap((mapping) => mapping.cases)),
      'case',
    );
    requireExactNodeList(
      parsed.tasks,
      uniqueInOrder(parsed.mappings.flatMap((mapping) => mapping.tasks)),
      'task',
    );
    requireExactNodeList(
      parsed.claims,
      parsed.mappings.map((mapping) => mapping.claim),
      'claim',
    );
    return traceability;
  }

  validateDirectedTraceability(traceability, knownClaimIds);
  return traceability;
}

/** Validates and preserves one versioned exact RED-signature registry. */
export function validateRedSignatureRegistry<T>(registry: T): T {
  const parsed = redSignatureRegistrySchema.parse(registry);
  requireUnique(
    parsed.signatures.map((signature) => signature.id),
    'RED signature identifier',
  );
  return registry;
}

/** Requires one child failure to match its registered case, exit, and literal marker. */
export function matchRedSignature(
  registry: unknown,
  caseId: string,
  signatureId: string,
  exitCode: number,
  output: string,
): boolean {
  const parsed = redSignatureRegistrySchema.parse(registry);
  const signature = parsed.signatures.find((candidate) => candidate.id === signatureId);
  if (signature === undefined) throw new Error(`unregistered RED signature: ${signatureId}`);
  if (signature.caseId !== caseId) throw new Error(`RED signature case mismatch: ${caseId}`);
  if (signature.expectedExit !== exitCode)
    throw new Error(`RED signature exit mismatch: ${exitCode}`);
  if (!output.includes(signature.marker))
    throw new Error(`RED signature marker missing: ${signature.marker}`);
  return true;
}

/** Resolves one canonical allowlisted repository-relative reference. */
export function validateRepositoryReference(
  reference: string,
  options: RepositoryReferenceOptions,
): string {
  if (!isAbsolute(options.repositoryRoot)) throw new Error('repository root must be absolute');
  if (isAbsolute(reference)) throw new Error('repository reference must not be absolute');
  if (isAbsolute(options.allowedRoot)) throw new Error('allowed root must be repository-relative');
  if (/\p{Cc}/u.test(reference) || /\p{Cc}/u.test(options.allowedRoot)) {
    throw new Error('repository reference contains a control character');
  }
  if (reference.includes('\\') || options.allowedRoot.includes('\\')) {
    throw new Error('repository reference must use canonical forward slashes');
  }

  for (const candidate of [reference, options.allowedRoot]) {
    const segments = candidate.split('/');
    if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
      throw new Error('repository reference contains traversal or non-canonical segments');
    }
  }

  const repositoryRoot = realpathSync(options.repositoryRoot);
  const allowedRoot = realpathSync(resolve(repositoryRoot, options.allowedRoot));
  const target = realpathSync(resolve(repositoryRoot, reference));
  const allowedFromRepository = relative(repositoryRoot, allowedRoot);
  if (allowedFromRepository.startsWith('..') || isAbsolute(allowedFromRepository)) {
    throw new Error('allowed root resolves outside the repository');
  }
  const targetFromAllowed = relative(allowedRoot, target);
  if (targetFromAllowed.startsWith('..') || isAbsolute(targetFromAllowed)) {
    throw new Error('repository reference escapes the allowed root through a symlink');
  }

  const canonical = relative(repositoryRoot, target).split(sep).join('/');
  if (canonical !== reference) throw new Error('repository reference is not canonical');
  return canonical;
}
