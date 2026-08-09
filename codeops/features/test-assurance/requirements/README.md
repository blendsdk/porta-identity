# Porta Test Assurance — Requirements Documents

> **Project**: Porta — release-safe functional and security assurance program
> **Status**: Complete
> **Created**: 2026-08-09
> **Architecture**: Node.js 22+, TypeScript ESM, Koa, oidc-provider, PostgreSQL, Redis, Vitest, Playwright, Docker
> **CodeOps Artifact Schema**: 1

---

## Overview

This requirements set defines how Porta will turn its large inherited test estate into defensible
evidence of functional correctness and security. It preserves ordinary development and publishing,
retains the existing 4,307-test baseline, and improves trust incrementally through independent
oracles, exact black-box assertions, deterministic fixtures, attributable coverage, and controlled
fault sensitivity.

The existing `test-harness` is the single external system-assurance environment. Existing unit,
integration, E2E, pentest, UI, SDK, CLI, and repository tests remain in place. Confirmed product
defects are reproduced and routed to separately authorized product work; they are never silently
fixed or reclassified as expected behavior by this feature (AR #3, AR #4, AR #19).

## Selected Domain Lenses

| Lens                       | Repository evidence                                                | Requirements impact                                                                            |
| -------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Web application            | Browser, HTTP/OIDC, sessions, roles, tenant resources              | Actor/resource authorization, token/session lifecycle, CSRF/CORS/CSP, exact external errors    |
| Distributed and concurrent | PostgreSQL, Redis, caches, multiple processes, email, rate limits  | Replay, stale state, duplicate requests, reset atomicity, cache invalidation, process coverage |
| Data and migration         | Persistent schema, migrations, import/export, client compatibility | Fixture ownership, destructive-test recovery, mixed-version evidence, import/export assurance  |

## Assurance Reference Models

| Reference                         | Adopted use                                                                                                                    | Explicit boundary                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| OpenID Connect Core 1.0           | Normative OIDC requests, responses, tokens, UserInfo, nonce, issuer, audience                                                  | No certification claim                                |
| RFC 9700 (OAuth 2.0 Security BCP) | Redirect, PKCE, refresh-token replay, client and authorization-server security                                                 | Only applicable Porta flows                           |
| RFC 8725 (JWT BCP)                | Algorithm, signature, issuer, audience, key-reference, and substitution defenses                                               | Porta's ES256 policy remains stricter where specified |
| OWASP ASVS 5.0.0                  | Version-qualified web-control catalog for relevant authentication, session, access-control, validation, and error requirements | No claim that every ASVS level is implemented         |
| Mutation testing practice         | Controlled evidence that selected tests detect broken behavior                                                                 | Curated risk slices before automation or broad scores |

These references supply independent inputs to requirements and tests; they do not replace Porta's
approved product contracts or security invariants (AR #7, AR #24).

## Stakeholders

| Role                       | Assurance need                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| End user                   | Authentication, recovery, consent, session, and 2FA behavior works without identity leakage or takeover paths  |
| Organization administrator | Administrative actions are authorized, tenant-scoped, auditable, and resistant to privilege escalation         |
| Application developer      | OIDC endpoints and tokens conform to documented contracts for public and confidential clients                  |
| SDK/CLI consumer           | Published artifacts interoperate with the supported Porta server over public interfaces                        |
| Porta maintainer           | Fast feedback remains available while audited slices improve incrementally                                     |
| Release owner              | Evidence is reproducible, attributable, non-vacuous, and does not introduce unreliable historical gates        |
| Security reviewer          | Every critical claim has a threat, independent oracle, exact tests, fault-sensitivity evidence, and named gaps |

## Domain Glossary

| Term                | Definition                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Assurance claim     | A bounded statement about externally observable Porta behavior or a security control, tied to authoritative requirements and evidence |
| Independent oracle  | Expected behavior derived from requirements, normative standards, or independently observable state—not Porta implementation logic    |
| Risk slice          | A bounded group of related assurance claims audited and closed together                                                               |
| Sentinel test       | A selected test whose exact assertion is accepted as evidence for an assurance claim                                                  |
| Curated fault       | A reviewed, reproducible change that intentionally violates one control to prove that designated tests fail                           |
| Fault kill          | Failure of the designated assertion for the intended reason; build, setup, or unrelated failure does not count                        |
| Evidence bundle     | Machine-readable and human-readable results bound to a commit/image, fixture manifest, tests, coverage, faults, and redacted logs     |
| Attributed coverage | Coverage mapped to the exact source/build/process that executed, with exclusions and incomplete areas declared                        |
| Named gap           | A reviewed surface or requirement lacking sufficient evidence, recorded explicitly rather than treated as passing                     |
| Release-safe        | Normal verification, development, and publishing remain usable while expensive assurance work runs in separate staged lanes           |

## Document Index

| #         | Document                                                                                                              | Description                                                                | Depends On          |
| --------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------- |
| **AR**    | [Ambiguity Register](00-ambiguity-register.md)                                                                        | Zero-Ambiguity Gate and delegated decisions                                | —                   |
| **RD-01** | [Assurance Governance and Traceability](RD-01-assurance-governance-and-traceability.md)                               | Claims, oracle authority, evidence, defect routing, and audit semantics    | —                   |
| **RD-02** | [Harness Foundation and Fixtures](RD-02-harness-foundation-and-fixtures.md)                                           | Single harness, deterministic state, tenant actors, and project boundaries | RD-01               |
| **RD-03** | [Coverage Attribution and Ratchets](RD-03-coverage-attribution-and-ratchets.md)                                       | Honest process coverage, baselines, exclusions, and staged enforcement     | RD-01, RD-02        |
| **RD-04** | [Functional Contracts and Compatibility](RD-04-functional-contracts-and-compatibility.md)                             | Functional audit and live packed SDK/CLI compatibility                     | RD-01, RD-02        |
| **RD-05** | [Security Risk-Slice Assurance](RD-05-security-risk-slice-assurance.md)                                               | P0/P1 threat-driven specification and black-box verification               | RD-01, RD-02        |
| **RD-06** | [Fault Sensitivity and Mutation](RD-06-fault-sensitivity-and-mutation.md)                                             | Curated faults, mutation pilot, survivor handling, and kill evidence       | RD-01, RD-02, RD-05 |
| **RD-07** | [Continuous Assurance and Non-Functional Requirements](RD-07-continuous-assurance-and-non-functional-requirements.md) | CI lanes, reliability, privacy, maintainability, and completion policy     | RD-01–RD-06         |

## Dependency Graph

```text
RD-01 Governance and traceability
  └── RD-02 Harness foundation and fixtures
        ├── RD-03 Coverage attribution and ratchets
        ├── RD-04 Functional contracts and compatibility
        └── RD-05 Security risk-slice assurance
              └── RD-06 Fault sensitivity and mutation
                    └── RD-07 Continuous assurance and NFR
```

## Suggested Implementation Order

| Phase                         | Documents     | Description                                                                        |
| ----------------------------- | ------------- | ---------------------------------------------------------------------------------- |
| **A: Foundation**             | RD-01 → RD-03 | Establish authoritative evidence, deterministic harness state, and honest coverage |
| **B: Critical assurance**     | RD-05 → RD-06 | Audit P0 then P1 controls and prove tests detect curated failures                  |
| **C: Consumer compatibility** | RD-04         | Exercise functional contracts and packed SDK/CLI artifacts against live Porta      |
| **D: Continuous adoption**    | RD-07         | Stabilize lanes, ratchets, evidence retention, and changed-code rules              |

## Integration Map

| Integration     | Protocol                                  | Direction                                | Owner        |
| --------------- | ----------------------------------------- | ---------------------------------------- | ------------ |
| Porta container | HTTPS/OIDC/admin API                      | Test client → Porta                      | RD-02, RD-05 |
| PostgreSQL      | PostgreSQL protocol                       | Fixture controller ↔ database            | RD-02        |
| Redis           | Redis protocol                            | Fixture controller ↔ cache/session store | RD-02        |
| MailHog         | SMTP + HTTP API                           | Porta → SMTP; harness → captured mail    | RD-02, RD-05 |
| SPA/BFF         | OIDC authorization code                   | Bidirectional through browser            | RD-04, RD-05 |
| Packed SDK      | Public package API + HTTP                 | Consumer → Porta                         | RD-04        |
| Packed CLI      | Compiled binary + browser callback + HTTP | Consumer → Porta                         | RD-04        |
| V8 coverage     | Raw V8 JSON + source maps                 | Porta process → evidence                 | RD-03        |

## Key Decisions

| Decision     | Choice                                                        | Authority      |
| ------------ | ------------------------------------------------------------- | -------------- |
| Delivery     | Incremental and release-safe                                  | AR #2          |
| Harness      | Extend the existing harness only                              | AR #3, AR #12  |
| Oracle       | Requirements, contracts, invariants, and standards            | AR #7          |
| Legacy proof | Controlled faults or mutation when natural red is unavailable | AR #15, AR #16 |
| Coverage     | Attributed evidence, then exact ratchets                      | AR #13, AR #14 |
| Defects      | Reproduce and route separately                                | AR #19, AR #26 |

## How to Use These Documents

1. Use the cross-RD implementation plan for the foundation and risk-slice order.
2. Execute specification-test tasks before implementation tasks.
3. Treat each RD as the owning behavioral contract; plans reference rather than restate it.
4. Record product defects separately and keep the affected assurance claim incomplete.
5. Promote advisory checks only through the staged evidence policy in RD-07.
