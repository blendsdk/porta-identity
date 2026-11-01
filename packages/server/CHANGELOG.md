# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.16.0] - 2026-11-01

Added:
- Revoke pending tenant application invitations with strict delete limits and tenant-only UUID cancellation.

Changed:
- Updated vitest and @vitest/coverage-v8 to 4.1.11 to patch an advisory.
- Modified tenant application invitation handling to persist nullable authenticated ownership.

Fixed:
- Corrected ST dispositions, case size, tenant records, and portfolio deviation in phase 2 review findings.
- Awaited the audit write before returning 429 responses for magic-link and password-reset routes.

## [1.15.0] - 2026-10-30

Added:
- Implemented formal Dutch localization for delivery and acceptance, including invitation subjects and page errors.
- Introduced 80 independent test cases for locale packs and language selection.

Changed:
- Updated email and invitation JSON files to support Dutch localization.
- Revamped invitation-related services to accommodate new translation mechanisms.

Fixed:
- Ensured rejection-audit and invitation assertions remained unchanged across 20 integration cases.  
- Resolved issues in the email service and invitation email localization tests.

## [1.14.2] - 2026-10-27

## Fixed
- Prevent HEAD probes from consuming magic links by rejecting HEAD before magic-link validation and OIDC login handling.
- Restore application and client history by reading events from audit metadata with family scoping.
- Report invitation email delivery outcomes, returning sent or failed status from the invitation email boundary.
- State the real invitation expiry in emails by rendering a human-readable expiresIn from the configured invitation_ttl.
- Protect the canonical Porta Admin application by rejecting update, activation, deactivation, and deletion actions while allowing reads.

## Changed
- Preserve tokens, callback budgets, and continuation cookies while keeping one-click GET login.
- Add migration 035 for metadata expression indexes.
- Update invitation templates and the custom-template document to reflect actual invitation expiry.

## [1.14.1] - 2026-10-26

### Fixed
- Fail startup before serving when the audit schema is not current to guard against mutation failures.
- Aligned setup action and onboarding commands to use pnpm/action-setup v6.1.0 for native pnpm 12 support.
- Logged only safe structured failure context for generic, config, and bulk admin mutations.

### Changed
- Replaced Yarn Classic 1.22 with pnpm 12.15.0 and adopted a hoisted workspace.
- Updated repository-development commands, techdocs, AGENTS, and dependabot note.

### Documentation
- Finished structural contracts and current guidance by converting the remaining workspace, script, assurance, and docs assertions.

## [1.14.0] - 2026-10-26

Added:
- Add tenant permanent delete, activate/deactivate, and delete rate limiting with client actor audit.
- Add shared user schemas, strict tenant variants, and a common sanitized error mapper.
- Add the AuditActor contract and actor mapping helpers.
- Add actor type, client ID, and client name columns to audit_log.
- Register the read, write, and delete tenant user scopes with the OIDC provider.
- Keep InviteActor for invitation display and delegation, mapping it to the audit actor at the boundary.
- Return actor type and client fields from the audit API and entity history.

Changed:
- Modify organizationId on role audit rows and assert it in unit and live tests.
- Make role assignment/removal service-owned and app-bounded for service actors with assigned_by normalization.
- Replace invite-only auth with configurable tenant actor kinds, scopes, and permissions while preserving security insights.
- Make create, update, lifecycle, and delete service mutations transaction-bound with first-class audit attribution.

Fixed:
- Enforce the role application boundary before the no-op removal path and add assigned/unassigned foreign-role tests.
- Validate the effective verified-phone pair, including clearing a verified phone, and record verification in system logs.
- Emit tenant-api security decision events with protected actor/tenant references and prove finalization end to end.
- Harden the audit UUID backfill with pg_input_is_valid, add deleted-target coverage, and improve related tests.

## [1.13.0] - 2026-10-24

## Added
- Add tenant-scoped user invitations, including a tenant invite route for service clients and tenant users.

## Changed
- Keep the server dependency pin aligned with the audited lockfile.
- Keep the exact version pins aligned across the root and server workspace.

## Fixed
- Upgrade nodemailer to the patched 10.1.4 release to resolve remaining moderate production audit advisories.
- Upgrade zod to the patched 4.6.6 release to resolve high-severity production audit advisory.

## [1.12.0] - 2026-10-23

Fixed:
- Remediated production audit advisories by updating handlebars to 4.7.10 to address three JavaScript-injection vulnerabilities.

## [1.11.1] - 2026-09-30

### Changed
- Updated nodemailer to 10.0.13 and adapted the SMTP transport to its named type exports.

### Fixed
- Remediated production audit findings related to nodemailer.
- Reserved the new organization slug "new" in the application-paths group.
- Queried the real custom-claim tables in the GDPR export to retrieve claim name and application.
- Persisted phoneNumberVerified during user creation to the repository.

### Test
- Covered the GDPR export failure path with a unit case that checks the export service's propagation of database errors.
- Extended the slug unit suite with reservation cases and similar-word pinning.
- Pinned GDPR export and user-create ETag contracts with real-schema specification tests.
- Added create-ETag tests covering the weak ETag format.

## [1.11.0] - 2026-09-27

Added:
- Report the running version in the startup log with a new SERVER_VERSION constant.
- Defer user creation to invitation acceptance for enhanced user flow.
- Add migration for invitation tokens with a nullable user_id for deferred user creation.

Changed:
- Pin the startup version field to the Server started call using a co-location regex.
- Stabilize invitation suites for deferred creation with unique addresses per test.
- Use reserved CI loopback host in server tests to ensure consistency.

Fixed:
- Register the Porta Console callback URI on the admin native client for loopback callbacks.
- Update tests for consistent handling of invitation enumeration, replay, and token storage.

## [1.9.0] - 2026-09-25

Added:
- Preserve `requireConsent` in the portability contract, including additional export and documentation.

Changed:
- Scope invitation acceptance to the resolved organization, rejecting foreign tenant tokens.
- Gate consent on the client trust flag, replacing organization-equality logic with trust-based conditions.
- Migrations and client-related files updated to support the `requireConsent` feature.

Fixed:
- Audit rejected invitation tokens to ensure proper logging of failed invitations.
- Updated tests to assert correct behavior for cross-tenant invitation rejections.

Deprecated:
- None.

Removed:
- None.

Security:
- Added security auditing for failed invitation acceptance paths, ensuring compliance and tracking.

## [1.8.0] - 2026-09-23

### Changed
- Version bump to 1.8.0

## [1.7.3] - 2026-08-26

### Changed
- Version bump to 1.7.3

## [1.7.2] - 2026-08-26

### Changed
- Version bump to 1.7.2

## [1.7.1] - 2026-08-26

### Changed
- Version bump to 1.7.1

## [1.7.0] - 2026-08-26

### Changed
- Version bump to 1.7.0
