/** Stable identity for one locally packed Porta archive. */
export interface PackedArchiveIdentity {
  /** Published package name read from extracted package metadata. */
  readonly name: '@portaidentity/sdk' | '@portaidentity/cli';
  /** Exact package version read from extracted package metadata. */
  readonly version: string;
  /** SHA-256 of the deterministic archive bytes. */
  readonly sha256: string;
  /** SHA-256 of the normalized archive package content. */
  readonly contentSha256: string;
  /** Canonical absolute archive path used by the generated consumer manifest. */
  readonly archivePath: string;
}

/** Provenance shared by current locally packed clients and the selected server. */
export interface CurrentTripletIdentity {
  /** Node runtime used for packaging and compatibility execution. */
  readonly nodeVersion: string;
  /** Immutable selected server image digest. */
  readonly serverImageDigest: string;
  /** Clean source revision used to build both clients. */
  readonly sourceRevision: string;
  /** Deterministic public fixture identity used by the selected server. */
  readonly fixtureIdentity: string;
}

/** Prepared clean consumer outside every root workspace. */
export interface PreparedPackedConsumer {
  /** UUID that owns all generated consumer resources. */
  readonly runId: string;
  /** Canonical ignored consumer directory. */
  readonly consumerPath: string;
  /** Whether the consumer lies outside all configured workspaces. */
  readonly outsideEveryWorkspace: boolean;
  /** Whether Git ignores the complete generated consumer. */
  readonly ignored: true;
  /** Whether install began from absent modules, lock, and cache state. */
  readonly cleanInstall: true;
  /** Exact local file dependencies declared in the generated manifest. */
  readonly dependencies: Readonly<Record<'@portaidentity/sdk' | '@portaidentity/cli', string>>;
  /** Deterministic local archive identities. */
  readonly archives: readonly PackedArchiveIdentity[];
  /** Current triplet provenance supplied by the owning assurance run. */
  readonly triplet: CurrentTripletIdentity;
}

/** Result of loading only declared packed public surfaces. */
export interface PackedSurfaceResult {
  /** SDK export entry points successfully loaded through package resolution. */
  readonly loadedSdkExports: readonly string[];
  /** Canonical compiled CLI executable path. */
  readonly cliBinPath: string;
  /** Whether every observed public entry is package `dist` output. */
  readonly distOnly: boolean;
}

/** Caller-supplied server identities that complete current-triplet provenance. */
export interface PackedConsumerProvenance {
  /** Exact server image digest selected for later live journeys. */
  readonly serverImageDigest: string;
  /** Exact public fixture digest selected for later live journeys. */
  readonly fixtureIdentity: string;
}
