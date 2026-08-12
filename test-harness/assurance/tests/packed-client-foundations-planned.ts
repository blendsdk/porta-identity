import {
  cleanupPackedConsumer,
  loadPackedSurfaces,
  preparePackedConsumer,
  type PreparedPackedConsumer,
} from '../compat/index.js';

/** Stable identity for one locally produced package archive. */
export interface PackedArchiveIdentity {
  /** Published package name read from the archive. */
  readonly name: '@portaidentity/sdk' | '@portaidentity/cli';
  /** Package version read from the archive. */
  readonly version: string;
  /** SHA-256 digest of the exact archive bytes. */
  readonly sha256: string;
  /** Canonical absolute path to the local archive. */
  readonly archivePath: string;
}

/** Provenance shared by the current server and locally packed clients. */
export interface CurrentTripletIdentity {
  /** Node.js version used for the compatibility run. */
  readonly nodeVersion: string;
  /** Immutable server image identity. */
  readonly serverImageDigest: string;
  /** Source revision used to build both archives and the server image. */
  readonly sourceRevision: string;
  /** Deterministic fixture identity used by the server. */
  readonly fixtureIdentity: string;
}

/** Prepared consumer isolated from every repository workspace and dependency cache. */
export interface PreparedPackedConsumerContract {
  /** UUID that owns the generated consumer lifecycle. */
  readonly runId: string;
  /** Canonical temporary consumer path. */
  readonly consumerPath: string;
  /** Whether the consumer lies outside every configured workspace. */
  readonly outsideEveryWorkspace: boolean;
  /** Whether the directory is ignored and disposable. */
  readonly ignored: true;
  /** Whether installation began without dependencies or a shared package-manager cache. */
  readonly cleanInstall: true;
  /** Exact local file dependencies declared by the consumer manifest. */
  readonly dependencies: Readonly<Record<'@portaidentity/sdk' | '@portaidentity/cli', string>>;
  /** Locally produced package archives. */
  readonly archives: readonly PackedArchiveIdentity[];
  /** Current server/client provenance. */
  readonly triplet: CurrentTripletIdentity;
}

/** Result of loading the declared packed-client surfaces. */
export interface PackedSurfaceResult {
  /** SDK export entry points successfully loaded by the consumer. */
  readonly loadedSdkExports: readonly string[];
  /** Canonical compiled CLI executable path. */
  readonly cliBinPath: string;
  /** Whether all loaded files came from package `dist` output. */
  readonly distOnly: boolean;
}

/** Resolution proof for the SDK instance loaded by the packed CLI. */
export interface CliSdkResolutionResult {
  /** Whether the resolution is accepted for a live journey. */
  readonly accepted: boolean;
  /** Canonical SDK path resolved from inside the CLI package. */
  readonly resolvedPath: string;
  /** Digest of the resolved SDK package content. */
  readonly resolvedContentSha256: string;
  /** Digest derived from the locally packed SDK archive. */
  readonly packedContentSha256: string;
  /** Stable rejected source class, when resolution is not accepted. */
  readonly rejectionReason?:
    'registry' | 'workspace' | 'source' | 'alias' | 'symlink' | 'digest-mismatch';
  /** Live journeys remain blocked until resolution is proven. */
  readonly liveJourneyAllowed: boolean;
}

/** Supported subprocess outcomes that must preserve credential isolation. */
export type PackedCliOutcome = 'success' | 'failure' | 'timeout' | 'sigint' | 'sigterm';

/** Credential-isolation evidence for one packed CLI subprocess. */
export interface PackedCliIsolationResult {
  /** Requested terminal outcome. */
  readonly outcome: PackedCliOutcome;
  /** Newly created HOME supplied only to this subprocess. */
  readonly temporaryHomePath: string;
  /** Restrictive POSIX mode of the temporary HOME before execution. */
  readonly temporaryHomeMode: number;
  /** Whether temporary HOME and credentials were removed afterward. */
  readonly temporaryResourcesRemoved: boolean;
  /** Pre-execution fingerprint of the caller's real credential path. */
  readonly callerCredentialFingerprintBefore: string;
  /** Post-execution fingerprint of the caller's real credential path. */
  readonly callerCredentialFingerprintAfter: string;
}

/** Immutable contract consumed by packed-client foundation specifications. */
export interface PackedClientFoundationsContract {
  /** Builds, packs, and installs the current SDK and CLI into a clean external consumer. */
  prepareCurrentConsumer(): Promise<PreparedPackedConsumerContract>;
  /** Loads every declared SDK export and the compiled CLI executable. */
  loadDeclaredSurfaces(consumer: PreparedPackedConsumerContract): Promise<PackedSurfaceResult>;
  /** Proves or rejects the SDK resolution used by the packed CLI. */
  verifyCliSdkResolution(
    consumer: PreparedPackedConsumerContract,
    source: 'local-archive' | 'registry' | 'workspace' | 'source' | 'alias' | 'symlink',
  ): Promise<CliSdkResolutionResult>;
  /** Executes one packed CLI subprocess with a fresh isolated HOME. */
  runCliWithIsolatedHome(outcome: PackedCliOutcome): Promise<PackedCliIsolationResult>;
}

let preparedConsumer: Promise<PreparedPackedConsumer> | undefined;
let cleanupRegistered = false;

/** Returns one shared real packed consumer for the immutable foundation specifications. */
async function prepared(): Promise<PreparedPackedConsumer> {
  preparedConsumer ??= preparePackedConsumer(process.cwd(), {
    serverImageDigest: `sha256:${'a'.repeat(64)}`,
    fixtureIdentity: 'fixture:test-assurance-packed-foundation',
  });
  const consumer = await preparedConsumer;
  if (!cleanupRegistered) {
    cleanupRegistered = true;
    process.once('exit', () => cleanupPackedConsumer(consumer));
  }
  return consumer;
}

/** Creates the real pack/install adapter while later isolation capabilities remain fail closed. */
export function createPackedClientFoundationsContract(): PackedClientFoundationsContract {
  return Object.freeze({
    prepareCurrentConsumer: prepared,
    loadDeclaredSurfaces: loadPackedSurfaces,
    async verifyCliSdkResolution(): Promise<CliSdkResolutionResult> {
      throw new Error('packed CLI SDK resolution proof is not installed');
    },
    async runCliWithIsolatedHome(_outcome: PackedCliOutcome): Promise<PackedCliIsolationResult> {
      throw new Error('packed CLI HOME isolation is not installed');
    },
  });
}
