import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { z } from 'zod';

import type { CoverageProvenance, RawCoverageEnvelope } from '../coverage/index.js';

const rawProcessSchema = z.object({
  result: z.array(
    z.object({
      scriptId: z.string(),
      url: z.string(),
      functions: z.array(
        z.object({
          functionName: z.string(),
          ranges: z.array(
            z.object({
              startOffset: z.number().int().nonnegative(),
              endOffset: z.number().int().positive(),
              count: z.number().int().nonnegative(),
            }),
          ),
          isBlockCoverage: z.boolean(),
        }),
      ),
    }),
  ),
});

/** Exact synthetic provenance used by the committed source-map spike. */
export const spikeProvenance: CoverageProvenance = Object.freeze({
  revision: '0123456789abcdef0123456789abcdef01234567',
  imageDigest: `sha256:${'a'.repeat(64)}`,
  sourceMapDigest: `sha256:${'b'.repeat(64)}`,
  processIdentity: 'pid:42001:start:1731280000000',
});

/** Captures the committed spike with real Node V8 output and rewrites only its virtual image URL. */
export function captureCoverageSpike(): RawCoverageEnvelope {
  const rawDirectory = mkdtempSync(resolve(tmpdir(), 'porta-coverage-spike-'));
  const compiledPath = resolve(
    import.meta.dirname,
    'fixtures/coverage-spike/compiled/coverage-spike.js',
  );
  try {
    const child = spawnSync(process.execPath, [compiledPath], {
      encoding: 'utf8',
      env: { ...process.env, NODE_V8_COVERAGE: rawDirectory },
      timeout: 10_000,
    });
    if (child.status !== 0 || child.signal !== null || child.error !== undefined) {
      throw new Error('coverage spike process did not complete cleanly');
    }
    const rawNames = readdirSync(rawDirectory).filter((name) => name.endsWith('.json'));
    if (rawNames.length !== 1 || rawNames[0] === undefined) {
      throw new Error('coverage spike did not emit exactly one raw process record');
    }
    const processCoverage = rawProcessSchema.parse(
      JSON.parse(readFileSync(resolve(rawDirectory, rawNames[0]), 'utf8')),
    );
    const emittedUrl = pathToFileURL(compiledPath).href;
    const target = processCoverage.result.find((script) => script.url === emittedUrl);
    if (target === undefined) throw new Error('coverage spike raw record is missing');
    const script = Object.freeze({
      scriptId: target.scriptId,
      url: 'file:///app/dist/coverage-spike.js',
      provenance: spikeProvenance,
      ranges: Object.freeze(target.functions.flatMap((entry) => entry.ranges)),
      functions: Object.freeze(target.functions),
    });
    const processRecord = Object.freeze({ scripts: Object.freeze([script]) });
    return Object.freeze({
      seed: 'porta-coverage-spike-seed-v1',
      flushStatus: 'complete',
      scripts: processRecord.scripts,
      processes: Object.freeze([processRecord]),
    });
  } finally {
    rmSync(rawDirectory, { recursive: true, force: true });
  }
}
