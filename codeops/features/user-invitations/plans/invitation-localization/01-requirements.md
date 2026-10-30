# Requirements: Invitation Localization

> **Parent**: [Index](00-index.md)
> **Source**: GitHub #179 and the explicit decisions in [the ambiguity register](00-ambiguity-register.md)
> **CodeOps Artifact Schema**: 1

## Feature Overview

This document owns the prospective requirements. It adds a complete Dutch authentication locale
and a localized invitation experience without changing who may invite or accept an invitation.
It supersedes only the English-only assertions named in AR #12, not historical delivery evidence.

## Functional Requirements

| ID   | Must have                                                                                                                                                                                          | Authority      |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| R-1  | Deliver a complete formal-Dutch `nl` bundle alongside `en`, with every authentication namespace/key and interpolation placeholder covered. Default values remain English.                          | AR #1, #4, #10 |
| R-2  | Select email language from supported explicit invitation input, organization default, global default, then English. Sent email and preview share that selection and copy.                          | AR #6, #11     |
| R-3  | Localize invitation subject variants, HTML, plaintext, action/instruction labels and lifetime units. Keep names, branding and personal messages literal, and retain existing lifetime arithmetic.  | AR #1, #6, #10 |
| R-4  | Select valid acceptance-page language from browser preference, stored invitation locale, organization default, global default, then English. Keep OIDC priority order unchanged.                   | AR #2, #11     |
| R-5  | Localize confirmation, password form, success, document titles and all invitation presentation errors. Password policy itself and other callers' English validation messages remain unchanged.     | AR #1, #10     |
| R-6  | Preserve generic rejection equality, tenant scoping, CSRF-before-lookup, non-mutating GETs and single-use atomic acceptance. Language must not reveal the rejection cause.                         | AR #8          |
| R-7  | Preserve legacy template variables and independent tenant HTML/plaintext overrides. Await tenant translation resources and isolate every render's language/overrides.                              | AR #6, #7      |
| R-8  | Normalize regional language tags, ignore unsupported/malformed browser candidates, and never pass unselected locale paths to filesystem lookup. Missing translation content falls back to English. | AR #7, #8, #11 |
| R-9  | Preserve stored explicit/null invitation locale, pending rows, expiry, transactions and delivery outcomes. Require no migration, backfill or additional API fields.                                | AR #9          |
| R-10 | Document supported languages, fallback order, custom-template compatibility, source/build language installation, and the approved rollout/rollback precautions.                                    | AR #4, #9      |

## Technical Requirements

- **Compatibility:** Global `default_locale` accepts only canonical native `en`/`nl`; existing
  defaults, eighteen-key catalog, numeric policy and authorization remain unchanged. Rendering
  normalization is not configuration-value coercion (AR #9, #11, #12).
- **Security:** Use selected allowlisted locale identifiers, parameterized existing token/user
  lookups and ordinary escaped HTML. Do not log submitted passwords, raw tokens, email addresses,
  personal messages, translations or infrastructure errors as new diagnostics (AR #8).
- **Isolation:** No global `changeLanguage`, shared mutable per-request translation data, new
  cache/invalidation mechanism, mutation retry, or concurrency feature in the Admin UI (AR #7).
- **Performance:** Reuse startup-loaded bundles and existing per-translator override loading. No
  new service, network lookup, polling or background work. No invented latency SLA (AR #4, #13).
- **Quality:** Keep configured coverage thresholds and the project's standard targets: core
  behavior 90%, support 80%, presentation/configuration 60%. Cover the specified branches with
  focused tests; no separate coverage/mutation campaign is required for this feature (AR #5, #13).

## Out of Scope

Other email-type localization, user-selected language controls, extra languages beyond Dutch,
runtime locale installation, translated personal messages, language snapshots/backfills, new
permission schemes, infrastructure or schema changes, Admin UI coordination, and actual deployment
or release are not executable work (AR #4, #9, #10).

## Acceptance Criteria

The issue's five outcomes are: localized email; stored-locale acceptance fallback; packaged Dutch;
retained English fallback; and proven/documented selection behavior. The exact input/output
oracles are owned by [07-testing-strategy.md](07-testing-strategy.md), ST-01–ST-30. Completion
requires those cases, the approved local/security gates, required phase review and full CI
verification. This document has no implementation-progress checklist (AR #5, #12, #13).
