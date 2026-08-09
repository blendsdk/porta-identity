# Component: Functional and Security Risk Slices

> **Parent**: [Plan Index](00-index.md)
> **Owns**: RD-04 functional contracts and RD-05 security assurance

## Slice Completion Rule

A slice is complete only when all Must claims have reviewed independent sources, exact positive and
negative specification tests, prohibited-side-effect checks, current green evidence, attributable
coverage, a killed representative fault, and no unnamed gaps. Existing tests can be selected as
sentinels after review; their passing history alone confers no assurance.

## Ordered Slices

### P0-1: Tenant isolation and administrative authorization

- Cross-tenant read/write/list/search/count/bulk/import/export denial for resource IDs and slugs.
- Cache/session/token keys cannot collide across tenants.
- Role possession and organization membership are both required.
- Super-admin boundaries are explicit; headers/paths cannot substitute tenant authority.
- Negative probes verify tenant-B state is unchanged after tenant-A attempts.

### P0-2: OIDC, JWT, PKCE, signing, and token lifecycle

- Exact issuer and redirect URI; registered response/grant/scope behavior.
- PKCE S256 for public clients; nonce/state and interaction integrity.
- ES256 signature, P-256 keys, algorithm restrictions, issuer/audience/expiry validation.
- Authorization-code and refresh-token single use, rotation, replay response, and grant effects.
- UserInfo and logout/session behavior through independent client and raw probes.

### P0-3: Human authentication and recovery

- Login enumeration resistance, failed-login tracking, lockout, and rate-limit key equivalence.
- Magic-link/password-reset unpredictability, expiry, single use, and prohibited state changes.
- Session renewal at authentication, expiry/revocation, secure host-only cookies, and CSRF.
- 2FA enforcement, encrypted TOTP arrangement, email OTP throttling, and hashed single-use recovery.
- Duplicate/concurrent consumption yields one success and deterministic rejection thereafter.

### P1: Validation, exposure, and high-value workflows

- Zod input boundaries, parameterized SQL, slug/path/header injection, XSS and request-size handling.
- Restrictive authenticated CORS, CSP/security headers, production HTTPS, and cookie attributes.
- Minimal external errors with no stack, SQL, filesystem, infrastructure, secret, or version leakage.
- Bulk/import/export authorization, validation, atomicity/partial-result contract, and tenant scope.
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

## Standards Traceability

Claim sources use version-qualified sections from OpenID Connect Core 1.0, RFC 9700, RFC 8725, and
OWASP ASVS 5.0.0 only where applicable. Conflicts with an approved Porta contract enter the defect/
oracle review workflow; tests do not invent a certification claim.
