# RD-01: Production Security Corrections

> **Document**: RD-01-production-security-corrections.md
> **Status**: Approved
> **Created**: 2026-09-12
> **Project**: Porta Production Readiness
> **Depends On**: —
> **CodeOps Artifact Schema**: 1

---

## Feature Overview

This requirement closes two concrete security gaps before Porta is treated as suitable for a new
production installation. Signing keys created or rotated through the Admin API must receive the
same AES-256-GCM protection already used during first-run bootstrap. TOTP authenticator codes must
be single-use within their accepted time step, including the code used to confirm enrollment.

The correction reuses the current PostgreSQL transactions, encryption helper, JWKS cache, TOTP
service, and security test suites. It adds one database column and direct transactional checks. It
does not introduce a key-management service, Redis coordination, a worker, a queue, a compatibility
layer, or a new administrator workflow. (AR-3–AR-5, AR-18–AR-19)

---

## Functional Requirements

### Must Have

- [ ] **AC-01 — Encrypted key generation (M):** `POST /api/admin/keys/generate` shall generate an
      ES256 ECDSA P-256 key pair and store its private key with the existing AES-256-GCM helper.
      The inserted row shall set `encrypted = true` and contain non-null `private_key_iv` and
      `private_key_tag`. The API shall continue to return only `id`, `kid`, and its fixed success
      message; no private key, encryption material, or raw error may be returned or logged.
- [ ] **AC-02 — Atomic key rotation (M):** `POST /api/admin/keys/rotate` shall retire every active
      signing key and insert exactly one encrypted active ES256 key in one PostgreSQL transaction.
      Any failure before commit shall leave the previous active-key set unchanged and shall not
      report success.
- [ ] **AC-03 — Immediate local key visibility (S):** after a successful Admin key generation or
      rotation commit, Porta shall clear the existing in-process JWKS cache. The next
      `getActiveJwks()` call in that process shall load the committed key set from PostgreSQL.
      Cache invalidation shall not occur after a rolled-back operation. A key load that began
      before invalidation shall not repopulate the cache with its older snapshot.
- [ ] **AC-04 — Safe first-key bootstrap (M):** when no active signing key exists, concurrent Porta
      initializers shall serialize the recheck and encrypted insertion with a PostgreSQL transaction
      lock. After all successful initializers finish, the database shall contain exactly one active
      bootstrap key. The lock shall be held only for the recheck and optional insertion.
- [ ] **AC-05 — Plaintext keys rejected (S):** a signing-key row with `encrypted = false`, a missing
      IV, or a missing authentication tag shall be rejected instead of interpreted as a plaintext
      PEM key. Startup or key loading shall fail with a fixed, non-secret diagnostic. No legacy-key
      conversion is provided; unused installations reset and initialize their database.
- [ ] **AC-06 — Fixed TOTP contract (S):** Porta shall continue to issue and validate only RFC 6238
      TOTP using SHA-1, six digits, 30-second periods, and the existing acceptance window of one
      adjacent step on either side. Validation shall identify the matched absolute time-step number,
      not only a boolean result. Unsupported stored parameters shall be rejected and shall not cause
      Porta to silently validate with different parameters. Both authentication and enrollment
      shall present one generic service-unavailable outcome for this invalid server state without
      disclosing which stored parameter is unsupported.
- [ ] **AC-07 — Durable replay state (M):** `user_totp` shall store a nullable
      `last_accepted_time_step` integer. A valid candidate succeeds only when its matched step is
      greater than the stored value, and the accepted step is stored atomically in PostgreSQL.
      Invalid, expired, or already-consumed candidates shall not change the stored value. The
      consume shall match the loaded TOTP row ID, user ID, and expected verification state so a
      concurrently replaced enrollment cannot be consumed using an old secret.
- [ ] **AC-08 — Enrollment consumes its code (M):** successful TOTP enrollment confirmation shall
      atomically consume the matched step, mark the TOTP row verified, and enable TOTP for the user.
      The same code shall therefore fail if immediately submitted for authentication. If any
      database mutation fails, enrollment shall remain unconfirmed and the step shall remain
      unconsumed.
- [ ] **AC-09 — Concurrent verification (M):** when two requests submit the same valid TOTP code for
      the same user concurrently, exactly one request may consume the matched step and succeed. The
      other request shall receive the ordinary invalid-code result. Verification for one user shall
      not lock or modify another user's TOTP row.
- [ ] **AC-10 — Uniform public rejection (S):** authentication shall present the existing localized
      invalid-code response for a malformed, mismatched, expired, or replayed TOTP code. It shall not
      disclose which condition occurred and shall not automatically retry a code after a failed
      atomic consume. The existing organization/user-scoped `2fa_verify` rate limit shall also
      protect TOTP enrollment confirmation. Existing safe audit events remain in force.
- [ ] **AC-11 — Forward migration (S):** add one ordered migration rather than changing an applied
      migration. Its Up section shall add the nullable replay column and constrain newly supported
      TOTP state to SHA-1, six digits, and 30 seconds. Its Down section shall remove only additions
      made by this migration. No migration shall decrypt, convert, or preserve plaintext signing
      keys. Development and test installations may be reset before validation.
- [ ] **AC-12 — Accurate production guidance (S):** the README, environment guide, deployment guide,
      and Docker production guidance shall consistently state that
      `SIGNING_KEY_ENCRYPTION_KEY` and `TWO_FACTOR_ENCRYPTION_KEY` are distinct, required production
      secrets of exactly 64 hexadecimal characters. Published production examples shall contain
      placeholders rather than usable keys and shall not recommend MailHog, test DNS, or automatic
      migration as a steady-state production dependency. The documentation shall identify
      portability and database-managed configuration as later operational features, not runtime
      blockers for a correctly configured installation. It shall also correct the public database
      migration index and explain that every Porta instance must restart after successful key
      generation or rotation before the new key becomes the provider's signing key.
- [ ] **AC-13 — Existing boundaries preserved (M):** key endpoints shall retain their existing
      bearer authentication and exact `admin:key:generate` or `admin:key:rotate` permission checks.
      TOTP setup and verification shall retain tenant resolution, rate limiting, encrypted secrets,
      safe logging, and the existing success path into the OIDC interaction. No response shall
      expose signing keys, TOTP secrets, database errors, stack traces, or replay state.
- [ ] **AC-14 — Encryption-key separation (S):** production configuration shall reject startup when
      `SIGNING_KEY_ENCRYPTION_KEY` and `TWO_FACTOR_ENCRYPTION_KEY` contain the same value. The
      existing length, hexadecimal, presence, and development-placeholder checks remain unchanged.

### Should Have

- [ ] **AC-15 — Operator diagnosis (S):** a rejected signing-key row should produce one stable log
      event identifying the invalid row by `kid` only. It should not include PEM material,
      encryption values, raw database errors, or configuration secrets.

### Won't Have (Out of Scope)

- Conversion or continued reading of legacy plaintext signing keys.
- External KMS/HSM integration, envelope-key rotation, scheduled rotation, or a key-management
  subsystem.
- Redis replay markers, distributed locks, pub/sub, workers, queues, or automatic retries.
- New TOTP algorithms, digit counts, periods, or administrator-selectable TOTP parameters.
- Changes to email OTP, recovery-code, password, magic-link, or client-secret behavior.
- Portability and PostgreSQL-backed global configuration; RD-02 and RD-03 own those features.
- A claim that Porta is battle-tested, highly available, or a replacement for PostgreSQL backup and
  operating-system disaster-recovery procedures.

---

## Technical Requirements

### Signing-Key Storage and Transactions

| Operation | Transaction boundary | Required result |
|---|---|---|
| Admin generate | Existing Admin mutation transaction: encrypt, insert, commit, then clear cache | One new encrypted active key |
| Admin rotate | Existing Admin mutation transaction: retire active keys, encrypt, insert, commit, then clear cache | Previous active keys retired; one new encrypted active key |
| Empty-database bootstrap | Lock, recheck, optionally encrypt and insert, commit | At most one bootstrap insertion across concurrent initializers |

- All three paths shall use the existing `generateES256KeyPair()`, `encryptPrivateKey()`, database
  pool, and `clearJwksCache()` behavior rather than duplicate cryptographic code.
- Admin generation and rotation shall reuse the request-owned transaction established by
  `adminMutationAudit()`. Queries shall use the existing `getPool()` transaction proxy rather than
  checking out or committing a second client. Cache clearing shall be registered through
  `afterDatabaseCommit()`.
- The bootstrap lock may be a transaction-scoped lock on the `signing_keys` table. No long-lived or
  external coordination mechanism is required.
- The existing `signing_keys` public-key and metadata fields remain unchanged. Private keys remain
  absent from Admin API and SDK response contracts.

### TOTP Replay Model

```text
candidateStep = floor(validationTime / 30 seconds) + matchedDelta

accept only when:
  candidateStep > COALESCE(last_accepted_time_step, minimum)

atomic database condition:
  id = loadedTotpRowId
  AND user_id = loadedUserId
  AND verified = expectedVerificationState
  AND (last_accepted_time_step IS NULL OR last_accepted_time_step < candidateStep)
```

- The validation instant shall be captured once per attempt so calculation cannot cross a 30-second
  boundary between validation and persistence.
- The candidate step shall use the delta returned by the current RFC 6238 validator for its
  `window = 1` match.
- The consume operation shall be a conditional PostgreSQL update on the user's exact TOTP row.
  Affected-row count determines success; no read-then-write race is allowed.
- Enrollment confirmation shall perform replay consume, `user_totp.verified` update, and the user's
  `two_factor_enabled`/`two_factor_method` update in one transaction.
- An accepted previous-window code prevents later acceptance of an older or equal step. A valid
  current or future-window code can advance the stored step only once.
- Existing AES-256-GCM protection for the TOTP secret remains unchanged.

### Errors, Audit, and Availability

- Public authentication output remains the same for invalid and replayed codes. Internal logs may
  state that verification was rejected but shall not include the submitted code, secret, absolute
  step, encrypted payload, or raw error.
- Unsupported stored TOTP parameters shall use one fixed safe internal diagnostic and the same
  generic service-unavailable public outcome in authentication and enrollment. They shall not be
  reported as an incorrect user code.
- Invalid signing-key metadata, ciphertext, or PEM shall use one fixed domain-error message and one
  stable log event containing only the affected `kid`. Startup shall not serialize the underlying
  crypto error, stack, or internal path.
- Existing successful and failed 2FA audit event types remain. This feature does not add audit event
  payload fields containing replay state.
- A failed key mutation preserves the prior signing set. A failed TOTP consume preserves the prior
  replay step. Neither path retries a state-changing operation automatically.
- Dynamic cross-process JWKS refresh is not added. Each running provider already owns its startup
  signing configuration; the operational procedure restarts all instances when provider-startup
  state must be reloaded. CLI and operator guidance shall state this restart requirement after key
  generation and rotation, and verification shall confirm the committed key after restart.

### Verification Contract

- Immutable specification tests shall be written and observed failing before implementation.
- Signing-key coverage shall include encrypted Admin generation, encrypted atomic rotation,
  rollback, cache invalidation after commit only, an in-flight stale-load overlap, plaintext-row
  rejection, fixed non-secret diagnostics, and two concurrent empty-database initializers.
- TOTP coverage shall include initial success, same-code replay, older-step rejection, newer-step
  success, setup-code replay, enrollment rate limiting, unsupported stored parameters, transaction
  rollback, malformed code, concurrent row replacement, and two concurrent identical submissions
  with exactly one success.
- Security coverage shall assert unchanged permission enforcement, tenant isolation, rate limits,
  unequal production encryption keys, fixed public errors, and absence of secrets, raw errors,
  stacks, or internal paths from responses and logs.
- Implementation verification shall include focused server unit and integration selectors,
  `yarn workspace @portaidentity/server verify`, `yarn test:structure`, applicable TOTP/OIDC E2E and
  pentest selectors, and the registered production-security assurance harness required by project
  guidance. Final feature verification shall run `yarn verify` plus the applicable separate
  security harness and `yarn docs:build`.

---

## Integration Points

### With RD-02 (Selective Environment Portability)

- Portability excludes signing private keys and every TOTP enrollment or replay-state field.
- Imported users must enroll new authentication credentials after import.

### With RD-03 (PostgreSQL-Backed Global Configuration)

- Root encryption keys remain environment or secret-manager inputs and never become database
  configuration values.
- Provider-startup settings keep an explicit restart boundary; this RD adds no configuration
  messaging system.

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale | AR Ref |
|---|---|---|---|---|
| Admin signing keys | Encrypt only / encrypt and make rotation atomic / new subsystem | Reuse encryption plus one transaction | Closes the at-rest and partial-rotation gaps with existing code | AR-3 |
| Plaintext legacy rows | Convert / continue reading / reject and reset | Reject and reset | Porta has no adopted production data requiring compatibility work | AR-4 |
| TOTP replay state | None / Redis / PostgreSQL | PostgreSQL last-accepted step | Durable conditional update provides single-use behavior without new infrastructure | AR-5 |
| TOTP parameters | Generalize / retain current fixed contract | SHA-1, six digits, 30 seconds | Matches current issued tokens and avoids an unused configuration surface | AR-18 |
| Replica coordination | Distributed service / PostgreSQL transaction lock | PostgreSQL lock for first-key bootstrap | Resolves the one demonstrated initialization race directly | AR-19 |

---

## Security Considerations

- **Data sensitivity**: ES256 private keys and decrypted TOTP secrets are highly sensitive. They
  never leave their existing server-side boundaries or appear in logs, API output, or audit data.
- **Input validation**: TOTP input remains exactly six decimal digits at the server boundary. Key
  routes accept no caller-supplied key material.
- **Authentication & authorization**: existing Admin bearer authentication and exact key-operation
  permissions remain mandatory. TOTP verification applies only to the resolved pending user and
  organization interaction.
- **Injection risks**: all new database access uses fixed parameterized SQL. No shell, template,
  path, URL, or HTML input is introduced.
- **Encryption needs**: signing private keys and TOTP secrets use the established AES-256-GCM
  helpers with distinct externally supplied 256-bit keys. Plaintext fallback is removed.
- **Rate limiting**: current 2FA verification limits remain unchanged and cannot be bypassed by
  varying invalid versus replayed input. Enrollment confirmation uses the same existing
  organization/user-scoped attempt budget.
- **Infrastructure**: PostgreSQL is the only added coordination boundary. No network service,
  container, port, secret store, queue, or Redis protocol is introduced.

---

## Acceptance Criteria

1. [ ] After Admin generation, the database row has `algorithm = 'ES256'`, `encrypted = true`,
       non-null IV/tag fields, and private-key ciphertext that is not a PEM document; the `201`
       response contains no private or encryption material.
2. [ ] Forced insertion failure during rotation returns the existing safe server error, leaves all
       previously active keys active, creates no new row, and leaves the prior JWKS cache usable.
3. [ ] Successful rotation returns `201`, retires all previously active rows, creates exactly one
       encrypted active row, and causes the next local `getActiveJwks()` call to read the committed
       set.
4. [ ] Two concurrent bootstrap calls against an empty `signing_keys` table create exactly one
       encrypted active key and both return a usable JWKS containing that key.
5. [ ] Loading a row marked plaintext or missing its IV/tag fails with the same bounded diagnostic
       class and exposes no PEM, ciphertext, key, IV, tag, stack trace, or database error.
6. [ ] The first valid enrollment code confirms TOTP and stores its absolute time step; immediate
       authentication with that same code receives the existing invalid-code response.
7. [ ] Two simultaneous validations of the same valid code for one user produce one success and one
       ordinary invalid-code result, while a later code from a strictly greater step succeeds.
8. [ ] A malformed, mismatched, expired, older-step, same-step, and replayed TOTP submission all
       produce the same localized public invalid-code response and none changes
       `last_accepted_time_step`.
9. [ ] A forced database failure while confirming enrollment leaves the TOTP row unverified, the
       user without enabled TOTP, and `last_accepted_time_step` unchanged.
10. [ ] Requests without Admin authentication, without the exact key permission, or outside the
        existing resolved authentication interaction retain their current `401`, `403`, or safe
        authentication failure behavior and create no security-state mutation.
11. [ ] A key load begun before a successful mutation cannot reinstall its stale snapshot after the
        post-commit cache clear; the next local load observes committed state.
12. [ ] Replacing a user's TOTP row between validation and consumption causes the conditional
        update to affect zero rows and the attempt to fail without modifying the replacement.
13. [ ] Unsupported stored TOTP parameters produce the same generic service-unavailable outcome in
        authentication and enrollment, and their fixed internal diagnostic exposes no parameter,
        secret, code, stack, or internal path.
14. [ ] Production startup rejects equal signing-key and two-factor encryption-key values, while
        retaining the existing validation for distinct valid keys.
15. [ ] CLI and production guidance instruct the operator to restart every Porta instance after key
        generation or rotation, and a post-restart check observes the newly committed signing key.
11. [ ] Repository searches and captured test logs find no signing private key, decrypted TOTP
        secret, submitted TOTP code, encryption key, IV/tag value, raw SQL error, or stack trace in
        Admin responses, public authentication responses, audit metadata, or application logs.
12. [ ] The authoritative server, structure, relevant E2E/pentest, and registered
        production-security verification commands pass, and the four named production guidance
        surfaces agree on the encryption-key and steady-state deployment rules.
