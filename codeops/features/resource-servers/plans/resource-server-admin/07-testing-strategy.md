# Testing Strategy: Resource-Server Admin Management

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Coverage Goals

| Code type | Target |
| --- | --- |
| Resource-server service/repository | 90% |
| Admin routes and validation | 90% |
| SDK domain methods | 80% |
| CLI command handlers | 80% |
| Documentation/glue | 60% |

Test names state behavior: `should [expected behavior] when [condition]`. The project's existing
`*.spec.test.*` / `*.impl.test.*` split is mandatory.

## 🚨 Specification Test Cases (MANDATORY — NON-NEGOTIABLE)

These expectations come from [RD-01](../../requirements/RD-01-resource-server-admin.md), the
component specifications, and the registers. They are the immutable oracle.

### Admin API

| # | Input / Scenario | Expected Output / Behavior | Source |
| --- | --- | --- | --- |
| ST-1 | `GET` list for an application with no rows, valid `admin:app:read` token | `200`, `{ "data": [] }` | RD-01 AC1 |
| ST-2 | `GET` list with rows named `Zulu` and `Alpha`, same name broken by identifier | `200`; `Alpha` first, then `Zulu`; every projection field present | RD-01 AC2 |
| ST-3 | `POST` with `name` + `identifier`, no audience/scopes | `201`; `audience` equals `identifier`; `scopes: []` | RD-01 AC3 |
| ST-4 | `POST` with `scopes: ["billing:write", "billing:read"]` | `201`; returned scopes sorted `["billing:read","billing:write"]` | RD-01 AC4 |
| ST-5 | `POST` duplicate identifier; duplicate audience; duplicate slug in one app; same slug in another app | First three return `409` fixed body; same slug in another app returns `201` | RD-01 AC5 |
| ST-6 | `POST` with `billing` (relative), `https://x.test/#frag`, or a 2049-character identifier | `400`, `{ "error": "Resource server request is invalid" }` | RD-01 AC6 |
| ST-7 | `POST` with `openid`, `profile`, `email`, `address`, `phone`, or `offline_access` in `scopes`; or duplicate scope | `400` fixed validation body; no row inserted | RD-01 AC7, AR-8 |
| ST-8 | `PUT` without `audience` after a custom audience was stored | `200`; stored audience resets to the identifier | RD-01 AC8, AR-7 |
| ST-9 | `PUT` with `scopes` omitting a previously stored scope; then `PUT` with no `scopes` | Removed scope is absent; second update leaves `scopes: []` | RD-01 AC9, AR-3 |
| ST-10 | `GET`/`PUT`/`DELETE` using app A for a resource server owned by app B | `404` `{ "error": "Resource server not found" }`, no data from B | RD-01 AC10 |
| ST-11 | `DELETE` an existing resource server | `204`; parent, scopes, and namespace rows absent; list no longer returns it | RD-01 AC11 |
| ST-12 | Delete a resource server, then call `resolveResourceServerInfo` for its identifier | Rejects with `invalid_target`; a pre-delete token remains usable until its expiry | RD-01 AC12, AR-9 |
| ST-13 | List/get with a token lacking `admin:app:read`; create/update/delete lacking `admin:app:update` | Each returns `403`; no mutation occurs | RD-01 AC13, AR-2 |
| ST-14 | Successful create, update, delete; then a validation-failure request | One `admin.mutation.committed` row per success; no successful-mutation row for the failure | RD-01 AC14 |
| ST-15 | `GET`/`POST` using an application UUID and using its slug; get/update/delete using a resource-server UUID and its slug | Both identifier forms resolve the same rows | RD-01 API Contract |
| ST-16 | `POST` without `slug` for `name: "Billing API"` | Created slug is `billing-api` | RD-01 Request Fields |
| ST-17 | `PUT` missing `name`, `slug`, or `identifier` | `400` fixed validation body; existing row unchanged | RD-01 Request Fields |
| ST-18 | App A has identifier `https://shared.test`; app B creates resource server with audience `https://shared.test` | `409` fixed conflict body; B row not inserted | RD-01 Persistence, migration 038 |
| ST-19 | `POST` with `audience: null` | `201`; audience equals identifier | RD-01 AC3, AR-7 |

### SDK

| # | Input / Scenario | Expected Output / Behavior | Source |
| --- | --- | --- | --- |
| ST-20 | `listResourceServers("acme")` | Sends `GET /applications/acme/resource-servers` and returns the parsed array | 03-02 Paths |
| ST-21 | `createResourceServer`, `updateResourceServer`, `deleteResourceServer` | Send the exact method, path, and body; delete resolves `void` | 03-02 Paths |
| ST-22 | A success response missing `audience` or with `scopes: [1]` | SDK validation error; no partial object returned | 03-02 Response Validation |

### CLI

| # | Input / Scenario | Expected Output / Behavior | Source |
| --- | --- | --- | --- |
| ST-23 | `app resource-server list acme` with two rows | Human table has ID/name/slug/identifier/audience/scopes; `--json` prints the array | 03-03 Output |
| ST-24 | `app resource-server create acme --name "Billing API" --identifier ... --scope billing:read --scope billing:write` | Calls SDK create with `scopes: ["billing:read","billing:write"]`; prints the created row | 03-03 Flags |
| ST-25 | `app resource-server update ...` without `--scope` | Calls SDK update with `scopes: []` | 03-03 Flags, AR-3 |
| ST-26 | `app resource-server delete ...` without `--yes`, then answer `n` | No SDK call; exit `0`; row remains | 03-03 Confirmation |
| ST-27 | `app resource-server delete ... --yes` | Calls SDK delete; prints success | 03-03 Confirmation |

### Documentation

| # | Input / Scenario | Expected Output / Behavior | Source |
| --- | --- | --- | --- |
| ST-28 | `pnpm docs:build` and structure link checks | Build succeeds; both new pages resolve; application pages link to them | RD-01 Documentation, AR-3 |

### Security Boundary

| # | Input / Scenario | Expected Output / Behavior | Source |
| --- | --- | --- | --- |
| ST-29 | Pentest-style request using a foreign application/resource pair or missing write permission | `404`/`403` fixed response; no row values, SQL, stack trace, or cross-application data | RD-01 AC10, AC13, AC20 |

## Test Categories

### Specification Tests (from ST-cases above)

| Test File | ST Cases Covered | Component |
| --- | --- | --- |
| `packages/server/tests/integration/resource-servers/resource-server-admin.spec.test.ts` | ST-1–ST-19 | Admin API |
| `packages/server/tests/unit/resource-servers/resource-server-admin.spec.test.ts` | ST-6, ST-7, ST-16, ST-17 | Validation |
| `packages/sdk/tests/resource-servers.spec.test.ts` | ST-20–ST-22 | SDK |
| `packages/cli/tests/commands/app-resource-server.spec.test.ts` | ST-23–ST-27 | CLI |
| `packages/server/tests/pentest/resource-server-admin.spec.test.ts` | ST-29 | Security boundary |
| `pnpm docs:build` + structure | ST-28 | Documentation |

### Implementation Tests (edge cases, internals)

| Test File | Description | Priority |
| --- | --- | --- |
| `packages/server/tests/integration/resource-servers/resource-server-admin.impl.test.ts` | Concurrent create/update, unique-constraint mapping, scope replacement, delete cascade | High |
| `packages/sdk/tests/resource-servers.impl.test.ts` | Malformed responses, transport errors | Medium |
| `packages/cli/tests/commands/app-resource-server.impl.test.ts` | Flag edge cases, empty list, confirmation bypass | Medium |

### Integration Tests

| Test | Components | Description |
| --- | --- | --- |
| Resource-server Admin lifecycle | Router, service, repository, PostgreSQL | Full CRUD, ownership, audit, cascade |
| Provider resolution after delete | Admin service + `resolveResourceServerInfo` | Deleted identifier becomes `invalid_target` |

### End-to-End Tests

N/A — this is an Admin API/CLI surface with no browser journey. The integration suite exercises
the complete HTTP boundary, and the CLI suite exercises the command boundary. Building a new browser
harness solely for this feature is out of scope.

## Test Data

### Fixtures Needed

- Two active applications with distinct slugs and UUIDs.
- Admin tokens with `admin:app:read` + `admin:app:update`, read-only, and no relevant permission.
- Resource-server rows with default and custom audiences, custom scopes, and cross-application
  identifiers.
- Existing resolver fixture for the post-delete `invalid_target` check.

### Mock Requirements

- PostgreSQL is real in integration/pentest tests.
- SDK/CLI tests use the existing transport/command doubles; no live server.
- No new mock framework or fixture service is added.

## Verification Checklist

- [ ] All ST cases have concrete input/output pairs and a source
- [ ] Specification tests are written before implementation
- [ ] Red-phase verification is recorded for each spec-test step
- [ ] Green-phase verification follows implementation
- [ ] Implementation tests cover concurrency, malformed responses, and CLI edges
- [ ] `pnpm test:unit`, `pnpm test:integration`, `pnpm test:pentest`, SDK and CLI suites pass
- [ ] `pnpm test:structure` and `pnpm docs:build` pass
- [ ] Final `pnpm verify` passes
- [ ] No new migration; existing `038` schema tests remain green
