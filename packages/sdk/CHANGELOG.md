# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Added:
- `customClaims.getValuesForUser`, `customClaims.getValue`, `customClaims.setValue`, and
  `customClaims.deleteValue` for the application-prefixed claim value routes. The server does not
  filter values by application; the methods document that behavior.
- `userRoles.getEffectivePermissions` resolves the deduplicated permissions granted by all roles
  assigned to a user.
- Public types `SlugValidationResult`, `HistoryParams`, `UserDataExport`,
  `CustomClaimDefinition`, `CreateCustomClaimInput`, `UpdateCustomClaimInput`, `UserClaimValue`,
  and `UserClaimWithDefinition`.

Changed:
- `ListParams.sort` and `ListParams.order` are renamed to `sortBy` and `sortOrder` to match the
  Admin API query names. A misspelled sort silently falls back to the resource default.
- `users.create`, `users.update`, `usersById.update`, `organizations.update`, and
  `twoFactor.setPolicy` now resolve `ETagResponse<T>` (`{ data, etag }`) instead of the bare
  entity so callers can send the returned token back as `If-Match`.
- `organizations.getHistory` and `users.getHistory` accept `HistoryParams`
  (`{ limit, after, eventType }`) and return the full `HistoryResult` envelope.
- `users.exportData` resolves the typed `UserDataExport` document.
- `organizations.validateSlug` resolves `SlugValidationResult` (`{ isValid, error? }`), matching
  the server; malformed or reserved slugs reject with `PortaValidationError` (`400`).

Removed:
- The `userClaims` client namespace and its types (`UserClaimEntry`, `SetUserClaimValueInput`);
  claim value operations now live on `customClaims`.
- The legacy `SlugValidation`, `ClaimDefinition`, `CreateClaimDefinitionInput`,
  `UpdateClaimDefinitionInput`, `SetUserClaimInput`, and `UserExportData` type names.

Migration:
```ts
// ETag-aware writes
const { data: user, etag } = await porta.users.update(orgId, userId, input, currentEtag);
await porta.users.update(orgId, userId, input, etag ?? undefined);

// Claim values
const values = await porta.customClaims.getValuesForUser(appId, userId);
await porta.customClaims.setValue(appId, claimId, userId, 'engineering');

// History pagination
const page = await porta.organizations.getHistory(orgId, { limit: 50, eventType: 'org.' });
```

## [1.11.0] - 2026-09-27

Added:
- InviteUserResult now exposes invitationId instead of userId/created.

Changed:
- CLI invite output now prints the invitation fields.
- Admin UI type and validator now accept the new shape and reject the legacy one.

Fixed:
- Updated tests to reflect changes in user invitation schema and validation.

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
