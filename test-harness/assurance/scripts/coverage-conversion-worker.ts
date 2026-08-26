import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

import { z } from 'zod';

import {
  convertCapturedCoverage,
  writeCoverageObservationSummary,
  type CoverageCaptureManifest,
  type CoverageWorkspace,
} from '../coverage/index.js';

const captureManifestSchema = z
  .object({
    version: z.literal(1),
    runId: z.uuid(),
    lifecycleRunId: z.uuid(),
    seed: z.string().min(1),
    project: z.enum(['protocol', 'security']),
    profile: z.enum(['operational', 'production-security']),
    revision: z.string().regex(/^[0-9a-f]{40}$/u),
    imageDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
    dependencyLockDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
    sourceTreeDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
    fixtureDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
    compiledOutputDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
    nodeVersion: z.string().min(1),
    processIdentity: z.string().regex(/^container:[0-9a-f]{64}$/u),
    buildCommand: z.string().min(1),
    buildArguments: z.array(z.string().min(1)).min(1),
    runtimeDependencyInventory: z.object({
      revision: z.string().regex(/^[0-9a-f]{40}$/u),
      imageDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
      dependencies: z.array(
        z.object({
          name: z.string().min(1),
          version: z.string().min(1),
          rootPath: z.string().regex(/^\/app\/node_modules\//u),
          integrity: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
        }),
      ),
    }),
    flushStatus: z.enum(['complete', 'incomplete']),
    rawFiles: z.array(
      z.object({
        name: z.string().regex(/^coverage-[0-9]+-[0-9]+-[0-9]+\.json$/u),
        digest: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
        bytes: z.number().int().positive(),
      }),
    ),
  })
  .passthrough();

/** Resolves the one parent-created workspace accepted by this internal worker. */
function readRequest(arguments_: readonly string[]): {
  repositoryRoot: string;
  workspace: CoverageWorkspace;
  manifest: CoverageCaptureManifest;
} {
  if (arguments_.length !== 2 || arguments_[0] !== '--workspace') {
    throw new Error('invalid conversion worker request');
  }
  const repositoryRoot = realpathSync(process.cwd());
  const requested = arguments_[1];
  if (requested === undefined || !isAbsolute(requested)) {
    throw new Error('invalid conversion workspace');
  }
  const workspaceRoot = realpathSync(requested);
  const allowedRoot = resolve(repositoryRoot, 'test-harness/.assurance-results');
  const relation = relative(allowedRoot, workspaceRoot);
  if (relation === '' || relation.startsWith('..') || isAbsolute(relation)) {
    throw new Error('conversion workspace is outside the assurance results root');
  }
  const manifestPath = resolve(workspaceRoot, 'capture-manifest.json');
  const manifest: CoverageCaptureManifest = captureManifestSchema.parse(
    JSON.parse(readFileSync(manifestPath, 'utf8')),
  );
  const workspace: CoverageWorkspace = Object.freeze({
    repositoryRoot,
    runId: manifest.runId,
    root: workspaceRoot,
    rawDirectory: resolve(workspaceRoot, 'raw'),
    compiledDirectory: resolve(workspaceRoot, 'compiled'),
    manifestPath,
    reportDirectory: resolve(workspaceRoot, 'report'),
  });
  return { repositoryRoot, workspace, manifest };
}

/** Converts one capture and emits an observation only after complete acceptance. */
async function main(arguments_: readonly string[]): Promise<void> {
  const request = readRequest(arguments_);
  const conversion = await convertCapturedCoverage(
    request.repositoryRoot,
    request.workspace,
    request.manifest,
  );
  if (!conversion.accepted || conversion.artifact === undefined) {
    mkdirSync(request.workspace.reportDirectory, { recursive: true, mode: 0o700 });
    writeFileSync(
      resolve(request.workspace.reportDirectory, 'coverage-conversion-failure.json'),
      `${JSON.stringify({ version: 1, status: 'rejected', ...conversion }, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
    process.exitCode = 40;
    return;
  }
  writeCoverageObservationSummary(request.workspace, conversion.artifact);
}

await main(process.argv.slice(2)).catch(() => {
  process.exitCode = 40;
});
