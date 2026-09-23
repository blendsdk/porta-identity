# Authentication and Credentials: JSVision Admin Foundation

> **Document**: 03-02-authentication-and-credentials.md
> **Parent**: [Index](00-index.md)

## Overview

This component corrects the existing OIDC identity-acceptance gap, extracts a UI-neutral login coordinator shared by `porta login` and `porta admin`, binds credentials to the selected environment, verifies the live session, and makes refresh-token rotation durable under process concurrency. It changes the CLI and the SDK public auth surface, but the SDK retains its current memory-only default. (AR-6, AR-7, AR-17, AR-27)

## Authentication Flow

```text
resolve/validate selected HTTPS origin
  -> compare with stored credential origin before bearer use
  -> if usable, refresh transaction when required
  -> GET /{orgSlug}/me through that same origin
  -> authenticated shell

otherwise Authenticate
  -> discover exact organization issuer metadata
  -> create PKCE verifier/challenge, state, and nonce
  -> browser authorization or displayed URL/manual callback input
  -> validate callback state and exchange code once
  -> fully verify ID token
  -> confirm replacement when stored origin differs
  -> atomically persist credentials
  -> live /me verification
```

The coordinator returns typed results/capabilities and accepts UI callbacks for browser/manual instructions, confirmation, and cancellation. It does not read stdin directly and does not import JSVision. `porta login` adapts existing prompts; `porta admin` adapts dialogs. (AR-6, AR-16, AR-22)

## Planned Interfaces

```ts
/** UI-neutral interactions needed by the authorization-code coordinator. */
export interface LoginInteraction {
  readonly presentAuthorizationUrl: (url: URL) => Promise<void>;
  readonly requestManualCallback: () => Promise<string>;
  readonly confirmCredentialReplacement: (currentServer: URL, nextServer: URL) => Promise<boolean>;
}

/** Lifetime controls shared by login and stored-session verification. */
export interface CliAuthOperationOptions {
  readonly signal: AbortSignal;
}

/** Completes one OIDC login and persists only a fully validated credential set. */
export async function authenticateCliSession(
  request: LoginRequest,
  interaction: LoginInteraction,
  options: CliAuthOperationOptions,
): Promise<VerifiedSession>;

/** Determines whether stored credentials can safely establish a live session. */
export async function verifyStoredSession(
  request: StoredSessionRequest,
  options: CliAuthOperationOptions,
): Promise<SessionVerificationResult>;
```

The operation signal propagates through callback waiting and every discovery, JWKS, token, and UserInfo request. Cancellation closes the callback listener and stops manual-callback acceptance. Cancellation before token dispatch performs no persistence. Once persistence starts, its atomic write and lock release reach a definite committed/failed result before returning; cancellation after refresh dispatch follows the indeterminate-response rule below. All exported types and hooks receive complete JSDoc, including side effects and security invariants. Credential, token-response, discovery, callback, and UserInfo inputs use explicit runtime schemas/type guards; no unchecked cast establishes trust. (AR-17, AR-27, AR-33)

## ID-Token Verification

Authorization requests contain a fresh unpredictable nonce. Token handling accepts identity only after all of the following succeed:

1. Compact JWT parsing is structurally valid and the protected algorithm is exactly ES256.
2. Signature verifies against the issuer's discovered JWKS using a matching usable key.
3. `iss` exactly equals the discovered organization issuer.
4. `aud` contains the public CLI client ID; if multiple audiences exist, `azp` must equal that client ID, and any present `azp` must be consistent.
5. `exp` is in the future, `iat` is numeric and no more than 60 seconds in the future, and required claims have correct types. This user-authorized ID-token clock-skew allowance is independent of access-token early-refresh buffers; no arbitrary maximum token age is invented without an OIDC `max_age` request.
6. `nonce` exactly equals the request-bound nonce.
7. `sub` is a non-empty string and becomes the immutable subject for this authentication session.

State and PKCE checks remain mandatory. Validation failure returns a sanitized authentication failure and cannot persist credentials or populate application identity. A refreshed ID token replaces stored display identity only when the complete original validation context is available, the token passes the same checks, and its `sub` exactly matches the original validated subject. Otherwise it is ignored, the prior validated display identity is retained, and live identity still comes from subject-matched UserInfo. (AR-27, AR-28, AR-46)

## Selected-Server Binding and Live Verification

Origins are parsed and normalized through one validator. Stored bearer credentials are eligible only when their normalized `server` exactly equals the selected origin; failure occurs before SDK auth provider/client construction so no request can accidentally carry the token. Organization slug is taken from the validated credential/session context and UserInfo is requested at the matching issuer path. (AR-7, AR-18)

The live result mapping is:

| Observation                         | Session result                                                |
| ----------------------------------- | ------------------------------------------------------------- |
| Successful validated UserInfo       | Authenticated with verified identity                          |
| 401 or refresh failure              | Unauthenticated; Authenticate/Retry/Quit                      |
| Network/unavailable                 | Classified unavailable; Retry/Quit                            |
| Invalid local configuration/storage | Classified configuration/storage failure; no bearer use       |
| Future administration API 403       | Authenticated identity retained; unauthorized operation state |

UserInfo payloads are schema-validated and must contain a non-empty string `sub` exactly equal to the original validated ID-token subject. A missing or mismatched subject rejects the session before any UserInfo field is used; only allowlisted display fields cross into application state. (AR-7, AR-26, AR-28)

## SDK Refresh Transaction

The SDK auth provider gains optional hooks whose contract is public but inert unless supplied:

```ts
export interface CliCredentialPersistence {
  readonly withRefreshLock: <T>(operation: () => Promise<T>) => Promise<T>;
  readonly persistRefreshedCredentials: (
    previous: StoredCredentials,
    refreshed: StoredCredentials,
  ) => Promise<void>;
}

export interface CliAuthOptions {
  readonly credentialsPath?: string;
  readonly credentialPersistence?: CliCredentialPersistence;
}
```

`CliCredentialPersistence`, `CliAuthOptions`, and `StoredCredentials` are exported from the SDK authentication entry point with these exact names. `credentialPersistence` is optional and inert when omitted. One in-process promise coalesces refresh callers. Under the bounded cross-process lock, the transaction re-reads and validates credentials, adopts a newer usable snapshot, or advances through `not-dispatched` → `dispatched` → `response-validated` → `persisting` → `committed`. An omitted `refresh_token` preserves the prior refresh token as OIDC requires. (AR-17, AR-34, AR-36)

A failure proven before dispatch may retry the grant. Timeout, cancellation, or transport loss after dispatch is indeterminate: the grant is never replayed and the session requires fresh authentication. Invalid responses are never persisted or retried. After validation, the exact refreshed snapshot remains inside the provider; a later token request may retry that same atomic write under the lock, without another grant. The new access token is returned only from `committed`. SDK consumers that omit `credentialPersistence` retain current memory-only behavior and no filesystem dependency. (AR-17, AR-34)

## CLI Credential Storage

The existing single-profile JSON shape remains backward-readable and aligns `refreshToken` as optional across CLI and SDK. Reads validate schema before use. Writes create an owner-only temporary file in the credential directory, fsync/close as supported, set mode 0600, atomically rename over the target, and preserve owner-only directory policy. One small adapter over `fs-ext-extra-prebuilt@2.2.13` opens a persistent owner-only lock file in the validated directory, acquires an exclusive non-blocking kernel lock with a bounded monotonic retry deadline and abort support, and always unlocks/closes in `finally`. POSIX uses `fcntl(F_SETLK, F_WRLCK)` on byte 0; Windows uses `LockFileEx` with exclusive and fail-immediately flags on the same byte range. The lock file is never unlinked; process exit releases the kernel lock, so Porta implements no PID/age stale-recovery protocol. Only documented contention errors retry, and timeout never bypasses exclusivity. (AR-16, AR-17, AR-26, AR-35)

Authentication to another origin presents both normalized, non-secret origins and persists only after explicit confirmation. Decline leaves the old profile unchanged. (AR-16)

## Error Handling

| Error case                                                                  | Handling strategy                                                          | AR ref       |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------ |
| Discovery/JWKS/token/UserInfo malformed                                     | Reject with allowlisted authentication/protocol category; no raw body      | AR-26, AR-27 |
| State, PKCE, nonce, signature, issuer, audience, algorithm, or time invalid | Reject identity and credentials; require a fresh flow                      | AR-6, AR-27  |
| Selected and credential origins differ                                      | Do not construct bearer client; require authentication for selected origin | AR-7, AR-16  |
| Browser open fails                                                          | Display authorization URL and continue via UI-owned manual completion      | AR-6         |
| Replacement declined                                                        | Preserve existing credentials and return cancelled result                  | AR-16        |
| Proven pre-dispatch refresh failure                                         | One grant retry is permitted                                               | AR-17, AR-34 |
| Post-dispatch refresh timeout/cancel/socket loss                            | Indeterminate; never replay grant; require fresh authentication            | AR-17, AR-34 |
| Refresh response invalid                                                    | Reject refresh; do not persist or retry request with untrusted values      | AR-17, AR-26 |
| Refresh lock times out                                                      | Return bounded storage/concurrency failure; do not bypass lock             | AR-17        |
| Atomic persistence fails after grant                                        | Do not return new access token or replay grant; surface storage failure    | AR-17        |
| UserInfo 401                                                                | Clear usable session state and offer authentication                        | AR-7         |

## Testing Requirements

- Immutable OIDC specifications for nonce inclusion, exact subject continuity, and invalid algorithm/signature/issuer/audience/authorized-party/time/nonce rejection.
- Specifications proving no persistence/display on invalid identity and correct subject-bound refresh ID-token handling.
- SDK specifications for the exact public hook types, unchanged default behavior, response validation, state-machine outcomes, single-flight, and persistence-before-return.
- CLI credential-store implementation tests using temporary real files/process coordination for atomicity, permissions, kernel-lock contention, timeout, abort, process-crash release, never-unlink behavior, and failure injection.
- Client/session specifications proving exact origin binding before bearer construction and exact UserInfo subject matching.
- Shared-coordinator tests proving browser/manual paths and cancellation stages work through injected interactions with no competing stdin reader.
- Protocol/security harness and clean packed compatibility evidence listed in [Testing Strategy](07-testing-strategy.md).
