# Requirements: Device Authorization

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-01](../../requirements/RD-01-provider-capability.md), [RD-02](../../requirements/RD-02-tenant-safe-verification.md), [RD-03](../../requirements/RD-03-client-contracts.md), [RD-04](../../requirements/RD-04-cli-device-login.md), [RD-05](../../requirements/RD-05-security-operations.md) — the OWNING requirements documents
> **Preflight**: [00-preflight-report.md](00-preflight-report.md) — iteration 1 blocked; the accepted resolutions are applied here

## Scope of this plan (delta view)

### In this plan

- RD-01: enable the provider feature; discovery; device authorization and token endpoints;
  DeviceCode storage, retention, uniqueness and protocol errors.
- RD-02: shared organization/path helper; organization binding before `deviceFlow` enablement;
  branded code-entry/confirmation/success pages; generic invalid/expired/aborted page; SSO,
  login-method, 2FA and consent reuse; abort and generic error states.
- RD-03: full-URN grant contract across Admin API, SDK, CLI client commands, Admin terminal,
  portability and docs; empty `responseTypes` plus conditional zero redirect URIs; explicit
  admin-client enablement; server-fleet upgrade gate.
- RD-04: `porta login --device-code`; discovery validation; polling; no-retry ambiguous exchange;
  token and ID-token validation; existing credential store and refresh; live CLI E2E.
- RD-05: fixed authorization/user-code/polling limits plus per-IP aggregates; session UID resolution;
  approval-only primary reset; audit; redaction; cleanup; pentest and assurance evidence.

### Deferred / out of this plan

- None. All five RDs are in this plan, as approved (requirements AR-34). RD-04 and RD-05 carry the
  preflight amendments PF-006 and PF-005.

## Plan-local decisions

| Decision | Chosen | AR/Preflight Ref |
|---|---|---|
| Plan folder | `plans/device-authorization/` | P-6 |
| Middleware placement | Shared org/path helper; tenant binding and fixed device limiters before client enablement; all device limiters before `oidcClientTenantBinding` | P-7, PF-002, PF-003, PF-015 |
| DeviceCode retention and uniqueness | Migration 039 partial unique index with duplicate preflight; 900s adapter retention; collision returns a custom exposed 503; zero/NaN TTL stores now+900 | P-8, PF-001, PF-023 |
| Verification forms | Porta-owned accessible form using the trusted provider action/XSRF; scopes from `ctx.oidc.deviceCode.params.scope`; abort uses the generic invalid page; `device` i18n namespace registered | P-9, PF-010, PF-016, PF-025 |
| Contract surfaces | Shared full-URN constants; `responseTypes: []` plus zero redirects only for device-only clients; conditional redirect/service validation; terminal/portability/SDK/CLI/docs in lockstep | P-10, PF-001, PF-011, PF-018 |
| CLI token verification | Separate `verifyDeviceIdToken` without a nonce; authorization-code verifier unchanged; no-retry after a dispatched exchange; 429 clamp and unknown-error branch | P-11, PF-006, PF-024, PF-026 |
| User-code limits | Primary key IP+provider session UID (resolved from the signed cookie); per-IP aggregate; approval resets only the primary; aggregate never reset | P-12, PF-004, PF-005 |
| Audit/redaction | Authorized in successSource before render; denied for user abort/consent denial via the interaction entity and `err.cause`; hashed jti; once per window; Pino paths; no URL sanitizer | P-12, P-17, PF-013, PF-021 |
| Concurrent confirmation | Durable conditional approval write (compare-and-set on accountId/inFlight) plus a spec case | PF-014 |
| Concurrent polling envelope | One device login per client+IP at the advertised interval; parallel flows may receive 429 | P-18 |
| Test layers | DB/HTTP/time cases in integration/E2E; live CLI E2E; one ST owner; structure counts updated; UI/harness gates | P-5, PF-007–PF-009, PF-020 |
| Execution commit mode | `--auto-commit` when exec-plan runs; red-phase tasks are non-committable checkpoints committed with the first green task | P-14, PF-009 |
| Task granularity | 1–3 files, roughly 50–150 lines; five phases; existing `*.spec.test.*` / `*.impl.test.*` conventions | P-16 |

## Acceptance Criteria

The RDs own their detailed acceptance criteria. This plan is complete when:

1. [ ] All RD-01–RD-05 acceptance criteria are covered by the specification tests and implementation,
   including the RD-04 no-retry amendment and the RD-05 approval-only primary reset.
2. [ ] The cross-tenant verification and resume tests pass, including the org-prefix, trailing-slash
   and mixed-case UID variants.
3. [ ] The generic token limit does not count device polls; the fixed device limits pass their
   boundary tests; the per-IP aggregate is never reset by an approval.
4. [ ] Admin API, SDK, CLI, Admin terminal and portability round-trips accept the full URN, empty
   response types and zero redirect URIs for a device-only client.
5. [ ] `porta login --device-code` completes a full approval and persists usable credentials in a
   live CLI E2E.
6. [ ] No device code or user code appears in logs or audit; the audit idempotency key is hashed and
   deduplicated.
7. [ ] The production-security profile has no new findings with the three accepted gaps unchanged
   (exit 40 recorded); the compatibility selector is described truthfully; UI and harness gates are
   recorded.
8. [ ] CI's full `pnpm verify` passes and the structure-test counts match the new test inventory.
