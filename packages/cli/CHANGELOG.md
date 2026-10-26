# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.14.0] - 2026-10-26

Changed:
- Updated user-service.ts to enhance user management capabilities.
- Refactored user-workspace.ts for improved workspace handling.
- Improved audit.ts for better audit trail performance.
- Refined output.ts for clearer command output formatting.
- Adjusted user-service-client-actor.spec.test.ts to align with new logic.
- Updated audit-client-actor.impl.test.ts for better coverage of new features.
- Revised audit-client-actor.spec.test.ts to ensure tests match updated code.
- Modified audit.test.ts to incorporate the latest audit functionalities.

## [1.12.0] - 2026-10-23

Added:
- Pre-assign roles when inviting a user with repeatable `--role <application-id>:<role-id>` option in `porta user invite`.

Changed:
- Validate every pair before SDK calls and forward the exact roles array.
- Forward `--locale` and `--personal-message` options to the appropriate command.

## [1.11.1] - 2026-09-30

Changed:
- Aligned the doctor health check with the server /health contract, treating `status: healthy` (HTTP 200) as a pass and rendering `checks` details.
- Modified the health check to parse HTTP 503 `status: unhealthy` bodies, failing the check and naming degraded dependencies.

Fixed:
- Resolved issues in the health check process within the doctor command to ensure accurate reporting of service health.

## [1.11.0] - 2026-09-27

Added:
- CLI invite output now prints the invitation fields.

Changed:
- Updated guidance to point operators at the internal UUID from `porta client list` instead of the public metadata clientId.
- Clarified that metadata clientId is the OIDC login identifier, not the update identifier.
- Adopted deferred invitation result shape; InviteUserResult now exposes invitationId instead of userId/created.
- Admin UI type and validator accept the new invitation result shape and reject the legacy one.

Deprecated:
- Legacy invitation result shape is no longer supported in Admin UI.

Removed:
- None.

Fixed:
- Corrected documentation discrepancies regarding client identifier guidance. 

Security:
- None.

## [1.9.0] - 2026-09-25

## Added
- Added a Require Consent switch to the client Protocol tab in the AdminClient model.
- Introduced a --require-consent option for client create and update commands.

## Changed
- Updated AdminClient and associated services to support the requireConsent functionality.
- Modified client create/update inputs to include requireConsent only when specified.

## Fixed
- Added RED specification oracles to ensure requireConsent is appropriately validated in SDK and CLI commands.

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
