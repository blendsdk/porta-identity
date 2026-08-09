# RD-05: Security Risk-Slice Assurance

> **Document**: RD-05-security-risk-slice-assurance.md
> **Status**: Complete
> **Created**: 2026-08-09
> **Project**: Porta Test Assurance
> **Depends On**: RD-01, RD-02
> **CodeOps Artifact Schema**: 1

---

## Feature Overview

Porta's critical security behavior is audited as ordered risk slices. Each slice converts security
invariants and applicable standards into independent exact positive, negative, replay, concurrency,
and cross-tenant claims. Existing pentests remain a protected baseline; harness claims provide
additional external evidence rather than replacing them (AR #4, AR #18).

## Functional Requirements

### Must Have

- [ ] **R5.1 (L)** Execute risk slices in this order unless a verified active exploit elevates a
      later item: tenant/admin authorization; OIDC/token boundaries; human authentication/recovery;
      injection/exposure/rate limiting; P1 administrative data surfaces (AR #18).
- [ ] **R5.2 (L)** Every slice shall define actors, assets, entry points, trust boundaries, abuse
      cases, expected rejection, prohibited side effects, required logs without sensitive data, and
      recovery behavior.
- [ ] **R5.3 (L)** Tenant/admin claims shall cover read and write isolation, cache separation,
      issuer separation, organization membership, role assignment, permission checks, IDOR, stale
      role/session state, and super-admin exceptions.
- [ ] **R5.4 (L)** OIDC authorization claims shall cover exact redirect matching, public-client PKCE
      S256 enforcement, code-to-client/redirect binding, authorization-code single use, state
      round-trip responsibility, nonce propagation, consent integrity, and client authentication.
- [ ] **R5.5 (L)** Token claims shall cover ES256 signature validation, trusted keys, exact issuer,
      intended audience, subject, expiry/not-before, token-type separation, unknown `kid`, ignored
      attacker `jku`/`x5u`/embedded JWK, refresh rotation, and replay rejection.
- [ ] **R5.6 (L)** Human-authentication claims shall cover password success/failure, enumeration
      resistance, failed-login tracking, lockout, rate limits, session renewal, expiry, logout,
      cookie attributes, CSRF, and login-method enforcement.
- [ ] **R5.7 (L)** Magic-link, reset, invitation, email OTP, TOTP, and recovery-code claims shall
      cover unpredictability, intended recipient/tenant, configured expiry boundary, single use,
      replay, concurrent duplicate consumption, throttling, and absence of secret/token exposure.
- [ ] **R5.8 (L)** Injection/exposure claims shall cover SQL, header/CRLF, XSS/template, prototype,
      command/path, redirect, slug/tenant, host/proxy, method, malformed JSON, oversized input,
      restrictive CORS/CSP, minimal errors, and version/infrastructure leakage where reachable.
- [ ] **R5.9 (L)** P1 administrative-data claims shall cover import validation, export sensitivity,
      bulk-operation authorization/atomicity, pagination isolation, audit integrity, signing-key
      lifecycle, session administration, and configuration authorization.
- [ ] **R5.10 (M)** Applicable OIDC Core 1.0, RFC 7636, RFC 8725, RFC 9700, and OWASP ASVS 5.0.0
      requirements shall be cited with version and section/control identifiers in the owning claim;
      Porta-specific stricter invariants prevail (AR #24).
- [ ] **R5.11 (M)** Negative tests shall use raw requests where browser/client libraries would
      normalize or refuse the malicious input before it reaches Porta.
- [ ] **R5.12 (M)** Concurrent duplicate-use tests shall distinguish exactly one successful durable
      consumption from rejected competitors for single-use artifacts.
- [ ] **R5.13 (M)** No current pentest assertion may be deleted, skipped, relaxed, or replaced merely
      because a new harness claim overlaps it.
- [ ] **R5.14 (M)** Every verified invariant violation shall block the affected slice and be routed
      per RD-01; no test expectation may be changed to bless the observed defect (AR #19, AR #26).

### Should Have

- [ ] **R5.15 (M)** After curated cases stabilize, property-based generation should cover redirect
      URIs, slugs, authorization parameters, headers, and tenant identifiers using the same exact
      oracle.
- [ ] **R5.16 (M)** Resilience claims should cover Redis/SMTP degradation, retry boundaries, and
      fail-closed behavior after P0/P1 semantic controls are assured.

### Won't Have (Out of Scope)

- Formal OIDC certification or a comprehensive ASVS level claim (AR #24).
- Automatic product fixes.
- Removal or consolidation of existing pentests.
- External AI scanner integration (AR #5).

## Technical Requirements

### Risk-Slice Completion Matrix

| Slice               | Minimum external boundaries              | Mandatory adversarial classes                                                                                          |
| ------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Tenant/admin        | Raw HTTP, packed SDK/CLI where supported | Cross-tenant IDs, stale cache, missing membership, role escalation, unauthenticated/admin-token substitution           |
| OIDC/token          | SPA, BFF, raw HTTP/JOSE                  | Redirect manipulation, missing/wrong PKCE, code replay, JWT substitution, refresh replay, wrong client/issuer/audience |
| Human auth/recovery | Browser, HTTP, MailHog                   | Enumeration, fixation, CSRF, token replay/expiry, concurrent consumption, 2FA/recovery bypass                          |
| Injection/exposure  | Raw HTTP and browser                     | SQL/XSS/header/template/prototype/path/host/method/oversize, CORS/CSP and error leakage                                |
| Admin data          | Raw HTTP, packed clients, fixture state  | Cross-tenant export/import/bulk, secret export, partial failure, unauthorized configuration/key/session action         |

### Exact Rejection Evidence

When a public standard defines an error, assert that protocol error and redirect/body placement.
Otherwise assert Porta's approved stable status and public error code. Always assert that forbidden
state, token, email, session, audit-secret, or cross-tenant data was not created or disclosed
(AR #17).

### Distributed Interleavings

For replay-sensitive controls, cover concurrent duplicate requests, read during consumption,
failure immediately before/after durable commit, retry after timeout, and processing on a fresh
server process. Tests shall not assume synchronized clocks beyond configured tolerance.

## Integration Points

- RD-01 owns claims, evidence, named gaps, and defect routing.
- RD-02 owns isolated actors, clients, state, and raw/browser contexts.
- RD-03 provides execution evidence but cannot close a security claim.
- RD-04 supplies packed-client boundaries.
- RD-06 proves designated tests kill representative broken controls.

## Scope Decisions

| Decision        | Options Considered                         | Chosen                        | Rationale                                                          | AR Ref       |
| --------------- | ------------------------------------------ | ----------------------------- | ------------------------------------------------------------------ | ------------ |
| Ordering        | Files / low coverage / blast-radius risk   | Blast-radius risk             | Tenant and authorization failures affect the whole platform        | AR #18       |
| Oracle boundary | Internals / client only / layered external | Layered external              | Reaches malicious inputs while retaining interoperability evidence | AR #7, AR #9 |
| Standards       | None / guidance / certification            | Versioned applicable guidance | Independent requirements without unsupported claim                 | AR #24       |

## Security Considerations

- **Data sensitivity**: Tests intentionally handle tokens and exploit details; redaction is mandatory.
- **Input validation**: Attack payload generators are allowlisted to the target and cannot escape the
  harness network or filesystem.
- **Authentication and authorization**: Every actor/action/resource combination receives an exact
  allowed, unauthenticated, forbidden, or not-found result.
- **Injection risks**: Malicious inputs are data arguments, never interpolated into local commands,
  SQL, or paths.
- **Encryption**: TLS and existing at-rest crypto invariants remain enabled; tests do not introduce
  plaintext storage.
- **Rate limiting**: Limits are tested as product behavior and reset only at deterministic boundaries.
- **Infrastructure**: Attack traffic targets loopback harness services only; CI DNS preflight must
  prove the reserved hostname resolves to `127.0.0.1`.

## Acceptance Criteria

1. [ ] Every P0 claim has one exact allowed case, one unauthenticated/invalid case, one privilege or
       tenant bypass attempt, and a forbidden-side-effect assertion where applicable.
2. [ ] Tenant A credentials cannot read or mutate a tenant B user, client, application, role,
       permission, session, configuration, key, import/export, or audit resource in the mapped P0/P1
       surface; every attempt receives the contract-defined rejection and leaves B unchanged.
3. [ ] Public-client authorization rejects missing/plain/wrong PKCE and any non-exact redirect URI;
       a valid S256 flow completes and a used authorization code cannot be exchanged again.
4. [ ] ID-token evidence verifies ES256 signature from the advertised trusted JWKS, exact issuer,
       intended client audience, subject, expiry, and requested nonce; forged algorithm/key/issuer/
       audience/expiry variants are rejected.
5. [ ] Refresh-token rotation produces a different token and rejects reuse of the predecessor
       without issuing another valid token.
6. [ ] Magic-link, reset, invitation, OTP, and recovery artifacts are accepted only for their
       intended tenant/user and within configured lifetime; exactly one of two concurrent consumes
       succeeds, and subsequent replay fails.
7. [ ] Authentication enumeration pairs use the same public status/body schema and disclose no user
       existence; timing tests record distributions and defined tolerance rather than one sample.
8. [ ] Representative SQL, XSS/template, header/CRLF, prototype, redirect, slug, host/proxy, method,
       malformed, and oversized inputs cause no execution, cross-tenant effect, internal error,
       secret, stack, SQL, path, or version disclosure.
9. [ ] All existing server pentest files still collect and pass after each completed slice.
10. [ ] A verified invariant violation creates a blocked claim and separate defect record; the slice
        cannot report `assured` until separately authorized remediation and regression verification.
