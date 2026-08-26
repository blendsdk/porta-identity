# Enumeration Resistance: Assurance Product Remediation

> **Document**: 03-01-enumeration-resistance.md
> **Parent**: [Index](00-index.md)

## Overview

Enumeration resistance is a product-path invariant, not a noisy wall-clock promise. AR-1 requires
functional indistinguishability and removes known account-dependent work branches. AR-5 supplies a
durable recovery-job boundary without adding an external service.

## Password path

1. Normalize and validate tenant, email, password shape, method, CSRF, and rate limit exactly once.
2. Resolve the account without changing public output.
3. Select exactly one hash: the eligible account's stored hash or a process-cached Argon2id dummy
   hash generated with the same production parameters during startup.
4. Perform exactly one `verifyPassword` call for every structurally valid, rate-limit-admitted
   attempt. A successful dummy verification can never authenticate.
5. Execute one fixed-shape failure-accounting repository operation. It conditionally updates an
   eligible real user but always uses the same prepared-query/transaction boundary.
6. Render the same generic failure contract for unknown, passwordless, disabled, suspended,
   locked, and wrong-password failures except where an already-authenticated recovery UX is
   separately authorized. No response may identify the account state.

The dummy hash is configuration-independent output created with the active Argon2id parameters. It
is not a credential, is never logged, and is replaced only on process restart or parameter change.

## Recovery request path

Magic-link and password-reset request handlers insert one `auth_recovery_jobs` row after identical
validation, CSRF, and throttling. The row carries a closed job type, organization ID, normalized
address protected for at-rest storage, interaction binding where applicable, idempotency digest,
creation/availability timestamps, attempt count, and terminal status. It never carries a token.

The public request returns after the insert and renders the exact generic response. The recovery
worker claims at most 25 jobs, wakes on enqueue with a one-second fallback poll, uses five total
attempts with four inter-attempt delays of 1 second, 10 seconds, 60 seconds, and 5 minutes, and
reclaims only claims whose five-minute lease expired. On shutdown it stops claiming and gives
active work 30 seconds to settle. It:

- claims rows with one transaction and `FOR UPDATE SKIP LOCKED`;
- resolves the tenant/account only after claim;
- no-ops for absent or ineligible accounts;
- invalidates and creates the tenant-bound token for eligible accounts;
- sends mail and writes the business audit event without exposing existence in worker diagnostics;
- marks completion idempotently, retries transient dependency failures after 1 second, 10 seconds,
  60 seconds, and 5 minutes, and marks a closed terminal failure after the fifth attempt.

Duplicate public requests remain governed by the existing tenant/address rate limit. Idempotency
prevents one admitted request from producing more than one artifact, not multiple separately
admitted requests from replacing the prior token.

## Failure handling

| Failure | Required behavior | AR Ref |
| --- | --- | --- |
| Dummy hash initialization fails | Server readiness fails; never start with a short-circuit path | AR-1 |
| Recovery-job insert fails | Same generic service-unavailable response for all identities; no mail/token effect | AR-1, AR-5 |
| Worker account absent/ineligible | Successful no-op with privacy-safe terminal state | AR-1, AR-5 |
| Worker database/mail transient failure | Bounded retry; one active artifact; ambiguous SMTP outcomes may resend the identical link | AR-5, AR-12 |
| Worker terminal failure | Privacy-safe event/counter; public request remains non-enumerating | AR-1, AR-4 |

## Testing requirements

- Operation-count specifications for every password eligibility state.
- Public response/cookie/header/body equivalence across existing and absent identities.
- Outbox restart, duplicate claim, retry, no-op, and idempotency integration tests.
- MailHog and database observations proving intended delivery and absent-identity no-op without
  timing-based pass/fail assertions.
