# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.14.2] - 2026-10-27

Changed:
- Made the `total` field optional in cursor pagination responses and validated those responses without it.
- Preserved `nextCursor`, `previousCursor`, and `hasMore` in pagination.
- Advanced `listAll` method through `nextCursor` pages.
- Improved CLI by avoiding the printing of an undefined `total`.

Added:
- Introduced new test scripts: `test:changed`, `test:changed:integration`, and watch scripts for improved local development.
- Updated the test suite to run the full product suite with `pnpm test`, while `pnpm verify` remains as the CI gate.

## [1.14.1] - 2026-10-26

Added:
- Native build approvals and overrides to enhance package management.

Changed:
- Updated repository-development commands and guidance documentation for clarity.
- Converted repository and package scripts to use pnpm as the package manager.
- Updated packages/sdk/README.md and packages/sdk/package.json to reflect recent changes.

Deprecated:
- Yarn Classic is deprecated in favor of pnpm.

Removed:
- N/A

Fixed:
- Verified structure tests with 142/142 passing for ensures integrity post-migration.

Security:
- N/A

## [1.14.0] - 2026-10-26

Added:
- Exposed tenant user contracts and updated SDK documentation to include optional email/phone verification fields and client actor fields.

Changed:
- Included the tenant type-contract file in the SDK typecheck project.
- Displayed client actors in CLI audit and user history for enhanced visibility.

Fixed:
- Resolved phase 4 review findings including assertions on audit-table client rows and adding name-only display coverage.
- Rejected directional/invisible controls in CLI actor labels for improved user experience.

## [1.13.0] - 2026-10-24

Changed: Updated README.md to reflect recent changes in usage and examples.  
Changed: Refactored client.ts for improved performance and enhanced API consistency.  
Changed: Optimized browser-transport.ts for better handling of network requests.  
Changed: Enhanced node-transport.ts to support additional transport methods.  
Changed: Improved type definitions in types.ts for better type safety.  
Changed: Streamlined utility functions in utils.ts for cleaner code.  
Changed: Updated tests in browser-transport.test.ts and node-transport.test.ts for better coverage.

## [1.12.0] - 2026-10-23

Added  
- Updated documentation to clarify that /api/admin requires account-bound opaque access tokens.

Changed  
- Removed client-credentials examples for Admin API automation.  
- Corrected signatures for createTokenAuth and createCliAuth to adhere to the BFF pattern.  

Fixed  
- Updated authentication guidance in docs/api/authentication.md and several guide files to reflect accurate information.

## [1.11.1] - 2026-09-30

Added  
- Exposed the optional etag parameter in organizations.update and twoFactor.setPolicy in the agent catalog.  
- Added usersById row to the README table.

Changed  
- Updated the client factory docstring and README to reflect 19 remaining domain namespaces after userClaims removal.  
- Revised twoFactor.setPolicy to accept an optional If-Match token and resolve the { data, etag } wrapper.  
- Aligned the shared params and organizations domain with the API by renaming ListParams sort/order to sortBy/sortOrder.  
- Updated slug validations and renamed sorting parameters to match the server changes across relevant domains.

Fixed  
- Adjusted user create/update to return response ETag for org-scoped and standalone.  
- Resolved alignment issues with the users, claims, and roles according to the server API.  
- Corrected history parameter mappings to limit/after/event_type.  
- Ensured the two-factor service aligns with CLI contract requirements and properly handles claims via the customClaims surface.  
- Fixed type exports for exportData to correspond with the UserDataExport document.

Deprecated  
- Dropped the legacy SlugValidationResult type in favor of the public variant.

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
