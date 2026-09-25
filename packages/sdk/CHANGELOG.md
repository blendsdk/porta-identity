# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.9.0] - 2026-09-25

Added:
- Exposed `requireConsent` in the Client, CreateClientInput, and UpdateClientInput.

Changed:
- Validated `requireConsent` in the `isClient` response guard.
- Added `require_consent` to the portability import type and updated SDK fixtures.
- Enhanced tests to reject responses whose `requireConsent` is missing or non-boolean; extended exact-type oracle.

Deprecated:
- None.

Removed:
- None.

Fixed:
- Improved testing for SDK client response handling.

Security:
- None.

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
