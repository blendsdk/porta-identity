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

## Product-remediation delivery status

The separately authorized remediation has delivered the design-level enumeration work contract,
tenant-bound atomic magic links, the approved bulk/import/export contracts, and the covered
`security.decision.v1` event contract. This delivery does not complete every broader R5.6–R5.9
claim and is not a certification statement.

| Requirement | Delivered boundary | Remaining limit |
| --- | --- | --- |
| R5.6 | Fixed-shape password/recovery work and public enumeration equivalence are implemented and rerunnable | Statistical timing distributions remain diagnostic and receive no security credit |
| R5.7 | Magic-link tenant, interaction, client-authority, atomic-consume, and replay behavior is implemented and rerunnable | TOTP same-window replay and other explicitly deferred consistency cases remain open |
| R5.9 | Whole-request bulk validation, per-item bulk transactions, atomic import, and bounded allowlisted export are implemented and rerunnable | Unrelated packed-client/product observations remain separately recorded |
| R5.17 | Covered malformed/admin outcomes emit one privacy-safe terminal event and covered authorized mutations retain durable audit atomicity | Server-backed cases are rerunnable; external production-security correlation remains unqualified, and unmapped gaps receive no inferred credit |

## Functional Requirements

### Must Have

- [ ] **R5.1 (L)** Execute risk slices in this order unless a verified active exploit elevates a
      later item: tenant/admin authorization; OIDC/token boundaries; human authentication/recovery;
      injection/exposure/rate limiting; P1 administrative data surfaces (AR #18).
- [ ] **R5.2 (L)** Every slice shall define actors, assets, entry points, trust boundaries, abuse
      cases, expected rejection, prohibited side effects, required logs without sensitive data, and
      recovery behavior.
- [ ] **R5.3 (L)** Tenant/admin claims shall use two explicit authority matrices: ordinary-tenant
      principals for OIDC/session/token/tenant-data isolation, and super-admin-organization control-
      plane actors with distinct permissions targeting alpha/bravo resources. Claims shall cover
      read/write isolation, cache and issuer separation, organization membership, permission checks,
      IDOR, stale role/session state, and super-admin exceptions. Every negative route probe shall
      include an authorized control proving the target handler/resource boundary is reachable before
      tenant, identifier, or permission is varied.
- [ ] **R5.4 (L)** OIDC authorization claims shall cover exact redirect matching, public-client PKCE
      S256 enforcement, code-to-client/redirect binding, authorization-code single use, state
      round-trip responsibility, nonce propagation, consent integrity, and client authentication.
- [ ] **R5.5 (L)** Token claims shall cover ES256 signature validation, trusted keys, exact issuer,
      intended audience, subject, expiry/not-before, token-type separation, unknown `kid`, ignored
      attacker `jku`/`x5u`/embedded JWK, refresh rotation, and replay rejection.
- [ ] **R5.6 (L)** Human-authentication claims shall cover password success/failure, enumeration
      resistance, failed-login tracking, lockout, rate limits, session renewal, expiry, logout,
      cookie attributes, CSRF, and login-method enforcement. Enumeration resistance requires exact
      public status, redirect/page schema, header, cookie, error, and rate-limit equivalence plus
      design-level work equivalence: every structurally valid password attempt performs one
      Argon2id verification and one fixed-shape attempt-record operation, while magic-link and
      password-reset public requests enqueue one fixed-shape tenant-bound job without waiting for
      account-specific token or email work. Timing distributions are diagnostic only and shall not
      receive pass/fail security credit (product-remediation AR-1).
- [ ] **R5.7 (L)** Magic-link, reset, invitation, email OTP, TOTP, and recovery-code claims shall
      cover unpredictability, intended recipient/tenant, configured expiry boundary, single use,
      sequential replay, throttling, and absence of secret/token exposure outside the allowlisted
      synthetic delivery/verification channel. Concurrent duplicate consumption remains part of
      the deferred consistency catalog and receives no ordinary-lane credit. Delivered values must
      be absent from wrong mailboxes, responses, redirects, logs, audit events, traces, reports,
      referrers, and browser history, and must be redacted from retained evidence. Magic-link
      issuance shall bind the artifact to one organization and optional interaction. Verification
      shall match artifact, user, route tenant, interaction, and client authority before mutation;
      mismatch shall be generic, non-consuming, and free of account/session effects. Correct-route
      success shall consume the database artifact and Redis continuation atomically
      (product-remediation AR-2).
- [ ] **R5.8 (L)** Injection/exposure claims shall cover SQL, header/CRLF, XSS/template, prototype,
      command/path, redirect, slug/tenant, host/proxy, method, malformed JSON, oversized input,
      restrictive CORS/CSP, minimal errors, and version/infrastructure leakage where reachable.
- [ ] **R5.9 (L)** P1 administrative-data claims shall cover import validation, export sensitivity,
      bulk-operation authorization/atomicity, pagination isolation, audit integrity, signing-key
      lifecycle, session administration, and configuration authorization. Bulk operations shall
      validate the whole request before mutation, reject duplicate identifiers, and return ordered
      per-item outcomes from independently tenant-scoped transactions. Imports shall prevalidate
      their version, closed fields, duplicate natural keys, references, scopes, and authorization;
      intentional merge skips are non-errors, while every actual error rolls back the whole import.
      Overwrite changes only allowlisted mutable fields, dry-run uses the same planner without
      writes or real secret generation, and secret-equivalent inputs are rejected. Exports require
      dedicated export plus entity-read permission, exact tenant/application scope, closed field
      allowlists, bounded cardinality, safe audit details, and CSV formula neutralization
      (product-remediation AR-3).
- [ ] **R5.10 (M)** Applicable OIDC Core 1.0, RFC 7636, RFC 8725, RFC 9700, and OWASP ASVS 5.0.0
      requirements shall be cited with version and section/control identifiers in the owning claim;
      Porta-specific stricter invariants prevail (AR #24).
- [ ] **R5.11 (M)** Negative tests shall use raw requests where browser/client libraries would
      normalize or refuse the malicious input before it reaches Porta.
- [ ] **R5.12 (M)** Ordinary assurance shall prove sequential reuse rejection at the public
      authorization-code and refresh-token boundaries. Concurrent-consume, response-loss, and
      restart consistency remain explicit deferred claims and shall never be inferred from a
      sequential pass.
- [ ] **R5.13 (M)** No current pentest assertion may be deleted, skipped, relaxed, or replaced merely
      because a new harness claim overlaps it.
- [ ] **R5.14 (M)** Every verified invariant violation shall block the affected slice and be routed
      per RD-01; no test expectation may be changed to bless the observed defect (AR #19, AR #26).
- [ ] **R5.17 (L)** Every covered malformed request and administrative authentication or
      authorization decision shall emit exactly one `security.decision.v1` terminal event with a
      server-created request ID, normalized route and closed decision facts, and domain-separated
      protected references where applicable. Raw paths, queries, bodies, headers, credentials,
      emails, identifiers, stack traces, database/infrastructure errors, network addresses, and
      user agents are forbidden. Denial-event failure shall preserve the denial; authorized
      state-changing administrative mutations shall retain fail-closed durable audit persistence
      (product-remediation AR-4).

### Should Have

- [ ] **R5.15 (M)** After curated cases stabilize, property-based generation should cover redirect
      URIs, slugs, authorization parameters, headers, and tenant identifiers using the same exact
      oracle.
- [ ] **R5.16 (M)** Resilience claims should cover Redis/SMTP degradation, retry boundaries, and
      fail-closed behavior after P0/P1 semantic controls are assured.

### Won't Have (Out of Scope)

- Formal OIDC certification or a comprehensive ASVS level claim (AR #24).
- Product changes unrelated to the four explicitly authorized remediation contracts.
- Removal or consolidation of existing pentests.
- External AI scanner integration (AR #5).
- Concurrent-consume, committed-response-loss, restart-consistency, forced process termination,
  disposable source variants, and exact pre/post-commit interruption simulation in the ordinary
  assurance lane. Those advanced resilience cases require a separately authorized product-
  remediation and resilience campaign and remain named gaps until then.
- New consent/session-context orchestration, JWKS-key-set separation observation, durable per-probe
  side-effect/recovery inspection, and structured log-correlation implementation in Phase 7. The
  current live adapter output is corroboration only for these subclaims and cannot close them.

## Technical Requirements

### Risk-Slice Completion Matrix

| Slice               | Minimum external boundaries              | Mandatory adversarial classes                                                                                          |
| ------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Tenant/admin        | Raw HTTP, packed SDK/CLI where supported | Cross-tenant IDs, stale cache, missing membership, role escalation, unauthenticated/admin-token substitution           |
| OIDC/token          | SPA, BFF, raw HTTP/JOSE                  | Redirect manipulation, missing/wrong PKCE, code replay, JWT substitution, refresh replay, wrong client/issuer/audience |
| Human auth/recovery | Browser, HTTP, MailHog                   | Enumeration, fixation, CSRF, token replay/expiry, sequential reuse, 2FA/recovery bypass                               |
| Injection/exposure  | Raw HTTP and browser                     | SQL/XSS/header/template/prototype/path/host/method/oversize, CORS/CSP and error leakage                                |
| Admin data          | Raw HTTP, packed clients, fixture state  | Cross-tenant export/import/bulk, secret export, partial failure, unauthorized configuration/key/session action         |

Applications and application roles are global in the current Porta data model. Tenant ownership in
this matrix applies to users, clients, sessions, tokens, and other organization-keyed data. All
administrative API actors belong to the super-admin organization; their role/permission set and the
alpha/bravo target resource are varied independently.

### Exact Rejection Evidence

When a public standard defines an error, assert that protocol error and redirect/body placement.
Otherwise assert Porta's approved stable status and public error code. Always assert that forbidden
state, token, email, session, audit-secret, or cross-tenant data was not created or disclosed
(AR #17).

### Sequential Reuse Assurance and Deferred Consistency

The ordinary lane verifies that a completed authorization code and a rotated refresh predecessor
cannot be reused through their public endpoints. Existing raw HTTP, browser, SDK, CLI, and provider
integration tests remain the evidence for those supported sequential contracts.

Concurrent consumption, committed-response loss, restart persistence, and exact commit-boundary
behavior are not executed by this program. The deferred consistency catalog keeps their expected
outcomes explicit, but its requirements-only rig is not product evidence. A code-grounded review
confirmed that the authorization-code Redis adapter currently uses a non-atomic read/modify/write
sequence; that affected claim remains blocked pending separately authorized product remediation.

The Phase 7 live adapter also does not independently establish consent/session context state,
JWKS-key separation, every prohibited side effect/recovery outcome, or one exact correlated log
record. Those subclaims remain incomplete and receive no claim-transition credit. The remaining
independent JOSE, public protocol, packed-client, coverage, and pentest evidence is evaluated
separately rather than discarded.

## Integration Points

- RD-01 owns claims, evidence, named gaps, and defect routing.
- RD-02 owns isolated actors, clients, state, and raw/browser contexts.
- RD-03 provides execution evidence but cannot close a security claim.
- RD-04 supplies packed-client boundaries.
- RD-06 proves designated tests kill representative broken controls.

## Scope Decisions

| Decision                 | Options Considered                         | Chosen                          | Rationale                                                          | AR Ref                     |
| ------------------------ | ------------------------------------------ | ------------------------------- | ------------------------------------------------------------------ | -------------------------- |
| Ordering                 | Files / low coverage / blast-radius risk   | Blast-radius risk               | Tenant and authorization failures affect the whole platform        | AR #18                     |
| Oracle boundary          | Internals / client only / layered external | Layered external                | Reaches malicious inputs while retaining interoperability evidence | AR #7, AR #9               |
| Standards                | None / guidance / certification            | Versioned applicable guidance   | Independent requirements without unsupported claim                 | AR #24                     |
| Enumeration timing       | Statistical gate / design contract         | Design contract; diagnostic data | Avoids granting security credit to noisy finite timing samples      | product-remediation AR-1   |
| Magic-link mismatch      | Consume / preserve / allow                 | Preserve and reject             | Prevents cross-tenant use without adding a destruction primitive   | product-remediation AR-2   |
| Administrative data     | Atomic / partial by workflow               | Partial bulk; atomic import     | Preserves bulk compatibility and import dependency integrity       | product-remediation AR-3   |
| Correlated decision logs | Joined records / one terminal event         | One terminal event              | Each outcome is independently attributable and privacy-safe        | product-remediation AR-4   |

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
       surface where that resource is tenant-scoped; global application/role operations use
       super-admin control-plane permission checks instead of fictional tenant ownership. Every
       denial is paired with an authorized control that reaches the intended route and leaves the
       target unchanged when authority is removed or the tenant target is substituted.
3. [ ] Public-client authorization rejects missing/plain/wrong PKCE and any non-exact redirect URI;
       a valid S256 flow completes and a used authorization code cannot be exchanged again.
4. [ ] ID-token evidence verifies ES256 signature from the advertised trusted JWKS, exact issuer,
       intended client audience, subject, expiry, and requested nonce; forged algorithm/key/issuer/
       audience/expiry variants are rejected.
5. [ ] Refresh-token rotation produces a different token and rejects reuse of the predecessor
       without issuing another valid token.
6. [ ] Magic-link, reset, invitation, OTP, and recovery artifacts are accepted only for their
       intended tenant/user and within configured lifetime; sequential replay fails, while
       concurrent duplicate consumption remains a named deferred gap.
7. [ ] Authentication enumeration pairs use the same public status/body schema and disclose no user
       existence; password and recovery request paths satisfy the approved design-level work-
       equivalence contract. Any retained timing distribution is explicitly non-gating.
8. [ ] Representative SQL, XSS/template, header/CRLF, prototype, redirect, slug, host/proxy, method,
       malformed, and oversized inputs cause no execution, cross-tenant effect, internal error,
       secret, stack, SQL, path, or version disclosure.
9. [ ] All existing server pentest files still collect and pass after each completed slice.
10. [ ] A verified invariant violation creates a blocked claim and separate defect record; the slice
        cannot report `assured` until separately authorized remediation and regression verification.
11. [ ] Each slice's executable profile records its actor/action/resource/result matrix, asset,
        entry point, trust boundary, abuse case, rejection, prohibited side effect, privacy-safe
        audit/log expectation, and recovery expectation; schema validation rejects omissions.
12. [ ] Replay-sensitive controls reject sequential reuse through the public boundary. Concurrent
        consumption, committed-response loss, graceful-restart replay, pre/post-commit interruption,
        and uncommitted-timeout branches are reported as deferred gaps and cannot be credited as
        completed evidence.
13. [ ] Magic-link tenant or interaction mismatch produces the same public rejection as an invalid
        artifact without consuming it or mutating user, login, token, or session state; intended-
        tenant success remains atomic and single-use.
14. [ ] Bulk/import/export behavior matches R5.9 for duplicate inputs, partial and not-attempted
        outcomes, rollback, dry-run, secret-bearing fields, tenant scope, bounded export, and CSV
        formula input.
15. [ ] Every covered malformed/admin decision produces one independently correlated,
        schema-valid, privacy-safe terminal event; missing, duplicate, or forbidden event fields
        fail the affected claim.
