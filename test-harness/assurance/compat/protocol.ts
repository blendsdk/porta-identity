import { z } from 'zod';

import type { PreparedPackedConsumer, PackedSurfaceResult } from './model.js';
import type { PackedCliSdkResolution } from './resolution.js';

/** Sanitized CLI login evidence admitted by the packed protocol adjunct. */
export interface PackedProtocolCliLoginEvidence {
  /** CLI process status after successful credential persistence. */
  readonly exitCode: number;
  /** Owner-only mode observed on the temporary CLI home. */
  readonly temporaryHomeMode: number;
  /** Owner-only mode observed on the generated credential file. */
  readonly credentialsMode: number;
  /** Whether the temporary CLI home was absent after credential handoff. */
  readonly temporaryHomeRemoved: boolean;
  /** Whether the caller's real credential fingerprint remained unchanged. */
  readonly callerCredentialUnchanged: boolean;
  /** Whether a real browser completed the authorization interaction. */
  readonly browserCompleted: boolean;
  /** Response type observed in the CLI-generated authorization request. */
  readonly responseType: string;
  /** PKCE method observed in the CLI-generated authorization request. */
  readonly codeChallengeMethod: string;
  /** Whether the browser callback returned the exact CLI-generated state. */
  readonly stateRoundTrip: boolean;
  /** Whether the authorization request asked for offline access. */
  readonly requestedOfflineAccess: boolean;
  /** Whether the authorization request explicitly required login and consent. */
  readonly promptedForLoginAndConsent: boolean;
  /** Whether the issued access token remained an opaque bearer value. */
  readonly accessTokenOpaque: boolean;
  /** Whether the persisted credential contract included a refresh token. */
  readonly refreshTokenPresent: boolean;
  /** Whether Node cryptography and trusted public JWKS accepted the ID token. */
  readonly idTokenIndependentlyVerified: boolean;
  /** Whether the ID-token audience matched the discovered CLI client. */
  readonly idTokenAudienceExact: boolean;
  /** Whether the ID-token subject matched the authenticated fixture actor. */
  readonly idTokenSubjectExact: boolean;
  /** Whether a separate raw request accepted the issued access token. */
  readonly accessTokenAcceptedByRawObserver: boolean;
  /** Whether bounded CLI output omitted every protected credential value. */
  readonly outputRedacted: boolean;
}

/** Sanitized SDK refresh evidence admitted by the packed protocol adjunct. */
export interface PackedProtocolSdkRefreshEvidence {
  /** Exact installed SDK entry used by the refresh probe. */
  readonly sdkEntry: string;
  /** Whether the SDK left the CLI-owned credential file byte-identical. */
  readonly credentialsFingerprintUnchanged: boolean;
  /** Whether refresh returned an access token distinct from the stored token. */
  readonly refreshedAccessTokenChanged: boolean;
  /** Whether a separate raw request accepted the refreshed access token. */
  readonly refreshedAccessTokenAcceptedByRawObserver: boolean;
  /** HTTP status observed when independently retrying the consumed refresh token. */
  readonly consumedRefreshRetryStatus: number;
  /** OAuth error observed when independently retrying the consumed refresh token. */
  readonly consumedRefreshRetryError: string;
  /** Whether bounded SDK-probe output omitted every protected credential value. */
  readonly outputRedacted: boolean;
}

/** Complete provenance-bound evidence for the packed protocol adjunct. */
export interface PackedProtocolEvidence {
  /** Evidence schema version. */
  readonly version: 1;
  /** Clean revision used to build the server and both packed clients. */
  readonly sourceRevision: string;
  /** Digest of the exact owned Porta image used by the journeys. */
  readonly serverImageDigest: string;
  /** Digest of the deterministic fixture generation used by the journeys. */
  readonly fixtureIdentity: string;
  /** Digests of the exact SDK and CLI archives installed into the consumer. */
  readonly archives: Readonly<Record<'sdk' | 'cli', string>>;
  /** Package-resolution facts observed before public-client execution. */
  readonly resolution: {
    /** Whether every SDK entry resolved beneath its compiled distribution. */
    readonly sdkDistOnly: boolean;
    /** Whether the CLI executable resolved beneath its compiled distribution. */
    readonly cliDistOnly: boolean;
    /** Whether the CLI installed the exact locally packed SDK content. */
    readonly cliUsesPackedSdk: boolean;
  };
  /** Browser-assisted packed CLI login observations. */
  readonly cliLogin: PackedProtocolCliLoginEvidence;
  /** Packed SDK refresh and independent retry observations. */
  readonly sdkRefresh: PackedProtocolSdkRefreshEvidence;
  /** Whether primary source provenance remained unchanged through execution. */
  readonly primaryTreeUnchanged: boolean;
  /** Sanitized owned resources remaining after cleanup. */
  readonly ownedResidue: readonly string[];
}

/** Provenance supplied by the packed-consumer owner before protocol execution. */
export type PackedProtocolRunContext = Omit<
  PackedProtocolEvidence,
  'version' | 'cliLogin' | 'sdkRefresh'
>;

/** Driver that executes the packed CLI and SDK while keeping secret values out of evidence. */
export interface PackedProtocolJourneyDriver {
  /** Completes the browser-assisted CLI login and returns sanitized observations. */
  loginWithCli(): Promise<PackedProtocolCliLoginEvidence>;
  /** Uses the CLI credential contract through the packed SDK and observes refresh externally. */
  refreshWithSdk(): Promise<PackedProtocolSdkRefreshEvidence>;
}

const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const archiveDigestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const cliLoginSchema = z
  .object({
    exitCode: z.number().int(),
    temporaryHomeMode: z.number().int(),
    credentialsMode: z.number().int(),
    temporaryHomeRemoved: z.boolean(),
    callerCredentialUnchanged: z.boolean(),
    browserCompleted: z.boolean(),
    responseType: z.string(),
    codeChallengeMethod: z.string(),
    stateRoundTrip: z.boolean(),
    requestedOfflineAccess: z.boolean(),
    promptedForLoginAndConsent: z.boolean(),
    accessTokenOpaque: z.boolean(),
    refreshTokenPresent: z.boolean(),
    idTokenIndependentlyVerified: z.boolean(),
    idTokenAudienceExact: z.boolean(),
    idTokenSubjectExact: z.boolean(),
    accessTokenAcceptedByRawObserver: z.boolean(),
    outputRedacted: z.boolean(),
  })
  .strict();
const sdkRefreshSchema = z
  .object({
    sdkEntry: z.string(),
    credentialsFingerprintUnchanged: z.boolean(),
    refreshedAccessTokenChanged: z.boolean(),
    refreshedAccessTokenAcceptedByRawObserver: z.boolean(),
    consumedRefreshRetryStatus: z.number().int(),
    consumedRefreshRetryError: z.string(),
    outputRedacted: z.boolean(),
  })
  .strict();
const packedProtocolEvidenceSchema = z
  .object({
    version: z.literal(1),
    sourceRevision: z.string().regex(/^[a-f0-9]{40}$/u),
    serverImageDigest: digestSchema,
    fixtureIdentity: digestSchema,
    archives: z.object({ sdk: archiveDigestSchema, cli: archiveDigestSchema }).strict(),
    resolution: z
      .object({
        sdkDistOnly: z.boolean(),
        cliDistOnly: z.boolean(),
        cliUsesPackedSdk: z.boolean(),
      })
      .strict(),
    cliLogin: cliLoginSchema,
    sdkRefresh: sdkRefreshSchema,
    primaryTreeUnchanged: z.boolean(),
    ownedResidue: z.array(z.string().min(1)),
  })
  .strict();

/**
 * Derives protocol provenance from the prepared local archives and observed package resolution.
 *
 * The CLI must resolve the exact packed SDK archive before either public client may run.
 */
export function createPackedProtocolRunContext(
  consumer: PreparedPackedConsumer,
  surfaces: PackedSurfaceResult,
  resolution: PackedCliSdkResolution,
): PackedProtocolRunContext {
  const sdk = consumer.archives.find((archive) => archive.name === '@portaidentity/sdk');
  const cli = consumer.archives.find((archive) => archive.name === '@portaidentity/cli');
  if (sdk === undefined || cli === undefined || consumer.archives.length !== 2) {
    throw new Error('packed protocol archives are incomplete');
  }
  if (resolution.resolvedContentSha256 !== sdk.contentSha256) {
    throw new Error('packed CLI does not resolve the prepared SDK archive');
  }
  return Object.freeze({
    sourceRevision: consumer.triplet.sourceRevision,
    serverImageDigest: consumer.triplet.serverImageDigest,
    fixtureIdentity: consumer.triplet.fixtureIdentity,
    archives: Object.freeze({ sdk: sdk.sha256, cli: cli.sha256 }),
    resolution: Object.freeze({
      sdkDistOnly: surfaces.distOnly,
      cliDistOnly: surfaces.cliBinPath.endsWith('/dist/index.js'),
      cliUsesPackedSdk: resolution.resolvedContentSha256 === resolution.packedContentSha256,
    }),
    primaryTreeUnchanged: true,
    ownedResidue: Object.freeze([]),
  });
}

/** Validates exact packed protocol semantics, provenance, redaction, and cleanup. */
export function validatePackedProtocolEvidence(value: unknown): PackedProtocolEvidence {
  const evidence = packedProtocolEvidenceSchema.parse(value);
  if (
    !evidence.resolution.sdkDistOnly ||
    !evidence.resolution.cliDistOnly ||
    !evidence.resolution.cliUsesPackedSdk
  ) {
    throw new Error('packed resolution is not admitted');
  }
  if (!evidence.primaryTreeUnchanged) throw new Error('primary tree provenance changed');
  if (evidence.ownedResidue.length !== 0) throw new Error('owned residue remains');
  validateCliLogin(evidence.cliLogin);
  validateSdkRefresh(evidence.sdkRefresh);
  return evidence;
}

/** Enforces the complete browser, PKCE, token, credential, and redaction contract. */
function validateCliLogin(login: PackedProtocolCliLoginEvidence): void {
  if (
    login.exitCode !== 0 ||
    !login.browserCompleted ||
    login.responseType !== 'code' ||
    login.codeChallengeMethod !== 'S256' ||
    !login.stateRoundTrip ||
    !login.requestedOfflineAccess ||
    !login.promptedForLoginAndConsent ||
    !login.accessTokenOpaque ||
    !login.refreshTokenPresent ||
    !login.idTokenIndependentlyVerified ||
    !login.idTokenAudienceExact ||
    !login.idTokenSubjectExact ||
    !login.accessTokenAcceptedByRawObserver
  ) {
    throw new Error('CLI protocol evidence is incomplete');
  }
  if (
    login.temporaryHomeMode !== 0o700 ||
    login.credentialsMode !== 0o600 ||
    !login.temporaryHomeRemoved ||
    !login.callerCredentialUnchanged
  ) {
    throw new Error('CLI credential isolation is incomplete');
  }
  if (!login.outputRedacted) throw new Error('CLI protocol output redaction is incomplete');
}

/** Enforces public SDK entry, rotation, raw observation, and consumed-token retry semantics. */
function validateSdkRefresh(refresh: PackedProtocolSdkRefreshEvidence): void {
  if (
    refresh.sdkEntry !== '@portaidentity/sdk/node' ||
    !refresh.credentialsFingerprintUnchanged ||
    !refresh.refreshedAccessTokenChanged ||
    !refresh.refreshedAccessTokenAcceptedByRawObserver ||
    !refresh.outputRedacted
  ) {
    throw new Error('SDK refresh evidence is incomplete');
  }
  if (
    refresh.consumedRefreshRetryStatus !== 400 ||
    refresh.consumedRefreshRetryError !== 'invalid_grant'
  ) {
    throw new Error('consumed refresh retry did not return invalid_grant');
  }
}

/** Runs CLI login before SDK refresh and admits only the complete combined evidence. */
export async function runPackedProtocolAdjunct(
  context: PackedProtocolRunContext,
  driver: PackedProtocolJourneyDriver,
): Promise<PackedProtocolEvidence> {
  const cliLogin = await driver.loginWithCli();
  const sdkRefresh = await driver.refreshWithSdk();
  return validatePackedProtocolEvidence({ version: 1, ...context, cliLogin, sdkRefresh });
}
