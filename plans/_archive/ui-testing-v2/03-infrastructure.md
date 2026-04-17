# Infrastructure: UI Testing Phase 2

> **Document**: 03-infrastructure.md
> **Parent**: [Index](00-index.md)

## Overview

Phase 2 tests require three infrastructure additions to the existing Playwright setup:

1. **Mail capture fixture** — Query MailHog to extract tokens from emails
2. **DB helper fixture** — Direct database queries for test setup and verification
3. **Extended seed data** — Additional users in various states (suspended, locked, etc.)

These changes extend the existing Phase 1 infrastructure without breaking any existing tests.

## Architecture

### Current Infrastructure (Phase 1)

```
tests/ui/
  setup/
    global-setup.ts      ← Starts server, seeds 2 clients + 1 user
    global-teardown.ts    ← Stops server
  fixtures/
    test-fixtures.ts      ← testData + startAuthFlow fixtures
  playwright.config.ts    ← Port 49200, Chromium, timeouts
```

### Proposed Infrastructure (Phase 2 Additions)

```
tests/ui/
  setup/
    global-setup.ts      ← MODIFIED: Additional seed users + invitation token
    global-teardown.ts    ← UNCHANGED
  fixtures/
    test-fixtures.ts      ← MODIFIED: Export extended testData interface
    mail-capture.ts       ← NEW: MailHog API integration fixture
    db-helpers.ts         ← NEW: Direct DB queries fixture
  accessibility/          ← NEW directory
  playwright.config.ts    ← UNCHANGED
```

## Implementation Details

### 1. Mail Capture Fixture (`tests/ui/fixtures/mail-capture.ts`)

Provides a Playwright fixture to capture emails sent by the server during tests. Uses the MailHog API (already running in Docker on port 8025 and already used by E2E tests' `MailHogClient`).

#### Interface

```typescript
import { test as base } from '@playwright/test';

interface MailMessage {
  id: string;
  from: string;
  to: string[];
  subject: string;
  body: string;         // Plain text body
  htmlBody: string;     // HTML body
  timestamp: Date;
}

interface MailCapture {
  /** Wait for an email to arrive for the given recipient */
  waitForEmail(to: string, options?: { 
    timeout?: number;       // Default: 10000ms
    subject?: string;       // Filter by subject substring
    after?: Date;           // Only emails after this timestamp
  }): Promise<MailMessage>;

  /** Extract a URL from an email body matching a pattern */
  extractLink(email: MailMessage, pattern: RegExp): string | null;

  /** Extract a token from a URL path (last segment) */
  extractToken(url: string): string;

  /** Delete all emails (cleanup between tests) */
  deleteAll(): Promise<void>;

  /** Search for emails matching criteria */
  search(query: string, kind?: 'from' | 'to' | 'containing'): Promise<MailMessage[]>;
}
```

#### Key Design Decisions

- **MailHog API**: `http://localhost:8025/api/v2/search?kind=to&query=email@example.com`
- **Polling**: Poll every 500ms until email arrives (up to timeout)
- **Cleanup**: `deleteAll()` calls `DELETE /api/v1/messages` between tests
- **No parsing fragility**: Token extraction is a simple URL path split — no complex HTML parsing
- **Reference**: Follows same patterns as `tests/e2e/helpers/mailhog.ts` but as a Playwright fixture

### 2. DB Helper Fixture (`tests/ui/fixtures/db-helpers.ts`)

Provides direct PostgreSQL access for test setup that cannot be done through the UI. Uses the existing `pg` pool available through the running server.

#### Interface

```typescript
interface DbHelpers {
  /** Create a password reset token for a user, returns the raw (unhashed) token */
  createPasswordResetToken(userId: string, orgId: string, options?: {
    expiresIn?: number;   // Minutes, default: 60
    expired?: boolean;     // Create already-expired token
  }): Promise<string>;

  /** Create a magic link token for a user, returns the raw (unhashed) token */
  createMagicLinkToken(userId: string, orgId: string, interactionUid?: string, options?: {
    expiresIn?: number;
    expired?: boolean;
  }): Promise<string>;

  /** Create an invitation token for a new user email */
  createInvitationToken(email: string, orgId: string, options?: {
    expiresIn?: number;
    expired?: boolean;
  }): Promise<string>;

  /** Mark a token as used (for replay testing) */
  markTokenUsed(tokenHash: string, table: 'password_reset_tokens' | 'magic_link_tokens' | 'invitation_tokens'): Promise<void>;

  /** Get user by email */
  getUserByEmail(email: string, orgId: string): Promise<{ id: string; status: string; email_verified: boolean }>;

  /** Update user status */
  updateUserStatus(userId: string, status: 'active' | 'suspended' | 'archived' | 'locked' | 'deactivated'): Promise<void>;

  /** Reset rate limit counters for a key pattern */
  resetRateLimits(pattern: string): Promise<void>;

  /** Reset all rate limits */
  resetAllRateLimits(): Promise<void>;

  /** Check if email was verified for a user */
  isEmailVerified(userId: string): Promise<boolean>;

  /** Update user password (for reset-then-login tests) */
  getUserPasswordHash(userId: string): Promise<string>;
}
```

#### Key Design Decisions

- **Connection**: Uses environment variables from global-setup (same DB as the running server)
- **Token creation**: Generates raw token → SHA-256 hashes it → stores hash in DB → returns raw token (same flow as production code)
- **Rate limit reset**: Uses Redis `SCAN` + `DEL` to remove rate limit keys matching a pattern
- **Isolation**: Each fixture instance creates its own `pg.Pool` connection, closed in fixture teardown

### 3. Extended Global Setup (`tests/ui/setup/global-setup.ts` modifications)

#### Additional Seed Users

The current setup creates one active user. Phase 2 needs users in various states:

```typescript
// Additional users to seed (alongside existing active user)
const additionalUsers = [
  { email: 'suspended@test.example.com', status: 'suspended', password: 'TestPassword123!' },
  { email: 'archived@test.example.com', status: 'archived', password: 'TestPassword123!' },
  { email: 'deactivated@test.example.com', status: 'deactivated', password: 'TestPassword123!' },
  // locked user: created as active, will be locked during tests
  { email: 'lockable@test.example.com', status: 'active', password: 'TestPassword123!' },
  // invitation user: no password set, invitation token pre-created
  { email: 'invited@test.example.com', status: 'invited' },
  // password-reset user: active, with known password for reset tests
  { email: 'resettable@test.example.com', status: 'active', password: 'OldPassword123!' },
];
```

#### Additional Organizations

```typescript
// Additional orgs for tenant isolation tests
const additionalOrgs = [
  { name: 'Suspended Org', slug: 'suspended-org', status: 'suspended' },
  { name: 'Archived Org', slug: 'archived-org', status: 'archived' },
];
```

#### Environment Variables Exported

Extend the existing env var exports with:

```typescript
// Additional user IDs and emails for status tests
process.env.UI_TEST_SUSPENDED_USER_EMAIL = 'suspended@test.example.com';
process.env.UI_TEST_ARCHIVED_USER_EMAIL = 'archived@test.example.com';
process.env.UI_TEST_DEACTIVATED_USER_EMAIL = 'deactivated@test.example.com';
process.env.UI_TEST_LOCKABLE_USER_EMAIL = 'lockable@test.example.com';
process.env.UI_TEST_LOCKABLE_USER_PASSWORD = 'TestPassword123!';
process.env.UI_TEST_INVITED_USER_EMAIL = 'invited@test.example.com';
process.env.UI_TEST_RESETTABLE_USER_EMAIL = 'resettable@test.example.com';
process.env.UI_TEST_RESETTABLE_USER_PASSWORD = 'OldPassword123!';
process.env.UI_TEST_RESETTABLE_USER_ID = '<seeded-id>';

// Additional org slugs
process.env.UI_TEST_SUSPENDED_ORG_SLUG = 'suspended-org';
process.env.UI_TEST_ARCHIVED_ORG_SLUG = 'archived-org';
```

### 4. Extended Test Fixtures (`tests/ui/fixtures/test-fixtures.ts` modifications)

Extend the `TestData` interface:

```typescript
interface TestData {
  // Existing Phase 1 fields
  orgSlug: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  userEmail: string;
  userPassword: string;
  baseUrl: string;

  // Phase 2 additions
  suspendedUserEmail: string;
  archivedUserEmail: string;
  deactivatedUserEmail: string;
  lockableUserEmail: string;
  lockableUserPassword: string;
  invitedUserEmail: string;
  resettableUserEmail: string;
  resettableUserPassword: string;
  resettableUserId: string;
  suspendedOrgSlug: string;
  archivedOrgSlug: string;
}
```

## Error Handling

| Error Case | Handling Strategy |
|---|---|
| MailHog not running | Skip mail capture tests with clear error message |
| DB connection failure | Fixture throws with connection details in error |
| Rate limit key not found | `resetRateLimits` is a no-op if no matching keys |
| Token generation collision | Extremely unlikely with crypto.randomBytes(32); retry once |
| Email not arriving in time | Timeout with descriptive error including recipient + search criteria |

## Testing Requirements

- Infrastructure fixtures themselves are verified by the tests that use them
- `mail-capture.ts` verified by forgot-password and magic-link tests (which send real emails)
- `db-helpers.ts` verified by reset-password and invitation tests (which need token creation)
- Global setup changes verified by smoke test extensions (check new env vars populated)
