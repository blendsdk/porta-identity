# Testing Strategy: Organization Settings and Branding

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

Use the repository's existing Vitest unit/integration/E2E/pentest projects, Playwright UI suite,
SDK type-contract project, CLI Admin tests, structure tests, and registered assurance runners. Do
not add a harness, runner, snapshot framework, or retry mechanism. (AR-2, AR-3)

### Coverage Goals

| Code type                                                | Target                                             |
| -------------------------------------------------------- | -------------------------------------------------- |
| Validation, public routing, and effective-branding logic | Branch-complete for specified cases                |
| SDK and Admin service contracts                          | Every public result/input branch in the ST cases   |
| JSVision workspace behavior                              | Every RD-06 interaction and minimum-size state     |
| Templates, CSP, and proxies                              | Exact integration assertions for changed contracts |

Test names use `should [expected behavior] when [condition]`. Specification tests are immutable
oracles derived only from RD-06, the component specs, and the confirmed AR entries.

## 🚨 Specification Test Cases

### Admin Asset and SDK Contracts

| #     | Input / scenario                                                           | Expected output / behavior                                                                                                                                                      | Source                                                |
| ----- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| ST-1  | PUT logo with valid nonempty PNG base64 under 2 MiB and `image/png`        | 200 metadata response; validated decoded bytes are stored for the route organization                                                                                            | RD-06 AC-12–AC-14; 03-01 §Admin Upload Request        |
| ST-2  | PUT favicon with valid ICO at exactly 512 KiB                              | Request succeeds and database constraint accepts it                                                                                                                             | RD-06 AC-13, AC-18; 03-01 §Persistence and Validation |
| ST-3  | PUT logo with decoded data one byte above 2 MiB                            | Fixed sanitized 400; previous asset remains unchanged                                                                                                                           | RD-06 AC-13, AC-18; 03-01 §Error Handling             |
| ST-4  | PUT favicon with decoded data one byte above 512 KiB                       | Fixed sanitized 400; no persistence                                                                                                                                             | RD-06 AC-13; 03-01 §Error Handling                    |
| ST-5  | PUT with empty, malformed, or non-base64 `data`                            | Existing Zod validation returns sanitized 400 before service persistence                                                                                                        | RD-06 AC-18; 03-01 §Admin Upload Request              |
| ST-6  | Declared JPEG containing PNG bytes, or WebP without the `WEBP` marker      | Fixed sanitized 400 for content/type mismatch                                                                                                                                   | RD-06 AC-13; 03-01 §Persistence and Validation        |
| ST-7  | Clean SVG, and SVG containing a `<script>` element and `onclick` attribute | Clean bytes are stored unchanged; the existing validator removes the script and event attribute before storage; no new parser is invoked                                        | RD-06 AC-13; 03-01 §Persistence and Validation; AR-2  |
| ST-8  | Unauthorized/cross-organization list, upload, or delete request            | Server RBAC and organization scoping reject it without exposing asset data                                                                                                      | RD-06 AC-19                                           |
| ST-9  | Two successful uploads for the same organization/type                      | One row remains and metadata reflects the replacement                                                                                                                           | RD-06 AC-12–AC-13; 03-01 §Persistence and Validation  |
| ST-10 | Production branding URL using HTTPS without credentials                    | Trimmed value is accepted; HTTP and credential-bearing URLs are rejected                                                                                                        | RD-06 AC-10; 03-01 §Branding Settings Validation      |
| ST-11 | Non-production HTTP URL for exact localhost, 127.0.0.1, or ::1             | Accepted; lookalike or non-loopback hosts are rejected                                                                                                                          | RD-06 AC-10; 03-01 §Branding Settings Validation      |
| ST-12 | SDK list, upload, protected binary read, delete, and update-settings calls | Exact paths/bodies are used; list/upload return metadata, update returns Organization, protected binary read remains, and removed `getSettings()` is absent from type contracts | RD-06 AC-14; 03-01 §SDK Contracts                     |

### Public Branding and Rendering

| #     | Input / scenario                                                                                                   | Expected output / behavior                                                                                                                                   | Source                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| ST-13 | GET exact active-organization logo or suspended-organization favicon                                               | Validated bytes, stored media type, ETag, and `public, no-cache`; no cookie or storage metadata                                                              | RD-06 AC-15; 03-02 §Public Asset Route          |
| ST-14 | GET unknown org, unsupported type, or missing asset                                                                | All cases return the same minimal public 404                                                                                                                 | RD-06 AC-15; 03-02 §Public Asset Route          |
| ST-15 | GET asset using another organization's slug                                                                        | Only the slug owner's asset can be returned                                                                                                                  | RD-06 AC-15, AC-19                              |
| ST-16 | Direct GET of a stored SVG                                                                                         | Response includes `nosniff` and restrictive sandbox/default/style/image CSP; bytes remain renderable as `<img>`                                              | RD-06 AC-15; 03-02 §Public Asset Route          |
| ST-17 | Organization has uploaded logo plus configured logo URL and attacker-chosen Host headers                           | Effective logo uses the configured issuer origin; fallback URL and request Host/forwarded-host values are not selected                                       | RD-06 AC-16; 03-02 §Effective Branding Service  |
| ST-18 | No uploaded asset but a validated fallback URL exists                                                              | Effective image uses the configured URL and records only its origin for CSP                                                                                  | RD-06 AC-16–AC-17                               |
| ST-19 | No upload or fallback; company/color are blank                                                                     | Image is absent, company uses organization name, and color uses Porta default                                                                                | RD-06 AC-09, AC-16                              |
| ST-20 | Asset metadata lookup throws while configured values exist                                                         | Resolver returns configured values/defaults and emits only a bounded sanitized diagnostic                                                                    | RD-06 AC-16; 03-02 §Effective Branding Service  |
| ST-21 | Authentication HTML with same-origin upload, external fallback, and TOTP QR; then a non-HTML OIDC protocol request | HTML `img-src` contains `'self'`, `data:`, and only the validated external origin; other directives remain; the protocol request performs no branding lookup | RD-06 AC-17; 03-02 §Context and CSP Integration |
| ST-22 | Invalid branding value reaches CSP construction                                                                    | Value adds no CSP source and page still renders with defaults                                                                                                | RD-06 AC-17; 03-02 §Context and CSP Integration |
| ST-23 | Default and organization-specific page/email templates render effective branding                                   | Both receive the same presentation contract and no raw bytes/storage metadata                                                                                | RD-06 AC-16                                     |
| ST-24 | Magic-link authentication succeeds under required TOTP policy                                                      | Passwordless login completes without an additional 2FA prompt                                                                                                | RD-06 AC-06                                     |
| ST-25 | Password authentication under each existing 2FA policy                                                             | Existing Optional/Required email/Required TOTP/Require either behavior remains active after password validation                                              | RD-06 AC-06                                     |
| ST-26 | Branding upload request within the exact 3 MiB encoded limit passes through each bundled proxy                     | Exact upload location permits it; requests above 3 MiB are rejected and ordinary locations retain existing defaults                                          | RD-06 AC-18; 03-02 §Bundled Proxy Limits        |

### Organization Admin Workspace

| #     | Input / scenario                                                            | Expected output / behavior                                                                                               | Source                                       |
| ----- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| ST-27 | No selected organization or no `admin:org:read`                             | Manage current organization action is visible-disabled and dispatches no request                                         | RD-06 AC-01                                  |
| ST-28 | Authorized actor opens Manage current organization                          | One maximized Organization workspace opens with Overview, Authentication, Branding in order                              | RD-06 AC-01–AC-02; 03-03 §Workspace and Tabs |
| ST-29 | Workspace renders at 80×24 and its 49×19 minimum                            | Layout DSL keeps all required tabs/actions reachable without a compact fallback or ad hoc dimensions                     | RD-06 AC-02; 03-03 §Window                   |
| ST-30 | Overview loads valid organization                                           | ID/slug/status/dates are read-only; dates are human-readable UTC; name/locale follow capability state                    | RD-06 AC-03                                  |
| ST-31 | Existing locale is unknown                                                  | Unknown value remains visible and unchanged until administrator explicitly selects `en`                                  | RD-06 AC-03; 03-03 §State and Validation     |
| ST-32 | Name/locale are unchanged, invalid, or update capability is absent          | Save remains disabled; valid changed values enable it                                                                    | RD-06 AC-03                                  |
| ST-33 | Active ordinary organization with suspend capability                        | Suspend confirmation offers Keep/Suspend; confirmation reloads selected organization state                               | RD-06 AC-04                                  |
| ST-34 | Super-admin organization or missing suspend capability                      | Lifecycle action remains visible-disabled with the required explanation                                                  | RD-06 AC-04                                  |
| ST-35 | Authentication has both login methods, then user clears both                | Save remains disabled with field guidance; one or both selected values are accepted                                      | RD-06 AC-05                                  |
| ST-36 | Authentication guidance is displayed                                        | It distinguishes client-inherited login methods from organization-wide password-login 2FA and states magic-link behavior | RD-06 AC-06–AC-07                            |
| ST-37 | Only login methods, only 2FA, or both values change                         | Save sends only changed resources, uses no ETag, and never retries a mutation                                            | RD-06 AC-08, AC-20; AR-2                     |
| ST-38 | First Authentication request succeeds and second fails                      | Both displayed resources reload once and a sanitized failure remains visible                                             | RD-06 AC-08, AC-20                           |
| ST-39 | Branding text is valid/changed or invalid/unchanged                         | Save enables only for valid changed text; custom CSS is absent                                                           | RD-06 AC-09–AC-10                            |
| ST-40 | Branding has no stored assets                                               | Logo and Favicon metadata rows still render with Add actions                                                             | RD-06 AC-11                                  |
| ST-41 | User selects valid logo/favicon through `openFile()`                        | UI validates local type/size, uploads immediately, and reloads metadata                                                  | RD-06 AC-11–AC-13; 03-03 §Branding           |
| ST-42 | User cancels file picker or selects an invalid/oversized file               | Cancellation is silent; rejection names only type or size and sends no mutation                                          | RD-06 AC-12, AC-21                           |
| ST-43 | User confirms Remove or keeps the existing asset                            | Confirm deletes immediately and reloads metadata; Keep changes nothing; focus returns to launcher                        | RD-06 AC-11–AC-12, AC-22                     |
| ST-44 | Server returns 401, 403, invalid response, or unknown asset outcome         | Existing reauthentication handles 401; fixed errors handle others; unknown asset state reloads once before re-enable     | RD-06 AC-19–AC-22; 03-03 §Controller Rules   |
| ST-45 | Selected organization or authenticated session changes while loading/saving | Old workspace closes and every late result is discarded                                                                  | RD-06 AC-01, AC-22                           |

## Test Categories

### Specification Tests

| Test file                                                                      | ST cases                     | Component               |
| ------------------------------------------------------------------------------ | ---------------------------- | ----------------------- |
| `packages/server/tests/unit/routes/branding-rd06.spec.test.ts`                 | ST-1, ST-3–ST-8, ST-10–ST-11 | Admin API/validation    |
| `packages/server/tests/integration/services/branding-assets-rd06.spec.test.ts` | ST-2–ST-4, ST-7–ST-9         | Persistence             |
| `packages/sdk/tests/domains/branding-rd06.spec.test.ts`                        | ST-12                        | SDK runtime             |
| `packages/sdk/tests/type-contracts/branding-rd06.spec.test.ts`                 | ST-12                        | SDK types               |
| `packages/server/tests/unit/routes/public-branding.spec.test.ts`               | ST-13–ST-16                  | Public asset route      |
| `packages/server/tests/unit/auth/effective-branding.spec.test.ts`              | ST-17–ST-20, ST-23           | Effective context       |
| `packages/server/tests/pentest/infrastructure/branding-boundary.spec.test.ts`  | ST-14–ST-16, ST-21–ST-22     | Public isolation/CSP    |
| `packages/server/tests/unit/auth/two-factor-login-boundary.spec.test.ts`       | ST-24–ST-25                  | Authentication boundary |
| `repo-tests/monorepo/branding-upload-proxy.spec.test.mjs`                      | ST-26                        | Bundled proxies         |
| `packages/cli/tests/admin/organization-workspace.spec.test.ts`                 | ST-27–ST-45                  | Admin workspace         |

### Implementation Tests

| Test file                                                        | Description                                     | Priority |
| ---------------------------------------------------------------- | ----------------------------------------------- | -------- |
| `packages/server/tests/unit/lib/image-validator.test.ts`         | Exact signature and SVG internal branches       | High     |
| `packages/server/tests/unit/lib/branding-assets.test.ts`         | Service mapping and validation-error branches   | High     |
| `packages/server/tests/unit/middleware/security-headers.test.ts` | CSP builder source sorting/deduplication        | High     |
| `packages/server/tests/unit/auth/email-service.test.ts`          | Effective-branding integration branches         | High     |
| `packages/sdk/tests/domains/branding.test.ts`                    | Serialization and unwrap internals              | Medium   |
| `packages/cli/tests/admin/organization-workspace.impl.test.ts`   | Bindings, selection, disposal, file-read errors | High     |
| Existing organization/session/application implementation suites  | Production wiring and regression coverage       | High     |

### Integration and End-to-End Tests

| Test                                         | Components                            | Description                                            |
| -------------------------------------------- | ------------------------------------- | ------------------------------------------------------ |
| Existing server branding integration project | Migration, repository, service        | Real PostgreSQL boundaries and replacement             |
| Existing server E2E/pentest projects         | Admin/public routes, tenant isolation | Authz, enumeration resistance, response safety         |
| Existing Playwright UI project               | Templates, CSP, uploaded assets, TOTP | Browser rendering and complete authentication behavior |
| Existing Admin PTY tests                     | JSVision workspace                    | Focus and 49×19 minimum-size reachability              |

No new E2E harness is created; the current server, Playwright, and Admin PTY surfaces cover the
complete feature. (AR-2)

## Test Data

### Fixtures Needed

- Active, suspended, super-admin, and missing organizations.
- Two organizations with distinct logo/favicon bytes.
- Valid boundary-sized PNG/ICO, minimal JPEG/WebP/SVG, spoofed signatures, malformed base64, and
  oversized buffers generated in test memory rather than committed binaries.
- Organizations with uploaded, fallback-only, missing, and invalid legacy branding values.
- Admin sessions spanning read-only, update, suspend, and absent capabilities.

### Mock Requirements

Use real services/repositories in integration tests. Unit tests may replace database, Redis, mail,
file-dialog, filesystem read, and SDK transports because those are true boundaries. Do not mock
validation or state transitions being specified.

## Verification Checklist

- [ ] All ST-1–ST-45 cases have immutable specification tests.
- [ ] Specification tests are written and shown red before implementation.
- [ ] Each implementation phase makes only its own ST cases green.
- [ ] Implementation tests cover internal/error branches without weakening ST expectations.
- [ ] Affected server, SDK, and CLI workspace verification passes.
- [ ] `yarn test:structure` and `yarn test:ui` pass.
- [ ] `yarn assurance:harness --project security --profile production-security` reaches an eligible
      registered outcome.
- [ ] From a clean committed revision, `yarn assurance:compat --select tenant-admin` reaches an
      eligible registered outcome.
- [ ] Root `yarn verify` is not run. (AR-3)
