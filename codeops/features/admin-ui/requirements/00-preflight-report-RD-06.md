# Preflight Report: RD-06 Organization Settings and Branding

> **Status**: ✅ PASSED — 15 findings resolved (1 critical, 10 major, 4 minor)
> **Iteration**: 2 (post-resolution scan)
> **Artifact**: single requirement at `requirements/RD-06-organization-settings-and-branding.md`
> **Artifact SHA-256**: `10405c9b08c8578979acc104c11bd93b4722ee1dd95917e97268f8377cafd8af`
> **Codebase Grounded**: 30 source, test, migration, and configuration files examined; 20 primary references verified
> **Scope Mode**: strict
> **Last Updated**: 2026-09-10
> **CodeOps Artifact Schema**: 1

> **SAME-SESSION REVIEW:** RD-06 was created in the current session, so same-agent bias is elevated.
> Independent clustered auditors and an independent recommendation challenger reviewed the findings.

## Audit Scope

- **Target:** `codeops/features/admin-ui/requirements/RD-06-organization-settings-and-branding.md` only.
- **Context:** the Admin UI ambiguity register, requirements index, feature roadmap, project guidance,
  CodeOps configuration, and directly relevant server, SDK, CLI, migration, template, proxy, and test files.
- **Authorized baseline:** the active-organization Overview, Authentication, and Branding workspace;
  bounded SDK/server asset-contract repair; public branding delivery; and template/email integration.
- **Excluded:** template or CSS editors, image processing, storage abstractions, multipart compatibility,
  CDN/object storage, background work, generalized concurrency machinery, and user-level 2FA management.

## Codebase Context Summary

Porta is a Node.js TypeScript ESM identity platform with a Koa/`oidc-provider` server, PostgreSQL,
Redis, a public SDK, and a JSVision terminal Admin UI. Existing organization, 2FA-policy, branding,
template, email, and security-header paths were traced end to end.

The principal alignment problems are that the 2FA scope was not explicit, the organization and 2FA
writes share one organization ETag while the SDK hides that ETag, and the static CSP does not
account for the existing TOTP QR data image. The public asset route also needs an explicit mount
and tenant-status contract because the ordinary tenant resolver rejects suspended organizations.

## Summary by Dimension

|   # | Dimension              | Findings | Highest severity |
| --: | ---------------------- | -------: | ---------------- |
|   1 | Ambiguities            |        3 | 🟠 Major         |
|   2 | Implicit Assumptions   |        4 | 🟠 Major         |
|   3 | Logical Contradictions |        4 | 🟠 Major         |
|   4 | Completeness Gaps      |        8 | 🔴 Critical      |
|   5 | Dependency Issues      |        3 | 🟠 Major         |
|   6 | Feasibility Concerns   |        4 | 🟠 Major         |
|   7 | Testability            |        2 | 🟠 Major         |
|   8 | Security Blind Spots   |        5 | 🔴 Critical      |
|   9 | Edge Cases             |        5 | 🟠 Major         |
|  10 | Scope Creep Indicators |        0 | —                |
|  11 | Ordering & Sequencing  |        1 | 🟠 Major         |
|  12 | Consistency            |        4 | 🟠 Major         |
|  13 | Codebase Alignment     |       11 | 🔴 Critical      |

Counts overlap where one root cause affects several dimensions. Findings below are deduplicated.

## Summary by Severity

| Severity       | Count | Status   |
| -------------- | ----: | -------- |
| 🔴 Critical    |     1 | Resolved |
| 🟠 Major       |    10 | Resolved |
| 🟡 Minor       |     4 | Resolved |
| 🔵 Observation |     0 | —        |

## Findings

### PF-001: The proposed 2FA policy does not govern every authentication path 🔴 CRITICAL

**Dimensions:** Security Blind Spots, Completeness Gaps, Codebase Alignment

**Location:** AC-06, AC-07; Domain Model; Security and Privacy Constraints

**Codebase evidence:** The magic-link completion path finishes login without invoking 2FA
(`packages/server/src/routes/interactions.ts:474-492`), while password login performs the challenge
(`packages/server/src/routes/interactions.ts:813-879`). The 2FA service also chooses an already
enrolled user's current method rather than enforcing a newly required email or TOTP method
(`packages/server/src/two-factor/service.ts:701-748`).

**Problem:** AC-06 does not define whether its 2FA policy applies to passwordless magic-link login.
Treating magic link as the first factor would force a second step even though the user already
proved control of the email account. Requiring email OTP after an emailed magic link would repeat
the same possession factor and delivery channel without meaningful security value.

**Options:**

| Option | Description                                                                                                                                                                                                                                           | Pros                                                                                                 | Cons                                                                                                                                           |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | Apply the organization 2FA policy only after username/password authentication. Treat a valid magic link as a complete passwordless login and do not add an email-OTP or TOTP step. State this boundary explicitly in the requirement and UI guidance. | Avoids redundant prompts, matches the factor model users expect, and keeps the implementation small. | A user can choose magic link instead of the stricter password-plus-2FA route when both login methods are enabled.                              |
| B      | Apply the 2FA policy after every login method, including magic link.                                                                                                                                                                                  | Gives every login route the same number of explicit checks.                                          | Adds friction; magic-link plus email OTP repeats the same factor and channel, while mandatory TOTP changes the expected passwordless workflow. |
| C      | Remove 2FA-policy management from RD-06 and defer it to RD-07.                                                                                                                                                                                        | Keeps RD-06 smaller.                                                                                 | Delays a useful existing organization control.                                                                                                 |

**Recommendation:** Option A. In Porta, this setting is a second step for username/password login,
not a general authentication-assurance policy. A magic link proves possession of the email account
and is accepted as a complete passwordless method. Repeating email possession adds no independent
factor, and forcing TOTP would undermine the deliberately low-friction passwordless flow.

**Confidence:** High. **Hardening:** revised after the user's factor-model challenge. The remaining
risk is explicit and operator-controlled: when both methods are enabled, users may choose the
passwordless route rather than password plus 2FA.

**User Decision:** Resolved on 2026-09-10. The user selected Option A: organization 2FA applies only
to username/password authentication; magic-link authentication remains a complete passwordless
method without a redundant second prompt.

### PF-002: The requirement incorrectly describes 2FA as a client-inherited default 🟠 MAJOR

**Dimensions:** Logical Contradictions, Codebase Alignment

**Location:** Domain Model and glossary; AC-07

**Codebase evidence:** OIDC clients have an optional login-method override
(`packages/server/src/clients/types.ts:71-81,158-166`). There is no corresponding client-level 2FA
override; the existing 2FA policy is organization-wide.

**Problem:** The guidance says both login methods and 2FA affect only clients configured to inherit.
That is true for login methods but false for 2FA.

**Recommendation:** Describe login methods as inheritable client defaults and 2FA as an
organization-wide authentication policy. Do not add client-level 2FA overrides.

**Confidence:** High. **Hardening:** only the existing data model was considered viable.
**Challenger:** converged.

**User Decision:** Resolved on 2026-09-11. The user accepted the recommendation.

### PF-003: One Authentication Save can conflict with itself 🟠 MAJOR

**Dimensions:** Ordering & Sequencing, Feasibility Concerns, Codebase Alignment

**Location:** AC-06, AC-08, AC-20; Minimum-Sufficient Design

**Codebase evidence:** Organization updates and 2FA-policy updates both use the organization's
`updatedAt` value as their ETag (`packages/server/src/routes/organizations.ts:253-262` and
`packages/server/src/routes/two-factor-admin.ts:290-360`), and the database updates that timestamp
(`packages/server/migrations/002_organizations.sql:31-35`). The SDK 2FA GET discards the ETag and
PUT cannot send `If-Match` (`packages/sdk/src/domains/two-factor.ts:21-35,67-76`).

**Problem:** Sending both changed resources with the same initial ETag makes the second write stale.
However, both endpoints make `If-Match` optional for backward compatibility. The Admin UI does not
need optimistic concurrency because Porta is not expected to have concurrent administrators.

**Recommendation:** Do not send ETags from this Admin UI and do not extend the 2FA SDK ETag surface.
Send only changed settings through the two ordinary endpoints. If one call succeeds and the other
fails, reload both displayed resources once so the UI reflects the database. Do not retry either
mutation automatically.

**Confidence:** High. **Hardening:** simplified after the user clarified Porta's single-admin
operating model and code review confirmed that both server preconditions are optional.

**User Decision:** Resolved on 2026-09-11. The user rejected optimistic-concurrency machinery for
this single-admin application and accepted the simplified ordinary-save behavior.

### PF-004: The UI cannot predict the super-admin organization's 2FA restriction 🟠 MAJOR

**Dimensions:** Completeness Gaps, Codebase Alignment

**Location:** AC-01, AC-06, AC-19; Admin UI and JSVision

**Codebase evidence:** The built-in Org Admin role includes organization update capability
(`packages/server/src/lib/admin-permissions.ts:145-156`), but the server rejects changes to the
super-admin organization's 2FA policy unless the actor is a super-admin
(`packages/server/src/routes/two-factor-admin.ts:330-340`). The CLI capability snapshot loses this
actor-role distinction (`packages/cli/src/admin/session-service.ts:272-313`).

**Problem:** A user can appear authorized by capability while Save predictably returns 403.

**Recommendation:** Do not add another session capability or actor-role signal. Keep the control
enabled for actors with `admin:org:update`; if the server applies its special super-admin-
organization restriction, show the ordinary sanitized authorization failure and reload. This is a
rare control-plane edge case, and the server remains authoritative.

**Confidence:** High. **Hardening:** simplified after proportionality review. Perfectly predicting
this one server-only restriction does not justify expanding the Admin session contract.

**User Decision:** Resolved on 2026-09-11. The user accepted the simplified recommendation.

### PF-005: SVG validation and delivery safety are not specified consistently 🟠 MAJOR

**Dimensions:** Logical Contradictions, Security Blind Spots, Codebase Alignment

**Location:** AC-13; Verification boundary; Security and Privacy Constraints; Edge Cases

**Codebase evidence:** The branding service does not invoke the image validator
(`packages/server/src/lib/branding-assets.ts:61-92`). The existing SVG sanitizer is a small regex-
based cleanup (`packages/server/src/lib/image-validator.ts:65-72,174-225`), and current binary
signature checks are short, including WebP recognition by RIFF alone
(`packages/server/src/lib/image-validator.ts:47-53,139-171`).

**Problem:** AC-13 says sanitized SVG is stored, while the edge contract says unsafe content is
rejected. The existing regex cleanup cannot promise general SVG sanitization. However, Porta uses
branding SVGs as image resources, where browsers disable script, interaction, and external
resources. The only additional case to protect is direct navigation to the public SVG URL.

**Options:**

| Option | Description                                                                                                                                                                                                                                                                          | Pros                                                                  | Cons                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| A      | Keep SVG and run it through the existing image validator before storage. Serve it only from the image endpoint with `nosniff` and an SVG-specific restrictive CSP/sandbox so direct navigation cannot execute active content or load external resources. Templates use only `<img>`. | Preserves SVG with no new dependency, parser, or sanitizer framework. | Requires exact response-header tests and prohibits document-style SVG embedding.                |
| B      | Add a parser-based SVG allowlist sanitizer before storage.                                                                                                                                                                                                                           | Can produce a reduced SVG subset.                                     | Adds a dependency, transformation rules, and a much larger compatibility/security test surface. |

**Recommendation:** Option A. SVG-as-image already runs in the browser's secure image mode. Reusing
the existing validator plus response isolation covers this trusted-admin feature without adding an
XML parser or pretending to provide a general untrusted-upload sanitizer.

**Confidence:** High. **Hardening:** revised after rechecking the browser SVG processing model and
the administrator-controlled upload boundary. A sanitizer subsystem is disproportionate here.

**User Decision:** Resolved on 2026-09-10. The user requires SVG support and rejected unnecessary
sanitizer complexity. Option A was selected.

### PF-006: The CSP requirement would break the existing TOTP QR image 🟠 MAJOR

**Dimensions:** Security Blind Spots, Completeness Gaps, Codebase Alignment

**Location:** AC-17; Security and Privacy Constraints

**Codebase evidence:** The TOTP setup template renders a server-generated QR code as a `data:` image
(`packages/server/templates/default/pages/two-factor-setup.hbs:13`). The current HTML CSP is static
and has no `img-src` directive (`packages/server/src/middleware/security-headers.ts:97-98`).

**Problem:** Limiting `img-src` to self and branding fallback origins would block the QR image.

**Options:**

| Option | Description                                                                                        | Pros                                       | Cons                                                         |
| ------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| A      | Allow `data:` in `img-src` on every authentication page.                                           | Simplest CSP computation.                  | Broadens image policy on pages that do not need data images. |
| B      | Allow `data:` only on the TOTP setup response; use self plus validated branding origins elsewhere. | Preserves the QR flow and least privilege. | Requires one page-specific CSP signal.                       |
| C      | Add a same-origin QR image route.                                                                  | Avoids `data:` entirely.                   | Adds a route and lifecycle/security surface solely for CSP.  |

**Recommendation:** Option A. Permit `data:` only in `img-src`; this does not permit data scripts,
frames, styles, or connections. A page-specific signal is unnecessary complexity for an image
source already generated by Porta.

**Confidence:** High. **Hardening:** simplified after proportionality review. The narrower page-
specific policy provides little practical protection while adding dynamic CSP state.

**User Decision:** Resolved on 2026-09-11. The user accepted the simplified recommendation.

### PF-007: Branding lookup failure could break authentication or recovery email 🟠 MAJOR

**Dimensions:** Edge Cases, Security Blind Spots, Feasibility Concerns

**Location:** AC-16, AC-17; Server and persistence; Edge Cases

**Codebase evidence:** Current page and email builders consume organization branding already in
memory (`packages/server/src/routes/interactions.ts:188-220` and
`packages/server/src/auth/email-service.ts:89-101,126-137`). Resolving uploaded assets introduces a
database lookup into authentication and email flows.

**Problem:** The RD does not say what happens when that optional lookup fails. Failing closed would
make decoration availability a login or recovery-email dependency.

**Recommendation:** Fail soft: fall back first to already validated configured URL/text settings,
then to Porta defaults. Emit only a bounded sanitized diagnostic. Do not retry, poll, or add a
background mechanism. The direct public asset request may return a fixed server error.

**Confidence:** High. **Hardening:** preserves authentication availability without hiding public
asset-route failures. **Challenger:** converged.

**User Decision:** Resolved on 2026-09-11. The user accepted the recommendation.

### PF-008: The SDK branding repair leaves a false `updateSettings()` contract 🟠 MAJOR

**Dimensions:** Completeness Gaps, Codebase Alignment

**Location:** AC-09, AC-14; SDK repair

**Codebase evidence:** The SDK declares that `updateSettings()` returns `BrandingAssets`
(`packages/sdk/src/domains/branding.ts:11-29,41-44`), while the server returns the full Organization
(`packages/server/src/routes/organizations.ts:269-275`). Existing SDK tests assert the wrong shape
(`packages/sdk/tests/domains/branding.test.ts:33-44`), and the CLI calls this method
(`packages/cli/src/commands/org.ts:404-443`).

**Problem:** AC-14 fixes branding asset list/upload methods but leaves another known false contract.

**Recommendation:** Retain `updateSettings()` but make its return type `Organization`, then update
its tests and documentation. Removing it and migrating all callers to `organizations.update()` is
broader with no present benefit.

**Confidence:** High. **Hardening:** chose the smaller truthful compatibility repair.
**Challenger:** converged.

**User Decision:** Resolved on 2026-09-11. The user accepted the recommendation.

### PF-009: Public asset route ordering and suspended-organization lookup are unstated 🟠 MAJOR

**Dimensions:** Dependency Issues, Feasibility Concerns, Codebase Alignment

**Location:** AC-15; Server and persistence

**Codebase evidence:** The OIDC catch-all is explicitly mounted last
(`packages/server/src/server.ts:430-432,440-552`). The normal tenant resolver rejects suspended
organizations (`packages/server/src/middleware/tenant-resolver.ts:44-79`). AC-15 requires assets for
active and suspended organizations.

**Problem:** Mounting after the catch-all or reusing `tenantResolver()` makes the route unreachable
or violates its status contract.

**Recommendation:** Mount a dedicated public branding router before the OIDC catch-all. Give it an
exact slug/status lookup that permits active and suspended organizations and returns the same fixed
404 for unknown, unsupported, and missing cases. Do not weaken the normal tenant resolver.

**Confidence:** High. **Hardening:** this is the only option consistent with both existing routing
and tenant safety. **Challenger:** converged.

**User Decision:** Resolved on 2026-09-11. The user accepted the recommendation.

### PF-010: The verification boundary omits mandatory project gates 🟠 MAJOR

**Dimensions:** Testability, Completeness Gaps, Consistency

**Location:** Verification boundary

**Codebase evidence:** RD-06 changes browser UI, CSP/security behavior, and SDK contracts. Project
guidance requires `yarn test:ui`, a registered production-security assurance harness for CSP claims,
and the relevant clean-revision compatibility selector for SDK contract changes. These commands
exist in the root scripts (`package.json:27,53,58`).

**Problem:** The current text mentions a generic assurance selector but omits the browser and
compatibility gates and does not require the production-security profile.

**Recommendation:** Require `yarn test:ui`, the registered security assurance project with the
`production-security` profile, and the relevant clean-revision `yarn assurance:compat` selector
selected or extended during planning. Retain affected workspace verification and
`yarn test:structure`. Continue to exclude root `yarn verify` under the user's standing order.

**Confidence:** High. **Hardening:** derived directly from project policy and affected boundaries.
**Challenger:** converged.

**User Decision:** Resolved on 2026-09-11. The user accepted the recommendation.

### PF-011: “Server-supported locale values” has no discoverable contract 🟠 MAJOR

**Dimensions:** Ambiguities, Completeness Gaps, Codebase Alignment

**Location:** AC-03

**Codebase evidence:** The organization API accepts any syntactically valid 2–10 character locale
(`packages/server/src/routes/organizations.ts:54-58,74-77`), runtime localization falls back when a
bundle is absent (`packages/server/src/auth/i18n.ts:179-244`), only `en` ships, and no supported-
locale endpoint exists.

**Problem:** The UI cannot populate or validate the promised server-supported set.

**Options:**

| Option | Description                                                                                                                                  | Pros                                             | Cons                                                         |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------ |
| A      | Offer only shipped `en`. If an existing unknown value is loaded, preserve and show it as unsupported until the user explicitly selects `en`. | Honest, simple, and non-destructive; no new API. | Locale choice is currently one item.                         |
| B      | Add a server allowlist/discovery endpoint.                                                                                                   | Supports future runtime locale discovery.        | Adds API and configuration machinery for one shipped locale. |
| C      | Keep a free-form locale field and document fallback.                                                                                         | Matches current permissive API.                  | Users can select a value that has no translated bundle.      |

**Recommendation:** Option A. It reflects the product as shipped without inventing a locale
registry. Future bundles can extend the UI list with the same direct pattern.

**Confidence:** High. **Hardening:** the broader discovery API is not justified by one locale.
**Challenger:** converged.

**User Decision:** Resolved on 2026-09-11. The user accepted the recommendation.

### PF-012: “ETag reload-and-retry” can imply forbidden automatic retry 🟡 MINOR

**Dimensions:** Logical Contradictions, Consistency

**Location:** Minimum-Sufficient Design; AC-20

**Problem:** The summary phrase conflicts with the later explicit prohibition on automatic retry.

**Recommendation:** Remove ETag conflict and retry language from RD-06. The Admin UI does not send
ETags. After a partial or unknown failure, reload displayed state once and leave any later Save to
the user.

**User Decision:** Resolved on 2026-09-11. The user rejected an ETag conflict workflow as needless
for Porta's single-admin operating model.

### PF-013: The shared date formatter is UTC, not local time 🟡 MINOR

**Dimensions:** Consistency, Codebase Alignment

**Location:** AC-03

**Codebase evidence:** `packages/cli/src/admin/admin-date-time.ts:18-28` formats with UTC date/time
methods, and existing workspaces reuse it.

**Problem:** Calling its output local date/time is inaccurate.

**Recommendation:** Require the shared human-readable UTC formatter and label displayed timestamps
as UTC where needed.

**User Decision:** Resolved on 2026-09-11. The user accepted the direct wording correction.

### PF-014: RD-04 is an undeclared dependency 🟡 MINOR

**Dimensions:** Dependency Issues, Consistency

**Location:** document header; Dependencies

**Codebase evidence:** AC-07 relies on the client login-method inheritance completed in RD-04 and
implemented by `packages/server/src/clients/resolve-login-methods.ts:1-13,43-68`.

**Problem:** The header lists only RD-02, which makes the implementation order incomplete.

**Recommendation:** Declare `Depends On: RD-02, RD-04`. Do not add RD-10 because RD-06 only keeps
its separate delete ownership intact.

**User Decision:** Resolved on 2026-09-11. The user accepted the dependency correction.

### PF-015: JSON/base64 rejection rules are not exact enough for the public upload boundary 🟡 MINOR

**Dimensions:** Ambiguities, Security Blind Spots, Testability

**Location:** AC-12–AC-14, AC-18; Security and Privacy Constraints

**Codebase evidence:** The current branding route type-casts an arbitrary request body and decodes
with permissive `Buffer.from(..., "base64")` behavior
(`packages/server/src/routes/branding.ts:83-102`).

**Problem:** The RD does not define malformed base64, empty data, or body-shape rejection.
Permissive decoding makes size and signature behavior less predictable.

**Recommendation:** Use the existing Zod version's base64 and media-type validation, require
nonempty data, enforce the decoded-size limit, and return the ordinary sanitized 400 response. Then
pass the decoded bytes to the existing image validator. Add no custom canonicalization or new
validation framework.

**User Decision:** Resolved on 2026-09-11. The user accepted the simplified existing-Zod approach.

## Decision Progress

| Group     | Findings | Decided | Remaining |
| --------- | -------: | ------: | --------: |
| Critical  |        1 |       1 |         0 |
| Major     |       10 |      10 |         0 |
| Minor     |        4 |       4 |         0 |
| **Total** |   **15** |  **15** |     **0** |

## Iteration 2 Rescan

All accepted decisions are present in RD-06. The rescan found no unresolved ambiguity,
contradiction, missing dependency, infeasible contract, security gap, or unjustified support
surface within the strict audit scope. The Admin UI now follows the repository's explicit single-
operator model and does not introduce concurrency workflows.

Validation passed: Prettier check, `git diff --check`, and all 97 repository structure tests. Root
`yarn verify` was not run, following the user's standing instruction for this Admin UI workflow.
