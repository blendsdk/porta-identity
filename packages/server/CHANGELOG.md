# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
