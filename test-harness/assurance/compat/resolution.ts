import { copyFileSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

import { runManagedChild } from '../scripts/managed-child.js';
import { digestRegularTree, requireCanonicalChild } from './filesystem.js';
import { PackedCompatibilityExecutionError, type PreparedPackedConsumer } from './model.js';

/** Exact resolution evidence for the SDK package loaded from inside the packed CLI. */
export interface PackedCliSdkResolution {
  /** Canonical installed SDK package root. */
  readonly resolvedPath: string;
  /** Digest of the installed SDK package content. */
  readonly resolvedContentSha256: string;
  /** Digest independently derived from the local SDK archive. */
  readonly packedContentSha256: string;
}

/** Walks from one resolved export to the nearest matching package manifest. */
function findPackageRoot(
  consumerRoot: string,
  resolvedExportPath: string,
  expectedName: string,
): string {
  let candidate = dirname(resolvedExportPath);
  while (candidate !== consumerRoot) {
    const manifestPath = resolve(candidate, 'package.json');
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: string };
      if (manifest.name === expectedName) return requireCanonicalChild(consumerRoot, candidate);
    } catch {
      // Export files may be nested several directories beneath their package manifest.
    }
    const parent = dirname(candidate);
    if (parent === candidate) break;
    candidate = parent;
  }
  throw new Error('resolved SDK export has no matching package root');
}

/**
 * Proves the SDK resolved from inside the packed CLI is the explicitly installed local archive.
 *
 * Resolution begins from the CLI package manifest, rejects symlinks through canonical-child
 * checks, and compares the complete installed SDK tree with the archive-derived content digest.
 */
export async function verifyPackedCliSdkResolution(
  consumer: PreparedPackedConsumer,
): Promise<PackedCliSdkResolution> {
  const cliRoot = requireCanonicalChild(
    consumer.consumerPath,
    resolve(consumer.consumerPath, 'node_modules/@portaidentity/cli'),
  );
  const probePath = resolve(cliRoot, '.porta-assurance-sdk-resolution.mjs');
  copyFileSync(
    resolve(process.cwd(), 'test-harness/consumers/sdk-resolution-probe.mjs'),
    probePath,
  );
  const probe = await runManagedChild(process.execPath, [probePath], {
    cwd: cliRoot,
    env: process.env,
    stdio: 'pipe',
    maxOutputBytes: 8 * 1024,
    timeoutMilliseconds: 30_000,
    terminationGraceMilliseconds: 2_000,
    cleanup: () => rmSync(probePath, { force: true }),
  });
  if (
    probe.code !== 0 ||
    probe.signal !== null ||
    probe.forwardedSignal !== null ||
    probe.timedOut ||
    probe.setupFailed ||
    probe.cleanupFailed ||
    probe.outputTruncated
  ) {
    const exitCode = probe.cleanupFailed
      ? 60
      : probe.forwardedSignal === 'SIGINT'
        ? 130
        : probe.forwardedSignal === 'SIGTERM'
          ? 143
          : probe.timedOut
            ? 70
            : 30;
    throw new PackedCompatibilityExecutionError(exitCode);
  }
  const resolutionUrl = probe.stdout.trim();
  if (!resolutionUrl.startsWith('file:') || resolutionUrl.includes('\n')) {
    throw new Error('packed CLI SDK resolution probe returned an invalid URL');
  }
  const resolvedExportPath = fileURLToPath(resolutionUrl);
  const sdkRoot = findPackageRoot(
    consumer.consumerPath,
    requireCanonicalChild(consumer.consumerPath, resolvedExportPath),
    '@portaidentity/sdk',
  );
  const installedDigest = digestRegularTree(sdkRoot);
  const archive = consumer.archives.find((candidate) => candidate.name === '@portaidentity/sdk');
  if (archive === undefined) throw new Error('packed SDK archive identity is missing');
  if (installedDigest !== archive.contentSha256) {
    throw new Error('CLI-resolved SDK content does not match the local archive');
  }
  const expectedRoot = requireCanonicalChild(
    consumer.consumerPath,
    resolve(consumer.consumerPath, 'node_modules/@portaidentity/sdk'),
  );
  if (sdkRoot !== expectedRoot)
    throw new Error('CLI resolved SDK outside the explicit consumer dependency');
  return Object.freeze({
    resolvedPath: sdkRoot,
    resolvedContentSha256: installedDigest,
    packedContentSha256: archive.contentSha256,
  });
}
