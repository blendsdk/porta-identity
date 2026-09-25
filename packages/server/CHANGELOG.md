# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
