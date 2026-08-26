import { fileURLToPath } from 'node:url';
import { readFileSync, statSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';

import { z } from 'zod';

import { digestCoverageFile } from './capture.js';

import type {
  ClassifiedCoverageScript,
  CoverageClassificationContext,
  CoverageClassificationResult,
  CoverageCollectionFailure,
  DeferredCoverageProcess,
  DeferredCoverageScript,
  CoverageRuntimeDependencyInventory,
  CoverageScriptClassification,
  RawCoverageEnvelope,
  RawCoverageProcess,
  RawCoverageScript,
} from './model.js';

const rawRangeSchema = z.object({
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().positive(),
  count: z.number().int().nonnegative(),
});

const rawFunctionSchema = z.object({
  functionName: z.string(),
  ranges: z.array(rawRangeSchema).min(1),
  isBlockCoverage: z.boolean(),
});

const rawScriptSchema = z.object({
  scriptId: z.string().min(1),
  url: z.string(),
  functions: z.array(rawFunctionSchema).min(1),
});

const rawProcessSchema = z.object({ result: z.array(rawScriptSchema) });

const captureManifestSchema = z.object({
  version: z.literal(1),
  runId: z.uuid(),
  seed: z.string().min(1),
  revision: z.string().regex(/^[0-9a-f]{40}$/u),
  imageDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  compiledOutputDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  processIdentity: z.string().regex(/^container:[0-9a-f]{64}$/u),
  flushStatus: z.enum(['complete', 'incomplete']),
  rawFiles: z.array(
    z.object({
      name: z.string().regex(/^coverage-[0-9]+-[0-9]+-[0-9]+\.json$/u),
      digest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
      bytes: z.number().int().positive(),
    }),
  ),
});

/** Loaded capture envelope and its exhaustive classification result. */
export interface LoadedCoverageClassification {
  /** Provenance-bound normalized raw scripts. */
  readonly envelope: RawCoverageEnvelope;
  /** Exhaustive classification for the same scripts. */
  readonly classification: CoverageClassificationResult;
}

/** Loads only manifest-listed raw files, verifies their identity, and classifies every script. */
export function loadAndClassifyCoverageCapture(
  manifestPath: string,
  context: CoverageClassificationContext = {},
): LoadedCoverageClassification {
  const manifest = captureManifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')));
  const rawDirectory = resolve(dirname(manifestPath), 'raw');
  const provenance = Object.freeze({
    revision: manifest.revision,
    imageDigest: manifest.imageDigest,
    sourceMapDigest: manifest.compiledOutputDigest,
    processIdentity: manifest.processIdentity,
  });
  const processes = manifest.rawFiles.map((identity) => {
    const path = resolve(rawDirectory, identity.name);
    if (statSync(path).size !== identity.bytes || digestCoverageFile(path) !== identity.digest) {
      throw new Error(`raw coverage identity mismatch: ${identity.name}`);
    }
    const processCoverage = rawProcessSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
    const scripts = processCoverage.result.map((script) => ({
      scriptId: script.scriptId,
      url: script.url,
      provenance,
      ranges: script.functions.flatMap((functionCoverage) => functionCoverage.ranges),
      functions: script.functions,
    }));
    return Object.freeze({ scripts: Object.freeze(scripts) });
  });
  const scripts = processes.flatMap((processCoverage) => processCoverage.scripts);
  const envelope: RawCoverageEnvelope = Object.freeze({
    seed: manifest.seed,
    flushStatus: manifest.flushStatus,
    scripts: Object.freeze(scripts),
    processes: Object.freeze(processes),
  });
  return Object.freeze({ envelope, classification: classifyCoverageEnvelope(envelope, context) });
}

/** Classifies every raw script and rejects any unprovenanced or unexpected local input. */
export function classifyCoverageEnvelope(
  envelope: RawCoverageEnvelope,
  context: CoverageClassificationContext = {},
): CoverageClassificationResult {
  const scripts = envelope.scripts.map((script) => classifyScript(script, context));
  const exclusions = scripts
    .filter(
      (script) =>
        script.classification === 'node-internal' || script.classification === 'dependency',
    )
    .map((script) => Object.freeze({ url: script.url, reason: script.reason }));
  const deferredScripts = scripts
    .map((script) => deferredScript(script))
    .filter((script): script is DeferredCoverageScript => script !== undefined);
  const deferredProcesses = deferredProcessRecords(envelope.processes ?? []);
  const hasMissingProvenance = scripts.some((script) => script.provenance === undefined);
  const hasUnexpectedLocal = scripts.some((script) => script.classification === 'unexpected-local');
  const hasUnprovenDependency = deferredScripts.some(
    (script) => script.reason !== 'pathless-script',
  );
  const hasDeferredProcessFailure = deferredProcesses.some(
    (processRecord) => processRecord.reason !== 'empty-process-record',
  );
  const rejectionReason =
    envelope.flushStatus === 'complete'
      ? hasMissingProvenance
        ? 'missing-provenance'
        : hasUnexpectedLocal || hasUnprovenDependency || hasDeferredProcessFailure
          ? 'unexpected-local-script'
          : undefined
      : 'incomplete-flush';
  const collectionFailures = classificationFailures(
    envelope,
    scripts,
    deferredProcesses,
    rejectionReason,
  );
  return Object.freeze({
    scripts: Object.freeze(scripts),
    exclusions: Object.freeze(exclusions),
    unmapped: Object.freeze([]),
    deferredScripts: Object.freeze(deferredScripts),
    deferredProcesses: Object.freeze(deferredProcesses),
    collectionFailures: Object.freeze(collectionFailures),
    rejected: rejectionReason !== undefined,
    ...(rejectionReason === undefined ? {} : { rejectionReason }),
  });
}

/** Applies one stable path category without trusting URL normalization to hide traversal. */
function classifyScript(
  script: RawCoverageScript,
  context: CoverageClassificationContext,
): ClassifiedCoverageScript {
  const path = scriptPath(script.url);
  const classification = classifyPath(path, script, context.runtimeDependencyInventory);
  return Object.freeze({
    url: script.url,
    classification,
    eligible: classification === 'first-party',
    ...(script.provenance === undefined ? {} : { provenance: script.provenance }),
    reason: classificationReason(classification, path, context.runtimeDependencyInventory),
  });
}

/** Returns a canonical filesystem path, leaving pathless inputs explicitly unproven. */
function scriptPath(url: string): string | undefined {
  if (url === '' || url === '<anonymous>' || url.startsWith('node:')) return undefined;
  if (url.startsWith('file:')) {
    try {
      const path = fileURLToPath(url);
      if (containsTraversal(url)) return '/unexpected-traversal';
      return posix.normalize(path);
    } catch {
      return '/unexpected-malformed-url';
    }
  }
  if (url.startsWith('/')) {
    if (containsTraversal(url)) return '/unexpected-traversal';
    return posix.normalize(url);
  }
  return '/unexpected-unsupported-url';
}

/** Chooses one of the four closed script categories. */
function classifyPath(
  path: string | undefined,
  script: RawCoverageScript,
  inventory: CoverageRuntimeDependencyInventory | undefined,
): CoverageScriptClassification {
  if (script.url.startsWith('node:')) return 'node-internal';
  if (path === undefined) return 'deferred-unproven';
  if (path?.startsWith('/app/dist/') === true && path.endsWith('.js')) return 'first-party';
  if (path.startsWith('/app/node_modules/')) {
    return isProvenDependency(path, script, inventory) ? 'dependency' : 'deferred-unproven';
  }
  return 'unexpected-local';
}

/** Detects literal or percent-encoded parent path segments before normalization. */
function containsTraversal(value: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return true;
  }
  return decoded.split(/[\\/]/u).some((segment) => segment === '..');
}

/** Returns a stable, non-secret reason for each category. */
function classificationReason(
  classification: CoverageScriptClassification,
  path: string | undefined,
  inventory: CoverageRuntimeDependencyInventory | undefined,
): string {
  if (classification === 'first-party') return 'eligible compiled Porta JavaScript';
  if (classification === 'node-internal') return 'declared Node runtime script';
  if (classification === 'dependency') return 'proven installed runtime dependency script';
  if (classification === 'deferred-unproven') {
    if (path === undefined) return 'pathless script requires explicit attribution';
    return inventory === undefined
      ? 'runtime dependency inventory is unavailable'
      : 'runtime dependency inventory did not prove script ownership';
  }
  return 'unexpected local or unsupported script path';
}

/** Returns whether an exact image-bound package root proves one dependency script. */
function isProvenDependency(
  path: string,
  script: RawCoverageScript,
  inventory: CoverageRuntimeDependencyInventory | undefined,
): boolean {
  const provenance = script.provenance;
  if (
    inventory === undefined ||
    provenance === undefined ||
    inventory.revision !== provenance.revision ||
    inventory.imageDigest !== provenance.imageDigest
  ) {
    return false;
  }
  return inventory.dependencies.some((dependency) => {
    return (
      dependency.rootPath.startsWith('/app/node_modules/') &&
      dependency.rootPath.endsWith(`/${dependency.name}`) &&
      posix.normalize(dependency.rootPath) === dependency.rootPath &&
      dependency.version.length > 0 &&
      dependency.integrity.length > 0 &&
      path.startsWith(`${dependency.rootPath}/`)
    );
  });
}

/** Creates an explicit deferred-script record without reinterpreting it as a Node internal. */
function deferredScript(classified: ClassifiedCoverageScript): DeferredCoverageScript | undefined {
  if (classified.classification !== 'deferred-unproven') return undefined;
  const dependencyLooking = scriptPath(classified.url)?.startsWith('/app/node_modules/') === true;
  return Object.freeze({
    url: classified.url,
    reason: dependencyLooking
      ? classified.reason === 'runtime dependency inventory is unavailable'
        ? 'dependency-inventory-missing'
        : 'dependency-not-proven'
      : 'pathless-script',
  });
}

/** Records empty, unprovenanced, or mixed-provenance process records explicitly. */
function deferredProcessRecords(
  processes: readonly RawCoverageProcess[],
): readonly DeferredCoverageProcess[] {
  const deferred: DeferredCoverageProcess[] = [];
  for (const processCoverage of processes) {
    if (processCoverage.scripts.length === 0) {
      deferred.push(Object.freeze({ reason: 'empty-process-record' }));
      continue;
    }
    const identities = new Set(
      processCoverage.scripts
        .map((script) => script.provenance?.processIdentity)
        .filter((identity): identity is string => identity !== undefined),
    );
    if (identities.size === 0) {
      deferred.push(Object.freeze({ reason: 'missing-process-provenance' }));
      continue;
    }
    if (identities.size > 1 || processCoverage.scripts.some((script) => !script.provenance)) {
      deferred.push(Object.freeze({ reason: 'mixed-process-provenance' }));
    }
  }
  return deferred;
}

/** Preserves every pre-conversion failure in stable boundary order. */
function classificationFailures(
  envelope: RawCoverageEnvelope,
  scripts: readonly ClassifiedCoverageScript[],
  deferredProcesses: readonly DeferredCoverageProcess[],
  rejectionReason: CoverageClassificationResult['rejectionReason'],
): readonly CoverageCollectionFailure[] {
  const failures: CoverageCollectionFailure[] = [];
  if (envelope.flushStatus !== 'complete') {
    failures.push({ stage: 'flush', reason: 'incomplete-flush' });
  }
  for (const processRecord of deferredProcesses) {
    if (processRecord.reason !== 'empty-process-record') {
      failures.push({ stage: 'collection', reason: processRecord.reason });
    }
  }
  for (const script of scripts) {
    if (script.provenance === undefined) {
      failures.push({ stage: 'classification', reason: 'missing-provenance' });
    }
    if (
      script.classification === 'deferred-unproven' &&
      scriptPath(script.url)?.startsWith('/app/node_modules/') === true
    ) {
      failures.push({ stage: 'classification', reason: script.reason });
    } else if (script.classification === 'unexpected-local') {
      failures.push({ stage: 'classification', reason: 'unexpected-local-script' });
    }
  }
  if (failures.length === 0 && rejectionReason !== undefined) {
    failures.push({ stage: 'classification', reason: rejectionReason });
  }
  return failures.map((failure) => Object.freeze(failure));
}
