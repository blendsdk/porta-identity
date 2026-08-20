# Test Assurance Must/Should Closeout

> **Date**: 2026-08-20
> **Status**: Must/Should closeout complete; blocked/deferred ledger retained
> **Authority**: User-prioritized Must/Should closeout
> **CodeOps Artifact Schema**: 1

> **Historical checkpoint**: The user resumed DEF-20 on 2026-08-20. This document remains the
> verified Must/Should checkpoint; current execution state is owned by the execution plan.

## Scope and conclusion

This closeout preserves the assurance capabilities and findings already delivered while deferring
reliability/promotion extras so Porta feature development can resume. It is not certification and
does not prove that Porta has no exploit paths.

The executable traceability authority contains 79 Must requirements, 94 sentinel cases, 89 task
nodes, 79 claims, and one exact mapping per Must requirement. The seven requirement documents also
contain 15 Should requirements. Should items remain descriptive unless an exact executable mapping
already exists; this closeout does not upgrade an unmapped Should into verified evidence.

## Delivered assurance surface

| Area | Delivered boundary |
| --- | --- |
| Governance | Typed claims/evidence, exact traceability, immutable specification seams, named gaps |
| Harness | Run/worktree-fenced lifecycle, deterministic fixtures/reset, operational and production-security profiles |
| Coverage | Assembled-server V8 attribution with source/image/dependency provenance and explicit exclusions |
| Fault sensitivity | Exact curated tuples plus a clean-revision aggregate catalog campaign; two current tuples killed independently |
| Compatibility | Clean packed SDK/CLI archives, dist-only resolution, isolated CLI credentials, independently observed selected effects |
| Risk slices | Tenant/admin, protocol, human-authentication, validation/exposure, and administrative-data public-boundary evidence |
| Evidence safety | Owner-only artifacts, redaction, bounded diagnostics, cleanup/recovery accounting, primary-tree checks |

## Current gap and defect ledger

The feature roadmap is the authoritative detailed ledger. At closeout it contains 20 DEF records:
2 resolved, 11 blocked, and 7 deferred. The most consequential unresolved product or contract
items are:

| Item | Status | Consequence |
| --- | --- | --- |
| Authorization-code atomic consumption | Blocked | Redis consumption remains a read/modify/write product boundary requiring separate remediation |
| Cross-tenant magic-link acceptance | Blocked | An Alpha artifact was accepted through Bravo's route; the tenant-binding claim remains open |
| TOTP same-window replay | Blocked | Current stateless verification has no approved consumed-step contract |
| Bulk/import/export semantics | Blocked | Duplicate, rollback, partial-result, provenance, and sensitivity behavior lacks product authority |
| Correlated rejection events | Blocked | Some malformed/admin denials cannot supply one complete privacy-safe decision event |
| Public nginx version disclosure | Blocked | Operational and production ingress expose a product/version fingerprint |
| Dependency failure/reconnection | Blocked | Database/cache interruption can time out and database recovery requires Porta restart |
| SDK cursor pagination | Blocked | Packed SDK `pageSize=2` and raw `limit=2` produce different cardinality |
| Administrative session identifiers | Blocked | Packed session listing exposes a fixture-protected identifier |

No blocked or deferred item receives assured status. Product remediation remains separate from this
structural/assurance branch.

## User-authorized deferment at this checkpoint

DEF-20 defers the mutation-tool pilot, exhaustive command×outcome/signal matrix, 100-run stability
campaign, local ratchets, exhaustive aggregate/UI reruns, and CI-promotion proposal. These are not
required to continue local Porta feature implementation. They are required before claiming that the
new assurance commands are stable enough for additional blocking CI, release, or merge-policy use.
The later resumption does not retroactively change the evidence or conclusions recorded here.

## Protected-scope proof

The final Phase 10 implementation diff from its recorded baseline contains only
`test-harness/assurance/**` and this feature's CodeOps artifacts. It does not modify the read-only CI
workflow, publishing, deployment, release, merge-policy, or Porta product source. The closeout diff
is limited to traceability authority and maintainer documentation.

## Final verification

| Check | Result |
| --- | --- |
| Clean aggregate catalog campaign | Passed: run `3b79f1ed-c3e6-4508-ad25-98b837443623`, 2 killed, 0 survived/invalid/infrastructure/timeout/not-run, mode 0600, zero residue |
| Traceability validation | Passed: clean revision `00e4a6f2`, run `922dea63-bae5-4852-9375-155997af9cbe`, owner-only manifest/result |
| Structure tests | Passed: 68/68 through final `yarn verify` |
| Aggregate campaign specification/implementation suite | Passed: 12/12 |
| Retained SPA/BFF harness | Passed: run `4a028f1c-ce14-43dc-b105-575e975549c4`, 6/6, no labelled container residue |
| `yarn verify` | Passed: 233 server files / 3,382 cases; 31 SDK files / 404 cases; 29 CLI files / 355 cases; four Turbo tasks successful |

All retained rows passed. Empty owner directories may remain under the ignored assurance-runtime
root, but no run record, disposable worktree, labelled container, leased port, or recovery command
remains. Deferred and blocked rows above remain open and cannot be converted into success by
narrowing an oracle.
