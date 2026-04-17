# Current State: Confidential Client E2E

> **Document**: 02-current-state.md
> **Parent**: [Index](00-index.md)

## Existing Implementation

### What Works

- **SHA-256 middleware** (`src/middleware/client-secret-hash.ts`) — mounted on OIDC router, hashes incoming secrets
- **`findForOidc()`** (`src/clients/service.ts:488-493`) — returns SHA-256 hash as `client_secret` for confidential clients
- **Adapter factory** (`src/oidc/adapter-factory.ts:100-103`) — routes Client model to `findForOidc()`
- **Migration 013** — adds `sha256_hash` column to `client_secrets` table
- **Authorization endpoint** — works (auth request succeeds with 303 redirect)

### What's Broken

- **Token endpoint returns 400** — "no client authentication mechanism provided"
- Root cause: Koa's global `bodyParser()` (server.ts line 63) consumes the request body stream before oidc-provider can parse it
- oidc-provider's fallback (`ctx.req.body || ctx.request.body`) should work but `client_id` is not reaching `ctx.oidc.params`

### Dead Code

- **`src/oidc/client-finder.ts`** — `findClient` is NOT a valid oidc-provider v9.8.0 config option (grep finds zero matches in oidc-provider source). Silently ignored.
- **`src/oidc/provider.ts`** lines 20, 50-53 — imports and passes `findClientByClientId` which is ignored
- **`src/oidc/configuration.ts`** lines 38-39, 53, 157 — `findClient` parameter definition and spread

## Relevant Files

| File | Purpose | Changes Needed |
|------|---------|----------------|
| `src/server.ts` | Global middleware stack | Skip bodyparser for OIDC routes |
| `src/oidc/client-finder.ts` | Dead code | DELETE |
| `src/oidc/provider.ts` | Provider factory | Remove findClient import/usage |
| `src/oidc/configuration.ts` | Provider config | Remove findClient parameter |
| `tests/unit/oidc/client-finder.test.ts` | Dead test | DELETE |
| `tests/ui/setup/global-setup.ts` | Test data seeding | Add confidential client |
| `tests/ui/fixtures/test-fixtures.ts` | Playwright fixtures | Add confidential client data |

## Gaps

### GAP-1: Body Parser Conflict

**Current**: `app.use(bodyParser())` is global middleware (line 63 of server.ts). All requests, including OIDC endpoints, have their body consumed.

**Required**: OIDC routes must reach oidc-provider with an unparsed body stream so oidc-provider can parse it natively.

**Fix**: Configure bodyparser to skip OIDC route paths, or move it to only apply to API routes.

### GAP-2: Dead findClient Code

**Current**: `findClient: findClientByClientId` passed in config, silently ignored.

**Fix**: Remove the dead code and its test file.
