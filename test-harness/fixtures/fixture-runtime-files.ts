import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { z } from 'zod';

import { protectedCredentialDescriptors, publicFixtureManifest } from './fixture-definition.js';
import type { SeededFixtureRuntime } from './seed-arrangement.js';

/** Stable semantic version of the generated fixture file contract. */
export const fixtureDefinitionVersion = 'porta-assurance-fixture-v1' as const;

/** Exact deterministic fixture counts independent from generated database identifiers. */
export const expectedFixtureCounts = Object.freeze({
  organizations: 3,
  ordinaryUsers: 10,
  administrativeActors: 3,
  validClients: 4,
  sessions: 2,
  tokens: 2,
  globalApplications: 2,
  globalRoles: 5,
});

/** Digest of the independent public fixture definition used as a reset oracle. */
export const expectedFixtureDigest = `sha256:${createHash('sha256')
  .update(JSON.stringify(publicFixtureManifest))
  .digest('hex')}`;

const publicRuntimeManifestSchema = z
  .object({
    runId: z.uuid(),
    definitionVersion: z.literal(fixtureDefinitionVersion),
    fixtureDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    fixtureCounts: z.record(z.string(), z.number().int().nonnegative()),
    entities: z.array(z.object({ alias: z.string().min(1), id: z.string().min(1) }).strict()),
    credentialDescriptors: z.array(
      z
        .object({
          ref: z.string().startsWith('credential:'),
          kind: z.enum(['password', 'client-secret', 'token', 'cookie', 'totp', 'recovery-code']),
          storage: z.literal('runtime-protected'),
          rawValueExposed: z.literal(false),
        })
        .strict(),
    ),
    publicManifest: z.unknown(),
  })
  .strict();

const protectedCredentialFileSchema = z
  .object({
    runId: z.uuid(),
    credentials: z.record(z.string().startsWith('credential:'), z.string().min(1)),
  })
  .strict();

/** Validated non-secret runtime manifest type. */
export type PublicRuntimeFixtureManifest = z.infer<typeof publicRuntimeManifestSchema>;

/** Validated owner-only credential file type. */
export type ProtectedRuntimeCredentialFile = z.infer<typeof protectedCredentialFileSchema>;

/** Exact generated fixture paths owned by one active harness runtime directory. */
export interface FixtureRuntimePaths {
  /** Redacted public fixture manifest. */
  readonly publicManifestPath: string;
  /** Owner-only raw credential store. */
  readonly credentialPath: string;
}

/** Resolves generated fixture files beside the validated endpoint manifest. */
export function fixtureRuntimePaths(endpointManifestPath: string): FixtureRuntimePaths {
  const runtimeDirectory = dirname(resolve(endpointManifestPath));
  return {
    publicManifestPath: resolve(runtimeDirectory, 'fixture-public.json'),
    credentialPath: resolve(runtimeDirectory, 'fixture-credentials.json'),
  };
}

/** Atomically replaces one generated JSON file with exact owner-only permissions. */
function writeOwnerOnlyJson(path: string, value: object): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const replacement = `${path}.${process.pid}.tmp`;
  rmSync(replacement, { force: true });
  writeFileSync(replacement, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  chmodSync(replacement, 0o600);
  renameSync(replacement, path);
  chmodSync(path, 0o600);
}

/** Writes validated redacted and protected fixture files for one active run. */
export function writeFixtureRuntimeFiles(
  runId: string,
  endpointManifestPath: string,
  runtime: SeededFixtureRuntime,
): FixtureRuntimePaths {
  const paths = fixtureRuntimePaths(endpointManifestPath);
  const publicFile = publicRuntimeManifestSchema.parse({
    runId,
    definitionVersion: fixtureDefinitionVersion,
    fixtureDigest: expectedFixtureDigest,
    fixtureCounts: expectedFixtureCounts,
    entities: runtime.entities,
    credentialDescriptors: protectedCredentialDescriptors,
    publicManifest: runtime.publicManifest,
  });
  const credentials = Object.fromEntries(runtime.credentials);
  const protectedFile = protectedCredentialFileSchema.parse({ runId, credentials });
  const expectedReferences = protectedCredentialDescriptors
    .map((descriptor) => descriptor.ref)
    .sort();
  if (JSON.stringify(Object.keys(credentials).sort()) !== JSON.stringify(expectedReferences)) {
    throw new Error('protected credential references do not match the public descriptor inventory');
  }
  writeOwnerOnlyJson(paths.publicManifestPath, publicFile);
  writeOwnerOnlyJson(paths.credentialPath, protectedFile);
  return paths;
}

/** Reads and validates the redacted public fixture manifest. */
export function readPublicRuntimeFixtureManifest(path: string): PublicRuntimeFixtureManifest {
  const parsed = publicRuntimeManifestSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  if (parsed.fixtureDigest !== expectedFixtureDigest) {
    throw new Error('generated fixture digest does not match the independent definition');
  }
  if (JSON.stringify(parsed.fixtureCounts) !== JSON.stringify(expectedFixtureCounts)) {
    throw new Error('generated fixture counts do not match the independent definition');
  }
  if (JSON.stringify(parsed.publicManifest) !== JSON.stringify(publicFixtureManifest)) {
    throw new Error('generated public fixture manifest does not match the independent definition');
  }
  return parsed;
}

/** Reads the protected store and returns one exact credential without logging it. */
export function readProtectedRuntimeCredential(path: string, reference: string): string {
  const file = protectedCredentialFileSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  const credential = file.credentials[reference];
  if (credential === undefined)
    throw new Error(`protected credential reference is absent: ${reference}`);
  return credential;
}
