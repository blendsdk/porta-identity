import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import { commandContractVersion } from '../commands.js';
import {
  claimSchema,
  foundationManifestSchema,
  redSignatureRegistrySchema,
  resultSchema,
  testInventorySchema,
  traceabilityAuthoritySchema,
  traceabilitySchema,
} from '../schema.js';
import { digestRepositoryFile, inspectFoundationProvenance } from './source-provenance.js';

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
  /** Exact reviewed cases and their independent trust decisions. */
  cases: readonly { name: string; trusted: boolean }[];
  /** Sole runner that owns the file. */
  runner: string;
}

/** Validated authority retained only inside this module and keyed by an opaque caller token. */
const loadedValidationContexts = new WeakMap<object, InternalValidationContext>();

/** Canonically loaded evidence and inventory used for claim validation. */
export interface AssuranceValidationContext {
  /** Prevents callers from relying on or mutating the module-private authority snapshot. */
  readonly opaqueAssuranceContext?: never;
}

/** Immutable-by-construction authority never returned to the caller. */
interface InternalValidationContext {
  /** Reviewed test inventory loaded from its canonical repository path. */
  readonly knownTests: readonly KnownTest[];
  /** Validated owned-run manifest used as authoritative provenance. */
  readonly manifest: ReturnType<typeof foundationManifestSchema.parse>;
  /** Canonical repository root used to resolve sentinel paths. */
  readonly repositoryRoot: string;
}

/** Canonical repository-relative files used to construct an assurance validation context. */
export interface AssuranceValidationContextPaths {
  /** Reviewed test inventory beneath `test-harness/assurance`. */
  inventory: string;
  /** Owned run manifest beneath `test-harness/.assurance-results`. */
  manifest: string;
}

/** Returns whether an unknown value is a plain property record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads one JSON document while retaining its canonical path in parse failures. */
function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`invalid assurance JSON: ${path}`, { cause: error });
  }
}

/** Requires two ordered JSON-safe values to be structurally identical. */
function requireExactJson(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} does not match owned artifacts`);
  }
}

/** Recomputes all source and result evidence before a manifest can authorize a claim. */
function validateOwnedManifest(
  repositoryRoot: string,
  manifestPath: string,
  manifest: ReturnType<typeof foundationManifestSchema.parse>,
): void {
  const expectedManifestPath = `test-harness/.assurance-results/${manifest.runId}/manifest.json`;
  if (manifestPath !== expectedManifestPath || manifest.status !== 'passed') {
    throw new Error('owned-run manifest identity, path, or status is not authoritative');
  }

  const provenance = inspectFoundationProvenance(repositoryRoot);
  if (
    manifest.buildIdentity !== provenance.commitIdentity ||
    manifest.treeIdentity !== provenance.treeIdentity ||
    manifest.assuranceToolDigest !== provenance.assuranceToolDigest ||
    manifest.executionArtifact.digest !== provenance.assuranceToolDigest
  ) {
    throw new Error('owned-run manifest source provenance does not match the current tree');
  }
  if (
    manifest.dependencyLockDigest !== digestRepositoryFile(resolve(repositoryRoot, 'yarn.lock')) ||
    manifest.definitionDigests.traceability !==
      digestRepositoryFile(resolve(repositoryRoot, 'test-harness/assurance/traceability.json')) ||
    manifest.definitionDigests.redSignatures !==
      digestRepositoryFile(resolve(repositoryRoot, 'test-harness/assurance/red-signatures.json')) ||
    manifest.definitionDigests.testInventory !==
      digestRepositoryFile(resolve(repositoryRoot, 'test-harness/assurance/test-inventory.json')) ||
    manifest.toolVersions.node !== process.version ||
    manifest.toolVersions.commandContract !== commandContractVersion
  ) {
    throw new Error('owned-run manifest definitions or tool provenance do not match');
  }

  const results: ReturnType<typeof resultSchema.parse>[] = [];
  for (const artifact of manifest.artifacts) {
    const artifactPath = validateRepositoryReference(
      `test-harness/.assurance-results/${manifest.runId}/${artifact}`,
      { repositoryRoot, allowedRoot: `test-harness/.assurance-results/${manifest.runId}` },
    );
    const absoluteArtifactPath = resolve(repositoryRoot, artifactPath);
    if (!lstatSync(absoluteArtifactPath).isFile()) {
      throw new Error(`owned-run artifact is not a regular file: ${artifact}`);
    }
    const parsed = resultSchema.safeParse(readJson(absoluteArtifactPath));
    if (parsed.success) results.push(parsed.data);
  }
  if (results.length === 0) throw new Error('owned-run manifest has no validated result artifact');
  for (const result of results) {
    if (
      result.buildIdentity !== manifest.buildIdentity ||
      result.fixtureIdentity !== manifest.fixtureIdentity
    ) {
      throw new Error('owned result provenance does not match its manifest');
    }
  }
  requireExactJson(
    manifest.results,
    results.map(({ command, status }) => ({ command, status })),
    'manifest result summary',
  );
  requireExactJson(
    manifest.killedFaultIds,
    [...new Set(results.flatMap((result) => result.killedFaultIds ?? []))],
    'manifest fault-kill summary',
  );
}

/** Loads reviewed tests and an owned-run manifest through canonical repository boundaries. */
export function loadAssuranceValidationContext(
  repositoryRoot: string,
  paths: AssuranceValidationContextPaths,
): AssuranceValidationContext {
  const canonicalRoot = realpathSync(repositoryRoot);
  const inventoryPath = validateRepositoryReference(paths.inventory, {
    repositoryRoot: canonicalRoot,
    allowedRoot: 'test-harness/assurance',
  });
  if (inventoryPath !== 'test-harness/assurance/test-inventory.json') {
    throw new Error('assurance inventory must use its canonical repository path');
  }
  const manifestPath = validateRepositoryReference(paths.manifest, {
    repositoryRoot: canonicalRoot,
    allowedRoot: 'test-harness/.assurance-results',
  });
  const inventory = testInventorySchema.parse(readJson(resolve(canonicalRoot, inventoryPath)));
  requireUnique(
    inventory.tests.map((entry) => entry.path),
    'test inventory path',
  );
  for (const entry of inventory.tests) {
    validateRepositoryReference(entry.path, {
      repositoryRoot: canonicalRoot,
      allowedRoot: 'test-harness/assurance',
    });
    requireUnique(
      entry.cases.map((caseRecord) => caseRecord.name),
      `test inventory case for ${entry.path}`,
    );
  }
  const manifest = foundationManifestSchema.parse(readJson(resolve(canonicalRoot, manifestPath)));
  validateOwnedManifest(canonicalRoot, manifestPath, manifest);
  const authority: InternalValidationContext = {
    knownTests: inventory.tests,
    manifest,
    repositoryRoot: canonicalRoot,
  };
  const token = Object.freeze({}) as AssuranceValidationContext;
  loadedValidationContexts.set(token, authority);
  return token;
}

/** Requires the branded result of the canonical inventory/manifest loader. */
function requireValidationContext(context: unknown): InternalValidationContext {
  if (!isRecord(context)) {
    throw new Error('authoritative assurance validation context is required');
  }
  const authority = loadedValidationContexts.get(context);
  if (authority === undefined) {
    throw new Error('authoritative assurance validation context is required');
  }
  return authority;
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
  const parsedClaims = claims.map((claim) => {
    try {
      return claimSchema.parse(claim);
    } catch (error) {
      if (isRecord(claim) && claim.status === 'assured') {
        throw new Error('cannot validate an invalid assured claim', { cause: error });
      }
      throw error;
    }
  });
  requireUnique(
    parsedClaims.map((claim) => claim.id),
    'claim identifier',
  );

  const authoritativeContext = requireValidationContext(context);
  for (const claim of parsedClaims) {
    for (const sentinel of claim.sentinels) {
      const canonicalTest = validateRepositoryReference(sentinel.test, {
        repositoryRoot: authoritativeContext.repositoryRoot,
        allowedRoot: 'test-harness/assurance',
      });
      const knownTest = authoritativeContext.knownTests.find(
        (candidate) => candidate.path === canonicalTest,
      );
      if (knownTest === undefined) {
        throw new Error(`unknown sentinel test: ${sentinel.test}`);
      }
      const knownCase = knownTest.cases.find((caseRecord) => caseRecord.name === sentinel.case);
      if (knownCase === undefined) {
        throw new Error(`unknown sentinel case: ${sentinel.case}`);
      }
      if (knownTest.runner !== sentinel.runner) {
        throw new Error(`runner mismatch for sentinel: ${sentinel.test}`);
      }
      if (sentinel.trusted !== true || knownCase.trusted !== true) {
        throw new Error(`sentinel is not reviewed and trusted: ${sentinel.case}`);
      }
    }
    validateClaimState(claim, authoritativeContext);
  }

  return [...claims];
}

/** Requires the evidence needed before a claim may enter the assured state. */
function requireAssuredEvidence(
  claim: Record<string, unknown>,
  context: InternalValidationContext,
): void {
  if (!Array.isArray(claim.gaps) || claim.gaps.length > 0) {
    throw new Error('cannot enter assured state while named gaps exist');
  }
  if (!isRecord(claim.evidence) || claim.evidence.current !== true) {
    throw new Error('cannot enter assured state with stale or missing evidence');
  }
  if (claim.evidence.buildIdentity !== context.manifest.buildIdentity) {
    throw new Error('cannot enter assured state with mismatched build provenance');
  }
  if (claim.evidence.fixtureIdentity !== context.manifest.fixtureIdentity) {
    throw new Error('cannot enter assured state with mismatched fixture provenance');
  }
  const results = claim.evidence.results;
  if (
    !Array.isArray(results) ||
    results.length === 0 ||
    results.some(
      (result) =>
        !isRecord(result) ||
        result.status !== 'passed' ||
        typeof result.command !== 'string' ||
        !context.manifest.results.some(
          (authoritativeResult) =>
            authoritativeResult.command === result.command &&
            authoritativeResult.status === result.status,
        ),
    )
  ) {
    throw new Error('cannot enter assured state without green verification results');
  }
  const commands = claim.evidence.commands;
  if (
    !Array.isArray(commands) ||
    commands.length === 0 ||
    !commands.every(
      (command) =>
        typeof command === 'string' &&
        context.manifest.results.some(
          (result) => result.command === command && result.status === 'passed',
        ),
    )
  ) {
    throw new Error('cannot enter assured state without authoritative command provenance');
  }
  const faultIds = claim.evidence.faultIds;
  const killedFaultIds = claim.evidence.killedFaultIds;
  if (
    !Array.isArray(faultIds) ||
    faultIds.length === 0 ||
    !Array.isArray(killedFaultIds) ||
    killedFaultIds.length === 0 ||
    !faultIds.every(
      (faultId) =>
        killedFaultIds.includes(faultId) && context.manifest.killedFaultIds.includes(faultId),
    )
  ) {
    throw new Error('cannot enter assured state without killed fault evidence');
  }
}

/** Applies status-dependent invariants to loaded and transitioned claim records alike. */
function validateClaimState(
  claim: ReturnType<typeof claimSchema.parse>,
  context: InternalValidationContext,
): void {
  if (claim.status === 'assured') requireAssuredEvidence(claim, context);
}

/** Applies one validated claim-state transition. */
export function transitionClaim<T extends object>(
  claim: T,
  nextStatus: string,
  context: unknown,
): T & { status: string } {
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
export function validateDirectedTraceability<T>(graph: T, knownClaims: readonly unknown[]): T {
  if (!isRecord(graph)) throw new Error('traceability graph must be an object');
  const knownClaimIds = new Set(
    knownClaims.flatMap((claim) =>
      isRecord(claim) && typeof claim.id === 'string' ? [claim.id] : [],
    ),
  );
  const requirements = readStringArray(graph, 'requirements');
  const cases = readStringArray(graph, 'cases');
  const tasks = readStringArray(graph, 'tasks');
  const claimNodes = readStringArray(graph, 'claims');
  for (const [label, nodes] of Object.entries({ requirements, cases, tasks, claims: claimNodes })) {
    requireUnique(nodes, `traceability ${label}`);
  }
  for (const claimId of claimNodes) {
    if (!knownClaimIds.has(claimId)) throw new Error(`unknown traceability claim: ${claimId}`);
  }

  const nodes = new Set([...requirements, ...cases, ...tasks, ...claimNodes]);
  if (!Array.isArray(graph.edges)) throw new Error('traceability edges must be an array');
  for (const edge of graph.edges) {
    if (!isRecord(edge) || typeof edge.from !== 'string' || typeof edge.to !== 'string') {
      throw new Error('traceability edge requires string from/to nodes');
    }
    if (!nodes.has(edge.from)) throw new Error(`unknown traceability node: ${edge.from}`);
    if (!nodes.has(edge.to)) throw new Error(`unknown traceability node: ${edge.to}`);
  }
  return graph;
}

/** Reads exact Must identifiers from the authoritative requirement section of every RD. */
function readMustRequirements(repositoryRoot: string): string[] {
  const requirements: string[] = [];
  for (let document = 1; document <= 7; document += 1) {
    const matches = readFileSync(
      resolve(
        repositoryRoot,
        `codeops/features/test-assurance/requirements/RD-0${document}-${
          [
            'assurance-governance-and-traceability',
            'harness-foundation-and-fixtures',
            'coverage-attribution-and-ratchets',
            'functional-contracts-and-compatibility',
            'security-risk-slice-assurance',
            'fault-sensitivity-and-mutation',
            'continuous-assurance-and-non-functional-requirements',
          ][document - 1]
        }.md`,
      ),
      'utf8',
    )
      .split('### Must Have')[1]
      ?.split('### Should Have')[0]
      ?.matchAll(/\*\*(R[1-7]\.[0-9]+) \([LMS]\)\*\*/gu);
    if (matches === undefined) throw new Error(`missing Must section in RD-0${document}`);
    requirements.push(...[...matches].map((match) => match[1]!));
  }
  return requirements;
}

/** Derives the only valid source-clause label for one requirement identifier. */
function sourceClauseForRequirement(requirement: string): string {
  const document = requirement.match(/^R([1-7])\.[0-9]+$/u)?.[1];
  if (document === undefined) throw new Error(`invalid requirement identifier: ${requirement}`);
  return `RD-0${document}#${requirement}`;
}

/** Loads independent traceability nodes and proves their Must inventory against the RDs. */
export function loadTraceabilityAuthority(
  repositoryRoot: string,
): ReturnType<typeof traceabilityAuthoritySchema.parse> {
  const canonicalRoot = realpathSync(repositoryRoot);
  const authority = traceabilityAuthoritySchema.parse(
    readJson(resolve(canonicalRoot, 'test-harness/assurance/traceability-nodes.json')),
  );
  requireUnique(
    authority.requirements.map((entry) => entry.id),
    'authoritative requirement',
  );
  requireUnique(authority.cases, 'authoritative case');
  requireUnique(authority.tasks, 'authoritative task');
  requireUnique(authority.claims, 'authoritative claim');
  requireExactNodeList(
    authority.requirements.map((entry) => entry.id),
    readMustRequirements(canonicalRoot),
    'authoritative Must requirement',
  );
  for (const requirement of authority.requirements) {
    if (requirement.sourceClause !== sourceClauseForRequirement(requirement.id)) {
      throw new Error(`authoritative source clause mismatch: ${requirement.id}`);
    }
  }
  return authority;
}

/** Validates exact mappings against an independent node and source-clause inventory. */
export function validateTraceability<T>(traceability: T, authorityInput: unknown): T {
  const parsed = traceabilitySchema.parse(traceability);
  const authority = traceabilityAuthoritySchema.parse(authorityInput);
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
  requireExactNodeList(
    parsed.requirements,
    authority.requirements.map((entry) => entry.id),
    'authority requirement',
  );
  requireExactNodeList(parsed.cases, authority.cases, 'authority case');
  requireExactNodeList(parsed.tasks, authority.tasks, 'authority task');
  requireExactNodeList(parsed.claims, authority.claims, 'authority claim');
  for (const mapping of parsed.mappings) {
    const authoritativeRequirement = authority.requirements.find(
      (entry) => entry.id === mapping.requirement,
    );
    if (authoritativeRequirement?.sourceClause !== mapping.sourceClause) {
      throw new Error(`traceability source clause mismatch: ${mapping.requirement}`);
    }
  }
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
  if (signature.observedChildExit !== exitCode)
    throw new Error(`RED signature child exit mismatch: ${exitCode}`);
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
