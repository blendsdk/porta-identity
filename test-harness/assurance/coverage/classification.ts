import { fileURLToPath } from 'node:url';
import { readFileSync, statSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';

import { z } from 'zod';

import { digestCoverageFile } from './capture.js';

import type {
  ClassifiedCoverageScript,
  CoverageClassificationResult,
  CoverageScriptClassification,
  RawCoverageEnvelope,
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
export function loadAndClassifyCoverageCapture(manifestPath: string): LoadedCoverageClassification {
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
  return Object.freeze({ envelope, classification: classifyCoverageEnvelope(envelope) });
}

/** Classifies every raw script and rejects any unprovenanced or unexpected local input. */
export function classifyCoverageEnvelope(
  envelope: RawCoverageEnvelope,
): CoverageClassificationResult {
  const scripts = envelope.scripts.map(classifyScript);
  const hasMissingProvenance = scripts.some((script) => script.provenance === undefined);
  const hasUnexpectedLocal = scripts.some((script) => script.classification === 'unexpected-local');
  const rejectionReason =
    envelope.flushStatus === 'complete'
      ? hasMissingProvenance
        ? 'missing-provenance'
        : hasUnexpectedLocal
          ? 'unexpected-local-script'
          : undefined
      : 'incomplete-flush';
  return Object.freeze({
    scripts: Object.freeze(scripts),
    rejected: rejectionReason !== undefined,
    ...(rejectionReason === undefined ? {} : { rejectionReason }),
  });
}

/** Applies one stable path category without trusting URL normalization to hide traversal. */
function classifyScript(script: RawCoverageScript): ClassifiedCoverageScript {
  const path = scriptPath(script.url);
  const classification = classifyPath(path, script.url);
  return Object.freeze({
    url: script.url,
    classification,
    eligible: classification === 'first-party',
    ...(script.provenance === undefined ? {} : { provenance: script.provenance }),
    reason: classificationReason(classification),
  });
}

/** Returns a canonical script path or no path for declared runtime identifiers. */
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
function classifyPath(path: string | undefined, originalUrl: string): CoverageScriptClassification {
  if (path === undefined && (originalUrl === '' || originalUrl === '<anonymous>')) {
    return 'node-internal';
  }
  if (originalUrl.startsWith('node:')) return 'node-internal';
  if (path?.startsWith('/app/dist/') === true && path.endsWith('.js')) return 'first-party';
  if (path?.startsWith('/app/node_modules/') === true) return 'dependency';
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
function classificationReason(classification: CoverageScriptClassification): string {
  if (classification === 'first-party') return 'eligible compiled Porta JavaScript';
  if (classification === 'node-internal') return 'declared Node runtime script';
  if (classification === 'dependency') return 'declared installed dependency script';
  return 'unexpected local or unsupported script path';
}
