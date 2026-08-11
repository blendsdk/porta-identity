import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { posix, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { mergeProcessCovs } from '@bcoe/v8-coverage';
import { parse } from 'acorn';
import convert from 'ast-v8-to-istanbul';
import { z } from 'zod';

import type { Profiler } from 'node:inspector';
import { RuntimeCommandRunner } from '../../fixtures/lifecycle-runtime.js';
import { digestCoverageDirectory } from './capture.js';
import { loadAndClassifyCoverageCapture } from './classification.js';
import type { CoverageCaptureManifest, CoverageWorkspace } from './capture.js';
import type {
  CoverageClassificationResult,
  CoverageConversionResult,
  CoverageProvenance,
  ConvertedCoverageArtifact,
  ExactCoverageCounts,
  RawCoverageEnvelope,
  RawCoverageProcess,
  RawCoverageScript,
} from './model.js';

const sourceMapSchema = z.object({
  version: z.literal(3),
  file: z.string().optional(),
  sourceRoot: z.string().optional(),
  sources: z.array(z.string().min(1)).min(1),
  names: z.array(z.string()),
  mappings: z.string(),
  sourcesContent: z.array(z.string().nullable()).optional(),
});

const istanbulPositionSchema = z.object({
  line: z.number().int().positive(),
  column: z.number().int().nonnegative(),
});
const istanbulLocationSchema = z.object({
  start: istanbulPositionSchema,
  end: istanbulPositionSchema,
});
const istanbulFileCoverageSchema = z.object({
  statementMap: z.record(z.string(), istanbulLocationSchema),
  s: z.record(z.string(), z.number().int().nonnegative()),
  f: z.record(z.string(), z.number().int().nonnegative()),
  b: z.record(z.string(), z.array(z.number().int().nonnegative())),
});

/** Trusted filesystem and provenance inputs for one conversion. */
export interface CoverageConversionContext {
  /** Snapshot of `/app/dist` used by the covered image. */
  readonly compiledDirectory: string;
  /** Host package root corresponding to virtual `/app`. */
  readonly sourcePackageRoot: string;
  /** Root used to render stable source paths. */
  readonly normalizedPathRoot: string;
  /** Ignored directory that receives JSON and HTML reports. */
  readonly reportDirectory: string;
  /** Exact provenance required on every eligible raw script. */
  readonly expectedProvenance: CoverageProvenance;
  /** Virtual compiled root represented by V8 script URLs. */
  readonly virtualCompiledRoot: string;
}

/** Converts one freshly captured live Porta run after rechecking mutable local provenance. */
export async function convertCapturedCoverage(
  repositoryRoot: string,
  workspace: CoverageWorkspace,
  manifest: CoverageCaptureManifest,
  signal?: AbortSignal,
): Promise<CoverageConversionResult> {
  const runner = new RuntimeCommandRunner();
  const revision = (
    await runner.checked('git', ['rev-parse', 'HEAD^{commit}'], {
      cwd: repositoryRoot,
      environment: currentEnvironment(),
      signal,
    })
  ).stdout.trim();
  if (revision !== manifest.revision)
    throw new Error('coverage source revision changed after capture');
  if (digestCoverageDirectory(workspace.compiledDirectory) !== manifest.compiledOutputDigest) {
    throw new Error('coverage compiled snapshot changed after capture');
  }
  const loaded = loadAndClassifyCoverageCapture(workspace.manifestPath);
  return convertCoverageEnvelope(loaded.envelope, loaded.classification, {
    compiledDirectory: workspace.compiledDirectory,
    sourcePackageRoot: resolve(repositoryRoot, 'packages/server'),
    normalizedPathRoot: repositoryRoot,
    reportDirectory: workspace.reportDirectory,
    expectedProvenance: {
      revision: manifest.revision,
      imageDigest: manifest.imageDigest,
      sourceMapDigest: manifest.compiledOutputDigest,
      processIdentity: manifest.processIdentity,
    },
    virtualCompiledRoot: '/app/dist',
  });
}

interface IstanbulPosition {
  readonly line: number;
  readonly column: number;
}

interface IstanbulLocation {
  readonly start: IstanbulPosition;
  readonly end: IstanbulPosition;
}

interface IstanbulFileCoverage {
  readonly statementMap: Readonly<Record<string, IstanbulLocation>>;
  readonly s: Readonly<Record<string, number>>;
  readonly f: Readonly<Record<string, number>>;
  readonly b: Readonly<Record<string, readonly number[]>>;
}

/** Converts trusted V8 records through matching source maps and writes deterministic reports. */
export async function convertCoverageEnvelope(
  envelope: RawCoverageEnvelope,
  classification: CoverageClassificationResult,
  context: CoverageConversionContext,
): Promise<CoverageConversionResult> {
  const exclusions = classification.scripts
    .filter((script) => !script.eligible)
    .map((script) => Object.freeze({ url: script.url, reason: script.reason }));
  if (classification.rejected) {
    return rejectedConversion(exclusions, [], 'unmapped-eligible-input');
  }
  const provenanceFailure = compareProvenance(envelope, context.expectedProvenance);
  if (provenanceFailure !== undefined) {
    return rejectedConversion(exclusions, [], provenanceFailure);
  }

  const eligibleUrls = new Set(
    classification.scripts.filter((script) => script.eligible).map((script) => script.url),
  );
  const processRecords = processRecordsForEnvelope(envelope);
  const merged = mergeProcessCovs(processRecords.map(toProfilerProcess));
  const mergedByUrl = new Map(merged.result.map((script) => [script.url, script]));
  const files: Record<string, ExactCoverageCounts> = {};
  const coveredLines: Record<string, readonly number[]> = {};
  const uncoveredLines: Record<string, readonly number[]> = {};
  const unmapped: Array<Readonly<{ url: string; reason: string }>> = [];

  for (const url of [...eligibleUrls].sort((left, right) => left.localeCompare(right))) {
    const script = mergedByUrl.get(url);
    if (script === undefined) {
      unmapped.push({ url, reason: 'eligible script disappeared during process merge' });
      continue;
    }
    try {
      const mapped = await convertEligibleScript(script, context);
      for (const [sourcePath, coverage] of Object.entries(mapped)) {
        if (files[sourcePath] !== undefined) {
          unmapped.push({ url, reason: `duplicate mapped source path: ${sourcePath}` });
          continue;
        }
        const summary = summarizeFileCoverage(coverage);
        files[sourcePath] = summary.counts;
        coveredLines[sourcePath] = summary.coveredLines;
        uncoveredLines[sourcePath] = summary.uncoveredLines;
      }
    } catch (error) {
      unmapped.push({ url, reason: safeMappingReason(error) });
    }
  }
  if (unmapped.length > 0 || Object.keys(files).length === 0) {
    return rejectedConversion(exclusions, unmapped, 'unmapped-eligible-input');
  }

  const normalizedPaths = Object.keys(files).sort((left, right) => left.localeCompare(right));
  const artifact: ConvertedCoverageArtifact = Object.freeze({
    merger: '@bcoe/v8-coverage',
    normalizedPaths: Object.freeze(normalizedPaths),
    totals: aggregateCounts(Object.values(files)),
    files: Object.freeze(files),
    coveredLines: Object.freeze(coveredLines),
    uncoveredLines: Object.freeze(uncoveredLines),
    exclusions: Object.freeze(exclusions),
    unmapped: Object.freeze(unmapped),
    jsonProduced: true,
    htmlProduced: true,
  });
  writeCoverageReports(context.reportDirectory, artifact);
  return Object.freeze({
    accepted: true,
    artifact,
    exclusions: artifact.exclusions,
    unmapped: artifact.unmapped,
  });
}

/** Converts one merged eligible script with an exact validated source map. */
async function convertEligibleScript(
  coverage: Profiler.ScriptCoverage,
  context: CoverageConversionContext,
): Promise<Readonly<Record<string, IstanbulFileCoverage>>> {
  const relativeScript = eligibleRelativePath(coverage.url, context.virtualCompiledRoot);
  const compiledPath = resolve(context.compiledDirectory, relativeScript);
  const compiledCode = readFileSync(compiledPath, 'utf8');
  const sourceMapPath = `${compiledPath}.map`;
  const parsedMap = sourceMapSchema.parse(JSON.parse(readFileSync(sourceMapPath, 'utf8')));
  const sourcePaths = parsedMap.sources.map((source) =>
    resolveMappedSource(relativeScript, parsedMap.sourceRoot ?? '', source, context),
  );
  const sourceMap = {
    ...parsedMap,
    sources: sourcePaths.map((source) => pathToFileURL(source.hostPath).href),
    sourcesContent: sourcePaths.map((source) => readFileSync(source.hostPath, 'utf8')),
  };
  const converted = await convert({
    code: compiledCode,
    coverage,
    ast: parse(compiledCode, { ecmaVersion: 'latest', sourceType: 'module' }),
    sourceMap,
    wrapperLength: 0,
  });
  const normalized: Record<string, IstanbulFileCoverage> = {};
  for (const [mappedPath, fileCoverage] of Object.entries(converted)) {
    const matched = sourcePaths.find((source) => resolve(mappedPath) === resolve(source.hostPath));
    if (matched === undefined) throw new Error('source map produced an undeclared source path');
    normalized[matched.normalizedPath] = istanbulFileCoverageSchema.parse(fileCoverage);
  }
  return normalized;
}

/** Maps one source-map entry from virtual `/app/dist` to the exact host package source. */
function resolveMappedSource(
  relativeScript: string,
  sourceRoot: string,
  source: string,
  context: CoverageConversionContext,
): Readonly<{ hostPath: string; normalizedPath: string }> {
  if (source.includes('\\') || source.startsWith('/') || source.includes('%')) {
    throw new Error('source map contains an unsupported source path');
  }
  const virtualScript = posix.join(context.virtualCompiledRoot, relativeScript);
  const virtualSource = posix.normalize(
    posix.join(posix.dirname(virtualScript), sourceRoot, source),
  );
  const virtualPackageRoot = posix.dirname(context.virtualCompiledRoot);
  const packageRelative = posix.relative(virtualPackageRoot, virtualSource);
  if (
    packageRelative === '' ||
    packageRelative.startsWith('../') ||
    !packageRelative.startsWith('src/') ||
    !packageRelative.endsWith('.ts')
  ) {
    throw new Error('source map escapes the expected package source directory');
  }
  const hostPath = resolve(context.sourcePackageRoot, packageRelative);
  const normalizedPath = relative(context.normalizedPathRoot, hostPath).split('\\').join('/');
  if (normalizedPath === '' || normalizedPath.startsWith('../')) {
    throw new Error('mapped source path escapes the normalization root');
  }
  return Object.freeze({ hostPath, normalizedPath });
}

/** Produces stable statement, function, branch, and line counts for one source file. */
function summarizeFileCoverage(coverage: IstanbulFileCoverage): Readonly<{
  counts: ExactCoverageCounts;
  coveredLines: readonly number[];
  uncoveredLines: readonly number[];
}> {
  const statementCounts = Object.values(coverage.s);
  const functionCounts = Object.values(coverage.f);
  const branchCounts = Object.values(coverage.b).flat();
  const lineCounts = new Map<number, number>();
  for (const [identifier, location] of Object.entries(coverage.statementMap)) {
    lineCounts.set(
      location.start.line,
      Math.max(lineCounts.get(location.start.line) ?? 0, coverage.s[identifier] ?? 0),
    );
  }
  const coveredLines = [...lineCounts.entries()]
    .filter(([, count]) => count > 0)
    .map(([line]) => line)
    .sort((left, right) => left - right);
  const uncoveredLines = [...lineCounts.entries()]
    .filter(([, count]) => count === 0)
    .map(([line]) => line)
    .sort((left, right) => left - right);
  return Object.freeze({
    counts: Object.freeze({
      statements: countValues(statementCounts),
      branches: countValues(branchCounts),
      functions: countValues(functionCounts),
      lines: Object.freeze({ covered: coveredLines.length, total: lineCounts.size }),
    }),
    coveredLines: Object.freeze(coveredLines),
    uncoveredLines: Object.freeze(uncoveredLines),
  });
}

/** Converts retained process boundaries to mutation-safe records for the pinned merger. */
function toProfilerProcess(processCoverage: RawCoverageProcess): Readonly<{
  result: readonly Profiler.ScriptCoverage[];
}> {
  return {
    result: processCoverage.scripts.map(toProfilerScript),
  };
}

/** Converts one validated raw script to the Node profiler representation. */
function toProfilerScript(script: RawCoverageScript): Profiler.ScriptCoverage {
  if (script.functions === undefined || script.scriptId === undefined) {
    throw new Error(`eligible script lacks original V8 function records: ${script.url}`);
  }
  return {
    scriptId: script.scriptId,
    url: script.url,
    functions: script.functions.map((functionCoverage) => ({
      functionName: functionCoverage.functionName,
      isBlockCoverage: functionCoverage.isBlockCoverage,
      ranges: functionCoverage.ranges.map((range) => ({ ...range })),
    })),
  };
}

/** Preserves explicit process records or treats one synthetic envelope as one process. */
function processRecordsForEnvelope(envelope: RawCoverageEnvelope): readonly RawCoverageProcess[] {
  return envelope.processes ?? [Object.freeze({ scripts: envelope.scripts })];
}

/** Validates one eligible URL and returns its compiled-root-relative path. */
function eligibleRelativePath(url: string, virtualCompiledRoot: string): string {
  const path = url.startsWith('file:') ? fileURLToPath(url) : url;
  const relativePath = posix.relative(virtualCompiledRoot, path);
  if (
    relativePath === '' ||
    relativePath.startsWith('../') ||
    !relativePath.endsWith('.js') ||
    relativePath.includes('\\')
  ) {
    throw new Error('eligible script path escapes the compiled snapshot');
  }
  return relativePath;
}

/** Returns the first independent provenance mismatch in stable gate order. */
function compareProvenance(
  envelope: RawCoverageEnvelope,
  expected: CoverageProvenance,
): CoverageConversionResult['rejectionReason'] | undefined {
  for (const script of envelope.scripts) {
    if (script.provenance?.revision !== expected.revision) return 'revision-mismatch';
    if (script.provenance.sourceMapDigest !== expected.sourceMapDigest) {
      return 'source-map-mismatch';
    }
    if (script.provenance.imageDigest !== expected.imageDigest) return 'image-mismatch';
    if (script.provenance.processIdentity !== expected.processIdentity) return 'image-mismatch';
  }
  return undefined;
}

/** Counts positive values without reducing exact totals to percentages. */
function countValues(values: readonly number[]): Readonly<{ covered: number; total: number }> {
  return Object.freeze({
    covered: values.filter((count) => count > 0).length,
    total: values.length,
  });
}

/** Aggregates per-file counts without changing the reported metric definitions. */
function aggregateCounts(files: readonly ExactCoverageCounts[]): ExactCoverageCounts {
  const aggregate = (
    metric: keyof ExactCoverageCounts,
  ): Readonly<{ covered: number; total: number }> =>
    Object.freeze({
      covered: files.reduce((sum, file) => sum + file[metric].covered, 0),
      total: files.reduce((sum, file) => sum + file[metric].total, 0),
    });
  return Object.freeze({
    statements: aggregate('statements'),
    branches: aggregate('branches'),
    functions: aggregate('functions'),
    lines: aggregate('lines'),
  });
}

/** Writes deterministic, secret-free JSON and HTML summaries. */
function writeCoverageReports(directory: string, artifact: ConvertedCoverageArtifact): void {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(
    resolve(directory, 'coverage-summary.json'),
    `${JSON.stringify(artifact, null, 2)}\n`,
    {
      encoding: 'utf8',
      mode: 0o600,
    },
  );
  const rows = artifact.normalizedPaths
    .map((path) => {
      const counts = artifact.files[path];
      return `<tr><td>${escapeHtml(path)}</td><td>${counts?.statements.covered ?? 0}/${counts?.statements.total ?? 0}</td><td>${counts?.branches.covered ?? 0}/${counts?.branches.total ?? 0}</td><td>${counts?.functions.covered ?? 0}/${counts?.functions.total ?? 0}</td><td>${counts?.lines.covered ?? 0}/${counts?.lines.total ?? 0}</td></tr>`;
    })
    .join('');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Porta attributed coverage</title><body><h1>Porta attributed coverage</h1><table><thead><tr><th>Source</th><th>Statements</th><th>Branches</th><th>Functions</th><th>Lines</th></tr></thead><tbody>${rows}</tbody></table></body></html>\n`;
  writeFileSync(resolve(directory, 'index.html'), html, { encoding: 'utf8', mode: 0o600 });
}

/** Escapes the only dynamic HTML value used by the report. */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Keeps mapping diagnostics stable and free of absolute local paths. */
function safeMappingReason(error: unknown): string {
  if (error instanceof z.ZodError) return 'source map schema validation failed';
  if (error instanceof Error) {
    if (error.message.includes('source map')) return error.message;
    if (error.message.includes('eligible script')) return error.message;
  }
  return 'eligible script could not be source-mapped';
}

/** Constructs one rejected result while preserving exclusions and unmapped inputs. */
function rejectedConversion(
  exclusions: readonly Readonly<{ url: string; reason: string }>[],
  unmapped: readonly Readonly<{ url: string; reason: string }>[],
  rejectionReason: NonNullable<CoverageConversionResult['rejectionReason']>,
): CoverageConversionResult {
  return Object.freeze({
    accepted: false,
    exclusions: Object.freeze([...exclusions]),
    unmapped: Object.freeze([...unmapped]),
    rejectionReason,
  });
}

/** Copies the current environment while excluding undefined values. */
function currentEnvironment(): Readonly<Record<string, string>> {
  const environment: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined) environment[name] = value;
  }
  return environment;
}
