# Raw-Lane Live Evidence

> **Document**: 00-raw-lane-evidence.md
> **Parent**: [Index](00-index.md)
> **Collected**: 2026-09-21
> **Method**: operational stack (`lifecycle start --ci --profile operational`), raw HTTP transport,
> JSON decision logs (`PORTA_LOG_FORMAT=json`), correlation by `X-Request-Id`
> **Scope**: the 15 immutable raw cases (`validation-exposure-raw-case-requirements.ts`)

## Purpose

This records the real public outcome of every raw case so each mismatch with the immutable oracle
can be decided from evidence (AR-3). Each request was run as its declared control, probe, and
recovery. Log records were parsed from the owned container and correlated by the server-issued
`X-Request-Id`.

## Results

| Case                                 | Control (exp/obs) | Probe (exp/obs) | Correlated decision | Assessment                                                                   |
| ------------------------------------ | ----------------- | --------------- | ------------------- | ---------------------------------------------------------------------------- |
| `st52-sql-query-value`               | 200/200           | 400/**200**     | allowed             | Product accepts the search value; oracle expects rejection                   |
| `st52-header-crlf`                   | 200/200           | 400/**200**     | allowed             | CR/LF splits into legal headers; security intent met, oracle expects 400     |
| `st52-xss-template`                  | 200/**503**       | 400/**503**     | handler-failed      | Control uses rejected body field `name`; probe also 503                      |
| `st52-prototype-pollution`           | 200/**503**       | 400/400         | malformed-body      | Control uses rejected body field `name`; probe rejected by parser            |
| `st52-command-injection`             | 200/**503**       | 400/**503**     | handler-failed      | Control uses rejected body field `name`                                      |
| `st52-path-traversal`                | 200/**400**       | 400/400         | malformed-body      | Control `GET branding/login` returns 400                                     |
| `st52-unregistered-redirect`         | 303/**404**       | 400/**404**     | none                | `/alpha/authorize` route absent; no decision event                           |
| `st52-cross-tenant-slug-and-id`      | 200/**503**       | 404/404         | resource-not-found  | Control uses rejected body field `name`                                      |
| `st53-untrusted-forwarded-host`      | 200/200           | 200/200         | none                | Completion record only; `/health` emits no decision event                    |
| `st53-untrusted-forwarded-proto`     | 200/200           | 200/200         | none                | Same                                                                         |
| `st53-untrusted-forwarded-client-ip` | 200/200           | 200/200         | none                | Same                                                                         |
| `st54-unsupported-method`            | 200/**503**       | 405/405         | none                | nginx answers `TRACE` with HTML 405; no `Allow`, no request id, no Porta log |
| `st54-malformed-json`                | 200/**503**       | 400/400         | malformed-body      | Control uses rejected body field `name`                                      |
| `st54-oversized-json`                | 200/**503**       | 413/413         | body-too-large      | Control uses rejected body field `name`                                      |
| `st54-double-encoded-tenant-path`    | 200/200           | 404/**500**     | handler-failed      | Double-encoded path produces an internal error                               |

## Findings

| #   | Finding                                                                                                                                                                                                                               | Evidence                                                                                                                                                                  | Class                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| E1  | The authorized user-update control body `{"name":"…"}` is not accepted by the API; `{"nickname":"…"}` returns 200. The unknown field leaves an empty update, which the mutation boundary turns into `503 admin_mutation_unavailable`. | `packages/server/src/routes/users.ts:97-122` (`name` absent); live probe `{name}->503`, `{nickname}->200`; `packages/server/src/middleware/admin-mutation-audit.ts:71-85` | Requirement/API mismatch + product wrong-status (should be 400) |
| E2  | `GET …/branding/login` returns 400, not the control's expected 200.                                                                                                                                                                   | live probe                                                                                                                                                                | Requirement route mismatch                                      |
| E3  | `/alpha/authorize` is not a route; the probe returns 404.                                                                                                                                                                             | live probe; no `authorize` route in `packages/server/src/server.ts`                                                                                                       | Requirement route mismatch                                      |
| E4  | nginx answers `TRACE` with its own HTML 405 before Porta; no `Allow` header, no `X-Request-Id`, no Porta completion record.                                                                                                           | live probe                                                                                                                                                                | Harness/ingress behavior vs oracle                              |
| E5  | A double-encoded tenant path produces `500 Internal Server Error`.                                                                                                                                                                    | live probe; `handler-failed`                                                                                                                                              | Possible product defect                                         |
| E6  | `/health` and unmatched routes emit a completion record but no `security.decision.v1`; the completion record still carries all five required symbolic fields.                                                                         | live probe; `request-logger.ts:67-73`; `decision-context.ts:114-119`                                                                                                      | Adapter handles via completion fallback                         |

## Log correlation

Structured JSON capture works with `PORTA_LOG_FORMAT=json` (AR-5). Every request that reaches Porta
correlates through `X-Request-Id`, and the required symbolic fields
(`synthetic-correlation-id`, `event-class`, `public-method`, `public-route-class`,
`public-outcome-class`) are present from either the decision or the completion record. Correlation
is therefore not the blocker; the control/probe mismatches above are.

## Consequence

The immutable raw oracle cannot pass as authored. E1–E3 are requirement defects (the declared
request does not match the API). E5 is a probable product defect. E4 is an ingress behavior the
oracle does not model. No requirement or product change has been made; these await a ruling (AR-6).
