# Testing Strategy: CLI (Admin CLI Tooling)

> **Document**: 06-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

### Approach

CLI commands are thin wrappers around the existing service layer (which already has 1457 tests). The CLI testing strategy focuses on:

1. **Unit testing the CLI layer** — output formatting, error handling, prompt utility, bootstrap lifecycle
2. **Unit testing command handlers** — argument parsing, service delegation, output format selection, confirmation flows
3. **Mocking the service layer** — CLI tests mock the domain services (already proven by existing tests) and focus on verifying CLI behavior: argument handling, output formatting, exit codes, and user interaction

### What We Test vs What We Don't

| Concern | Test? | Rationale |
| --- | --- | --- |
| Output formatters (table/JSON) | ✅ Yes | New code, CLI-specific |
| Error handler mapping | ✅ Yes | New code, exit code behavior |
| Prompt utility | ✅ Yes | New code, --force bypass |
| Bootstrap lifecycle | ✅ Yes | New code, connection management |
| Command argument parsing | ✅ Yes | New code, yargs configuration |
| Service delegation | ✅ Yes (mock) | Verify correct service function is called with correct args |
| Service business logic | ❌ No | Already tested (1457 tests) |
| Database queries | ❌ No | Already tested in service layer |
| Redis caching | ❌ No | Already tested in service layer |

### Coverage Goals

- CLI utilities (output, error-handler, prompt, bootstrap): **90%+**
- Command handlers: **80%+**
- Overall CLI code: **85%+**

## Test Categories

### Unit Tests — CLI Utilities

| Test File | Component | Tests | Priority |
| --- | --- | --- | --- |
| `tests/unit/cli/output.test.ts` | Output formatters | ~15 | High |
| `tests/unit/cli/error-handler.test.ts` | Error handler | ~10 | High |
| `tests/unit/cli/prompt.test.ts` | Confirmation prompt | ~8 | High |
| `tests/unit/cli/bootstrap.test.ts` | Bootstrap lifecycle | ~10 | High |

**output.test.ts (~15 tests):**
- `printTable` — renders table with headers and rows
- `printTable` — handles empty rows
- `printJson` — outputs valid JSON
- `printJson` — pretty-prints with 2-space indent
- `success` — prints green checkmark message
- `warn` — prints yellow warning message
- `error` — prints red error message
- `printTotal` — formats total count line
- `outputResult` — calls table renderer when json=false
- `outputResult` — calls printJson when json=true
- `truncateId` — shortens long UUIDs
- `truncateId` — leaves short strings unchanged
- `formatDate` — formats Date objects
- `formatDate` — formats ISO strings
- `formatDate` — returns dash for null

**error-handler.test.ts (~10 tests):**
- Catches NotFoundError and prints "Not found:" message
- Catches ValidationError and prints "Validation error:" message
- Catches generic Error and prints "Error:" message
- Catches unknown error and prints generic message
- Calls process.exit(0) on success
- Calls process.exit(1) on error
- Shows stack trace when verbose=true
- Hides stack trace when verbose=false
- Handles async errors correctly
- Handles synchronous throws

**prompt.test.ts (~8 tests):**
- Returns true when user types "y"
- Returns true when user types "Y"
- Returns false when user types "n"
- Returns false when user types empty string
- Returns false when user types anything else
- Returns true immediately when force=true (no prompt)
- Closes readline interface after prompt
- Handles readline errors gracefully

**bootstrap.test.ts (~10 tests):**
- Calls connectDatabase and connectRedis
- Calls disconnectRedis and disconnectDatabase on shutdown
- Overrides DATABASE_URL from CLI flag
- Overrides REDIS_URL from CLI flag
- Does not override when flags not provided
- withBootstrap calls shutdown even if fn throws
- withBootstrap returns fn's return value
- withBootstrap passes through errors after shutdown
- Loads dotenv before connecting
- Handles connection failures gracefully

### Unit Tests — Command Handlers

| Test File | Command Group | Tests | Priority |
| --- | --- | --- | --- |
| `tests/unit/cli/commands/org.test.ts` | Organization commands | ~20 | High |
| `tests/unit/cli/commands/app.test.ts` | Application commands (incl. nested) | ~25 | High |
| `tests/unit/cli/commands/client.test.ts` | Client commands (incl. secret) | ~18 | High |
| `tests/unit/cli/commands/user.test.ts` | User commands (incl. roles/claims/2fa) | ~25 | High |
| `tests/unit/cli/commands/keys.test.ts` | Signing key commands | ~10 | Medium |
| `tests/unit/cli/commands/config.test.ts` | System config commands | ~10 | Medium |
| `tests/unit/cli/commands/migrate.test.ts` | Migration commands | ~10 | Medium |
| `tests/unit/cli/commands/health.test.ts` | Health check command | ~6 | Medium |
| `tests/unit/cli/commands/audit.test.ts` | Audit log command | ~8 | Medium |

**org.test.ts (~20 tests):**
- `create` — calls createOrganization with correct args
- `create` — outputs table format by default
- `create` — outputs JSON when --json
- `list` — calls listOrganizations with pagination
- `list` — filters by status
- `show` — resolves UUID to getOrganizationById
- `show` — resolves slug to getOrganizationBySlug
- `show` — displays organization details
- `update` — calls updateOrganization with correct fields
- `suspend` — requires confirmation
- `suspend` — skips confirmation with --force
- `suspend` — shows dry-run message with --dry-run
- `activate` — calls activateOrganization
- `archive` — requires confirmation
- `archive` — skips confirmation with --force
- `branding` — calls updateOrganizationBranding
- Error: org not found
- Error: validation error
- Error: missing required --name on create
- Table output format matches expected structure

**app.test.ts (~25 tests):**
- Core CRUD (create, list, show, update, archive) — ~10 tests
- Module subcommands (create, list, update, deactivate) — ~5 tests
- Role subcommands (create, list, show, update, delete, assign/remove permissions) — ~5 tests
- Permission subcommands (create, list, update, delete) — ~3 tests
- Claim subcommands (create, list, update, delete) — ~2 tests

**client.test.ts (~18 tests):**
- Core CRUD — ~8 tests
- Secret generate — shows one-time display box
- Secret generate — JSON format includes plaintext
- Secret list — no plaintext in output
- Secret revoke — requires confirmation
- Client revoke — requires confirmation
- Create confidential client — shows initial secret
- Error handling — ~3 tests

**user.test.ts (~25 tests):**
- Core CRUD + status commands — ~12 tests
- Create — sends invitation email by default
- Create with --no-notify — skips email
- Create with --passwordless — sends welcome email
- Invite — re-sends invitation email
- set-password — prompts for password (hidden input)
- ID vs email resolution
- User role subcommands (assign, remove, list) — ~4 tests
- User claim subcommands (set, get, delete) — ~3 tests
- 2FA stubs — all three return "not implemented" message

**keys.test.ts (~10 tests):**
- list — displays key table
- generate — calls generateSigningKeyPair
- rotate — requires confirmation, generates new + retires current
- cleanup — requires confirmation
- JSON output for all
- Error handling

**config.test.ts (~10 tests):**
- list — displays config table
- get — displays single value
- set — calls setSystemConfig
- reset — requires confirmation
- JSON output for all
- Error handling (key not found)

**migrate.test.ts (~10 tests):**
- up — runs pending migrations
- down — rolls back with count
- status — displays migration status
- create — scaffolds new migration file
- DB-only bootstrap (no Redis needed)
- Error handling

**health.test.ts (~6 tests):**
- Reports OK when both DB and Redis are healthy
- Reports error when DB fails
- Reports error when Redis fails
- JSON output format
- Table output format
- Exit code behavior

**audit.test.ts (~8 tests):**
- list — displays audit events
- Filters by --org, --user, --event, --since
- Respects --limit
- JSON output format
- Table output format
- Empty results
- Error handling

## Test Data

### Fixtures Needed

All test fixtures are inline mock data — no database fixtures needed since we mock the service layer.

```typescript
// Example: mock organization for testing
const mockOrg = {
  id: 'a0000000-0000-4000-a000-000000000001',
  name: 'Acme Corporation',
  slug: 'acme-corp',
  status: 'active' as const,
  defaultLocale: 'en',
  createdAt: new Date('2026-04-08'),
  updatedAt: new Date('2026-04-09'),
};
```

### Mock Requirements

| What to Mock | How | Rationale |
| --- | --- | --- |
| Domain service functions | `vi.mock('../organizations/index.js')` | Test CLI behavior, not service logic |
| `process.exit` | `vi.spyOn(process, 'exit').mockImplementation()` | Prevent test runner from exiting |
| `console.log` / `console.error` | `vi.spyOn(console, 'log')` | Capture output for assertions |
| `readline` | Mock readline interface | Test prompt behavior without TTY |
| `connectDatabase` / `connectRedis` | `vi.mock('../lib/database.js')` | No real DB in unit tests |

### Test Pattern

All command tests follow the same structure:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all service dependencies
vi.mock('../../src/organizations/index.js', () => ({
  createOrganization: vi.fn(),
  listOrganizations: vi.fn(),
  // etc
}));

vi.mock('../../src/lib/database.js', () => ({
  connectDatabase: vi.fn(),
  disconnectDatabase: vi.fn(),
  getPool: vi.fn(),
}));

vi.mock('../../src/lib/redis.js', () => ({
  connectRedis: vi.fn(),
  disconnectRedis: vi.fn(),
  getRedis: vi.fn(),
}));

describe('org command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset console spies
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('exit'); });
  });

  describe('create', () => {
    it('should call createOrganization with correct args', async () => {
      // Arrange
      const { createOrganization } = await import('../../src/organizations/index.js');
      vi.mocked(createOrganization).mockResolvedValue(mockOrg);

      // Act — call the handler directly (not through yargs)
      await orgCreateHandler({ name: 'Acme Corp', json: false, /* ... */ });

      // Assert
      expect(createOrganization).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Acme Corp' })
      );
    });
  });
});
```

## Verification Checklist

- [ ] All utility tests pass (output, error-handler, prompt, bootstrap)
- [ ] All command tests pass (org, app, client, user, keys, config, migrate, health, audit)
- [ ] No regressions in existing 1457 tests
- [ ] Test coverage meets 85%+ for CLI code
- [ ] `yarn verify` passes (lint + build + all tests)
- [ ] CLI runs in development mode: `yarn porta --help`
- [ ] CLI runs in production mode: `node dist/cli/index.js --help`

## Estimated Test Count

| Category | Files | Tests |
| --- | --- | --- |
| CLI utilities | 4 | ~43 |
| Command handlers | 9 | ~132 |
| **Total** | **13** | **~175** |

This would bring the project total to approximately **1632 tests across 92 test files**.
