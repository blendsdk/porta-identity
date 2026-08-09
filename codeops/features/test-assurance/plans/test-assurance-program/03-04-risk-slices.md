# Component: Functional and Security Risk Slices

> **Parent**: [Plan Index](00-index.md)
> **Owns**: RD-04 functional contracts and RD-05 security assurance

## Slice Completion Rule

A slice is complete only when all Must claims have reviewed independent sources, exact positive and
negative specification tests, prohibited-side-effect checks, current green evidence, attributable
coverage, a killed representative fault, and no unnamed gaps. Existing tests can be selected as
sentinels after review; their passing history alone confers no assurance.

Each claim links a validated slice profile containing the complete actor/action/resource/result
matrix, asset, entry point, trust boundary, abuse/rejection class, privacy-safe audit/log event, and
recovery behavior. Applicable packed SDK/CLI boundaries and production-security profile evidence
must be green in the owning slice before it can close.

## Ordered Slices

### P0-1: Tenant isolation and administrative authorization

- Ordinary alpha/bravo principals prove OIDC issuer, session, token, client, user, and tenant-data
  isolation; applications and roles are explicitly global rather than fictional tenant resources.
- Super-admin-organization control-plane actors vary full/limited/no permissions against alpha and
  bravo target resources. Each denial follows an authorized control that proves handler reachability.
- Cache/issuer separation and stale role removal, actor deactivation/suspension, and session
  revocation are exercised through existing and fresh clients/processes; organization reassignment/
  membership removal is not a current public operation and remains not-applicable or a named gap.

### P0-2: OIDC, JWT, PKCE, signing, and token lifecycle

- Exact issuer and redirect URI; registered response/grant/scope behavior.
- PKCE S256 for public clients; nonce/state and interaction integrity.
- Issued ID tokens are independently verified for ES256/P-256 signature, trusted JWKS, `kid`,
  issuer, audience, subject, nonce, expiry, and not-before. Porta's opaque access tokens are tested
  only for type separation/rejection at real consuming boundaries.
- Authorization-code and refresh-token single use, rotation, replay response, and grant effects.
- UserInfo and logout/session behavior through independent client and raw probes.

### P0-3: Human authentication and recovery

- Login enumeration resistance, failed-login tracking, lockout, and rate-limit key equivalence.
- Magic-link/password-reset/invitation/email-OTP artifacts cover unpredictability, intended
  recipient/tenant, expiry, single use, and prohibited state changes. The synthetic recipient's
  MailHog mailbox is the allowlisted delivery/verification channel; the value must not appear in a
  wrong mailbox, response, redirect, log, audit event, trace, report, referrer, or browser history.
- Session renewal at authentication, expiry/revocation, secure host-only cookies, and CSRF.
- 2FA enforcement, encrypted TOTP arrangement, email OTP throttling, and hashed single-use recovery.
- Replay controls cover duplicate/concurrent consumption, read during consumption, failure directly
  before/after durable commit, timeout/unknown-outcome retry, and fresh-process replay.

### P1: Validation, exposure, and high-value workflows

- Zod input boundaries and SQL, header/CRLF, XSS/template, prototype, command/path, redirect,
  slug/tenant, host/proxy, method, malformed JSON, and request-size attacks using raw requests where
  client libraries normalize input.
- Restrictive authenticated CORS, CSP/security headers, production HTTPS, and cookie attributes.
- Minimal external errors with no stack, SQL, filesystem, infrastructure, secret, or version leakage.
- Pagination isolation; audit read/cleanup integrity and redaction; signing-key list/generate/rotate
  authorization/lifecycle; session list/detail/revoke scope/cascade; configuration read/update auth.
- Bulk/import/export specifications remain blocked until a product-authority gate approves duplicate,
  collision, provenance/version, rollback, partial-result, and export-sensitivity contracts.
- Redis/SMTP degradation and retry behavior where an approved contract exists.

## Test Design Rules

- Derive assertions from the claim source before reading the implementation under test.
- Use exact stable protocol fields/statuses/state transitions, not incidental rendering.
- Fail on missing fixtures/prerequisites; never conditionally skip a required assertion.
- Independently decode/verify JOSE and protocol data; do not call Porta token helpers.
- Test equivalent bypass shapes: ID versus slug, path versus query/body, casing/encoding, and
  concurrent or repeated requests where security state is involved.
- When an existing implementation is already green, record that result and use its curated fault
  as the required red/sensitivity evidence.
- Production HTTPS/cookie/header/error/exposure claims run in the `production-security` profile;
  development-mode journeys remain in the `operational` profile and cannot substantiate them.

## Standards Traceability

Claim sources use version-qualified sections from OpenID Connect Core 1.0, RFC 9700, RFC 8725, and
OWASP ASVS 5.0.0 only where applicable. Conflicts with an approved Porta contract enter the defect/
oracle review workflow; tests do not invent a certification claim.
