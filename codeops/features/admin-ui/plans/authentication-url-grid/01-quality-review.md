# Unified Authentication URL Grid Quality Review

> **Status**: Passed after one bounded fix and re-review
> **Last Updated**: 2026-09-08 22:50
> **CodeOps Artifact Schema**: 1

## Scope

- **Baseline tree:** `266cc5d90b18cc364abe0c9609c59b8775ad7e3a`
- **Scope mode:** Strict
- **Affected boundary:** OIDC client Authentication tab, focused URL dialogs, local collection
  projection, and existing ETag-aware client update orchestration
- **Explicitly excluded:** Server, SDK, dependencies, and backend API changes

## Verification

| Check | Result |
| --- | --- |
| Node 24 CLI verification | Passed after the review fix: 79 files and 1,094 tests, then build |
| `git diff --check` | Passed |
| Root `yarn verify` | Not run, by explicit user instruction for these UI experiments |

## Independent review

| ID | Severity | Finding | Status |
| --- | --- | --- | --- |
| RV-001 | Major | A redirect ending in a bare `#` passed because `URL.hash` is empty even when the delimiter exists. | Resolved: reject every raw `#`; bounded re-review clean |
| RV-002 | Minor | Immutable specifications omitted complete syntax, 1/10/11 count, and allowed cross-type duplicate boundaries. | Resolved: immutable boundary matrix added; bounded re-review clean |
| Security review | — | No findings under the auth-protocol and tenant-isolation lenses. | Clean |

## Approved ruling

Reject any raw `#` in redirect and post-logout values, and add immutable table-driven cases for
empty values, malformed URLs, wildcards, empty and non-empty fragments, invalid origins, the
1/10/11 count boundaries, and the allowed same value across different types. This is a local
validation and test correction; it adds no abstraction or backend behavior.

The user approved this ruling. The correctness re-review confirmed RV-001 and RV-002 are resolved
with no introduced findings. The security re-review confirmed the change only tightens redirect
validation and leaves tenant ownership, capabilities, ETags, cancellation, and secret handling
unchanged.
