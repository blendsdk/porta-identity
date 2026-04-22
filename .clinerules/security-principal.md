# Security Principal Rule

**Rule ID:** `security-principal`
**Category:** Principal Constraint (Highest Priority)
**Scope:** Porta project — governs ALL agent decisions, implementations, and modifications
**Priority:** **SUPREME** — This rule overrides all other considerations. When any rule, task requirement, or implementation goal conflicts with this rule, this rule wins.

---

## Declaration of Principle

Porta is an **OIDC authentication and identity provider**. Security is not a feature of Porta — security **is** the product. Every line of code, every configuration choice, every architectural decision exists to protect user identities, authentication flows, and tenant data.

This makes security the **supreme, non-negotiable constraint** for all work on this project.

---

## 🔴 The Non-Degradation Mandate

> **No implementation — regardless of type, scope, or justification — MUST degrade Porta's security posture in any shape or form.**

This applies universally and without exception to:

| Change Type | Security Mandate |
|---|---|
| **Bug fixes** | MUST NOT weaken security to fix a bug. Find a secure fix. |
| **Test fixes** | MUST NOT remove, weaken, or bypass security test assertions. |
| **New features** | MUST NOT introduce new attack surfaces without corresponding protections. |
| **Feature removal** | MUST NOT remove security mechanisms that protect remaining features. |
| **Refactoring** | MUST NOT simplify code at the cost of security properties. |
| **Dependency updates** | MUST NOT introduce dependencies with known vulnerabilities. |
| **Configuration changes** | MUST NOT weaken production security defaults. |
| **Performance optimization** | MUST NOT trade security for speed. |
| **Documentation** | MUST NOT expose sensitive implementation details, internal endpoints, or key material. |

**If a task would require weakening security, the agent MUST refuse and explain why.** There are no exceptions.

---

## Security Domains

These are Porta's security pillars. Each MUST be actively protected and MUST NEVER be degraded:

### 1. Authentication Flows
- OIDC specification compliance MUST be maintained
- PKCE MUST remain enforced for public clients
- Interaction integrity (login, consent) MUST NOT be bypassable
- Magic link token security (single-use, time-limited, unpredictable) MUST be preserved
- Password reset flows MUST remain secure against token prediction and replay

### 2. Token Security
- **ES256 (ECDSA P-256)** MUST remain the signing algorithm — no downgrade to RS256, HS256, or `none`
- JWT validation MUST check signature, issuer, audience, and expiry — no field may be skipped
- Token expiry enforcement MUST NOT be disabled or extended beyond secure limits
- Refresh token rotation MUST be maintained

### 3. Cryptographic Standards
- **Argon2id** MUST remain the password hashing algorithm — no downgrade to bcrypt, scrypt, or plaintext
- **AES-256-GCM** MUST remain the encryption standard for 2FA secrets
- **ECDSA P-256** MUST remain the signing key algorithm
- Key material MUST be stored encrypted at rest
- Recovery codes MUST be hashed with Argon2id — never stored in plaintext

### 4. Input Validation
- **Zod schemas** MUST validate all external input (API requests, CLI arguments, OIDC parameters)
- **Parameterized SQL** MUST be used for all database queries — no raw string interpolation, ever
- Redirect URI validation MUST be strict (exact match, no open redirects)
- Slug validation MUST prevent injection attacks

### 5. Multi-Tenant Isolation
- All database queries MUST be scoped to the correct organization
- Cross-tenant data access MUST be impossible through any API, CLI, or OIDC endpoint
- Tenant resolution MUST be validated before any data access
- Cache keys MUST include tenant context to prevent cross-tenant cache poisoning

### 6. Rate Limiting & Brute-Force Protection
- Rate limiting MUST remain active on all authentication endpoints
- Failed login tracking MUST NOT be disabled
- Account lockout / throttling behavior MUST NOT be weakened
- Rate limit bypass MUST NOT be possible through header manipulation or parameter variation

### 7. RBAC & Authorization
- Admin auth middleware (`admin-auth.ts`) MUST protect all `/api/admin/*` routes
- The `porta-admin` role check MUST NOT be bypassed or weakened
- User role verification MUST check both role assignment AND org membership
- Privilege escalation MUST be impossible through any API endpoint

### 8. Session Management
- Session cookies MUST use `Secure`, `HttpOnly`, and `SameSite` attributes in production
- Session fixation MUST be prevented (new session on authentication)
- Session expiry MUST be enforced
- CSRF protection MUST remain active on all state-changing endpoints

### 9. Transport & Header Security
- HTTPS MUST be enforced in production
- Security headers MUST be maintained: `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`
- CORS MUST remain restrictive — no wildcard origins on authenticated endpoints
- The root page handler MUST maintain its no-leakage posture (no product fingerprinting)

### 10. Information Leakage Prevention
- Error responses MUST NOT include stack traces, SQL errors, or internal paths
- Log output MUST NOT contain passwords, tokens, secrets, or key material
- API responses MUST NOT expose internal IDs, infrastructure details, or system state
- The `GET /` and metadata endpoints MUST NOT reveal product identity or version

### 11. Two-Factor Authentication Integrity
- TOTP secret encryption (AES-256-GCM) MUST NOT be weakened
- Email OTP delivery MUST remain rate-limited
- Recovery codes MUST remain single-use and hashed
- 2FA enforcement MUST NOT be bypassable once enabled for a user

### 12. Secret Management
- Client secrets MUST be hashed (SHA-256 pre-hash + Argon2id) — never stored in plaintext
- Signing keys MUST be encrypted at rest
- No secret, password, token, or key material may appear in logs, responses, or error messages
- Environment variables containing secrets MUST NOT have insecure defaults

---

## Mandatory Security Impact Assessment

**Before implementing ANY change**, the agent MUST evaluate these questions:

| # | Question | If YES → Action Required |
|---|---|---|
| 1 | Does this change touch an authentication flow? | Document security justification; verify flow integrity is preserved |
| 2 | Does this change modify how tokens are created, validated, or stored? | Verify signing algorithm, validation rules, and storage security are unchanged |
| 3 | Does this change alter input validation? | Verify no validation is removed or weakened; check for injection risks |
| 4 | Does this change affect multi-tenant data isolation? | Verify all queries remain org-scoped; check for cross-tenant leakage |
| 5 | Does this change weaken or remove a rate limit? | **STOP — this is almost certainly a security degradation** |
| 6 | Does this change expose information that was previously hidden? | Verify no secrets, internal details, or infrastructure info is leaked |
| 7 | Does this change modify cryptographic operations or key material? | Verify no algorithm downgrade; verify key storage remains encrypted |
| 8 | Does this change affect RBAC or authorization checks? | Verify no privilege escalation is possible; verify middleware chain is intact |
| 9 | Does this change remove or weaken a security test? | **STOP — security tests are a protective asset and MUST NOT be degraded** |
| 10 | Does this change modify error handling? | Verify no internal details are exposed in error responses |

### Proportionality Guideline

The depth of security assessment should be proportional to the change:

| Change Scope | Assessment Level |
|---|---|
| Cosmetic / documentation only | Quick scan — confirm no secrets or internal details are exposed |
| Internal refactor (no public API change) | Verify security properties are preserved through the refactor |
| Bug fix | Verify the fix doesn't weaken a security control; verify no new attack surface |
| Test fix | Verify no security assertion is removed or weakened |
| New feature / endpoint | Full assessment — all 10 questions above |
| Authentication or crypto change | Full assessment + explicit security justification in commit message |
| Dependency update | Check for known vulnerabilities; verify no breaking security changes |

---

## 🚫 Forbidden Actions

The agent MUST **NEVER** perform any of the following. These are absolute prohibitions with no exceptions:

### Authentication & Authorization
- ❌ Disable or weaken authentication on any endpoint
- ❌ Bypass RBAC checks or the admin-auth middleware
- ❌ Allow unauthenticated access to protected resources
- ❌ Skip CSRF validation on state-changing endpoints
- ❌ Disable or reduce 2FA enforcement once enabled

### Cryptography
- ❌ Downgrade password hashing (Argon2id → bcrypt/scrypt/SHA/plaintext)
- ❌ Downgrade token signing (ES256 → RS256/HS256/`none`)
- ❌ Downgrade encryption (AES-256-GCM → weaker algorithms)
- ❌ Store passwords, secrets, or keys in plaintext
- ❌ Use `Math.random()` for security-sensitive operations (use `crypto.randomBytes`)

### Input & Output
- ❌ Use raw SQL string interpolation (MUST use parameterized queries)
- ❌ Skip input validation "for simplicity" or "temporarily"
- ❌ Return internal error details (stack traces, SQL errors) to API consumers
- ❌ Log passwords, tokens, secrets, or key material

### Data Isolation
- ❌ Execute database queries without tenant scoping where required
- ❌ Allow cross-tenant data access through any path
- ❌ Use shared cache keys without tenant context

### Infrastructure
- ❌ Remove security headers (CSP, X-Frame-Options, etc.)
- ❌ Allow wildcard CORS origins on authenticated endpoints
- ❌ Expose internal infrastructure details (hostnames, ports, versions)
- ❌ Disable rate limiting on authentication endpoints

### Testing
- ❌ Remove or weaken security test assertions
- ❌ Delete pentest test files without replacement
- ❌ Skip security test execution to "save time"
- ❌ Mark security tests as `.skip` or `.todo` without explicit user approval

---

## Conflict Resolution Protocol

When a task requirement conflicts with security:

### Step 1: STOP
Do not implement the insecure path. Do not "do it temporarily" or "fix it later."

### Step 2: EXPLAIN
Clearly state:
- What security concern exists
- Which security domain (from the list above) would be degraded
- What the concrete risk would be

### Step 3: PROPOSE
Offer a **secure alternative** that achieves the task goal without degrading security. There is almost always a way to accomplish a goal securely.

### Step 4: ESCALATE
If no secure alternative exists, explicitly ask the user for guidance. Present the trade-off clearly:
- "This task requires [X], which would weaken [security domain]. The risk is [concrete risk]. I cannot proceed without your explicit acknowledgment of this trade-off."

**The agent MUST NOT silently proceed with a security-degrading implementation.**

---

## Pentest Suite as Security Baseline

The pentest suite (`tests/pentest/`) is a **codified security baseline**. It validates the security properties listed in this rule. Therefore:

1. **Pentest tests MUST pass** — A failing pentest is a potential security regression
2. **Pentest tests MUST NOT be weakened** — Changing assertions to make them pass instead of fixing the underlying issue is a security violation
3. **New attack surfaces require new pentests** — When adding features that expand the attack surface, corresponding pentest coverage SHOULD be added
4. **`yarn verify` validates security** — The verify command runs the full test suite; security tests are included by default

---

## 🚨 Enforcement: Two Contexts

This rule applies identically to the two contexts defined in `docs-maintenance.md`:

### Context 1: Formal Plans (`make_plan` / `exec_plan`)

Every execution plan MUST include security considerations:

1. **During plan creation** — The agent MUST evaluate each planned task against the Security Impact Assessment and note any security-relevant tasks
2. **During implementation** — Each task that touches security domains MUST include a security justification
3. **The Documentation Phase** (per `docs-maintenance.md`) MUST also verify that security documentation is accurate

### Context 2: Ad-hoc Tasks (Non-Plan Act Mode Work)

Before calling `attempt_completion`, the agent MUST confirm:

1. **No security degradation occurred** — State explicitly: "Security assessment: [brief statement of what was checked]"
2. **If security was touched** — Describe what changed and why it maintains or improves security
3. **If pentest-relevant** — Confirm pentest suite still passes

---

## Integration with Existing Rules

This rule **supersedes and constrains** all other rules:

- **`agents.md`** — Security assessment is a mandatory part of every agent decision, loaded before all other considerations
- **`code.md`** — All coding standards are subject to security constraints (e.g., "clean code" never justifies removing validation)
- **`testing.md`** — Security tests have the highest protection; removing them requires explicit user approval
- **`git-commands.md`** — Security-relevant commits SHOULD include `security:` in the scope or body
- **`docs-maintenance.md`** — Security documentation is a subset of the documentation mandate; both rules apply independently

---

## Violation Detection

**Signs this rule is being violated:**

- ❌ A security test is removed, skipped, or weakened without explicit user approval
- ❌ Input validation is bypassed or removed
- ❌ Raw SQL string interpolation appears in any query
- ❌ Passwords, tokens, or secrets appear in log output
- ❌ An authentication check is removed from a protected endpoint
- ❌ A cryptographic algorithm is downgraded
- ❌ Cross-tenant data access becomes possible
- ❌ Rate limiting is disabled or weakened
- ❌ Error responses contain stack traces or internal details
- ❌ `attempt_completion` is called without a security status statement
- ❌ A task that touches security domains has no security justification

---

## Summary

| Principle | Statement |
|---|---|
| **What** | Security is the supreme constraint for all work on Porta |
| **Why** | Porta is an authentication provider — security IS the product |
| **When** | Every decision, every line of code, every refactor, every task |
| **How** | Mandatory Security Impact Assessment + Forbidden Actions list + Conflict Resolution Protocol |
| **Enforcement** | Pre-implementation assessment + completion verification + pentest baseline |
| **Override** | This rule cannot be overridden by other rules, convenience, or deadlines |
