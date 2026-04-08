# API Routes: User Management

> **Document**: 06-api-routes.md
> **Parent**: [Index](00-index.md)

## Overview

REST API endpoints for user management under `/api/admin/organizations/:orgId/users`. All routes require super-admin authorization. Request bodies are validated with Zod schemas.

**Note:** User routes are nested under an organization context because users are always scoped to an org. This differs from organizations/applications/clients routes which are at `/api/admin/{resource}`.

## Architecture

### Files

| File | Purpose | ~Lines |
| --- | --- | --- |
| `src/routes/users.ts` | Route handlers with Zod validation | ~300 |
| `src/server.ts` | Mount user routes (3 lines added) | Modified |

## Route Structure

```
Prefix: /api/admin/organizations/:orgId/users

POST   /                  — Create a user in the organization
GET    /                  — List users (paginated, searchable)
GET    /:userId           — Get user by ID
PUT    /:userId           — Update user profile
POST   /:userId/deactivate  — Soft-delete (active → inactive)
POST   /:userId/reactivate  — Restore (inactive → active)
POST   /:userId/suspend     — Suspend (active → suspended)
POST   /:userId/unsuspend   — Unsuspend (suspended → active)
POST   /:userId/lock        — Lock (active → locked)
POST   /:userId/unlock      — Unlock (locked → active)
POST   /:userId/password    — Set/change password
DELETE /:userId/password    — Clear password (convert to passwordless)
POST   /:userId/verify-email  — Mark email as verified
```

## Zod Validation Schemas

```typescript
// Create user
const createUserSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128).optional(),
  emailVerified: z.boolean().default(false),
  givenName: z.string().max(255).optional(),
  familyName: z.string().max(255).optional(),
  middleName: z.string().max(255).optional(),
  nickname: z.string().max(255).optional(),
  preferredUsername: z.string().max(255).optional(),
  profileUrl: z.string().url().optional(),
  pictureUrl: z.string().url().optional(),
  websiteUrl: z.string().url().optional(),
  gender: z.string().max(50).optional(),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),  // ISO 8601 date
  zoneinfo: z.string().max(50).optional(),
  locale: z.string().max(10).optional(),
  phoneNumber: z.string().max(50).optional(),
  address: z.object({
    street: z.string().nullable().optional(),
    locality: z.string().max(255).nullable().optional(),
    region: z.string().max(255).nullable().optional(),
    postalCode: z.string().max(20).nullable().optional(),
    country: z.string().length(2).nullable().optional(),  // ISO 3166-1 alpha-2
  }).optional(),
});

// Update user
const updateUserSchema = z.object({
  givenName: z.string().max(255).nullable().optional(),
  familyName: z.string().max(255).nullable().optional(),
  middleName: z.string().max(255).nullable().optional(),
  nickname: z.string().max(255).nullable().optional(),
  preferredUsername: z.string().max(255).nullable().optional(),
  profileUrl: z.string().url().nullable().optional(),
  pictureUrl: z.string().url().nullable().optional(),
  websiteUrl: z.string().url().nullable().optional(),
  gender: z.string().max(50).nullable().optional(),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  zoneinfo: z.string().max(50).nullable().optional(),
  locale: z.string().max(10).nullable().optional(),
  phoneNumber: z.string().max(50).nullable().optional(),
  phoneNumberVerified: z.boolean().optional(),
  address: z.object({
    street: z.string().nullable().optional(),
    locality: z.string().max(255).nullable().optional(),
    region: z.string().max(255).nullable().optional(),
    postalCode: z.string().max(20).nullable().optional(),
    country: z.string().length(2).nullable().optional(),
  }).nullable().optional(),
});

// List users
const listUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'inactive', 'suspended', 'locked']).optional(),
  search: z.string().max(255).optional(),
  sortBy: z.enum(['email', 'given_name', 'family_name', 'created_at', 'last_login_at']).default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Set password
const setPasswordSchema = z.object({
  password: z.string().min(8).max(128),
});

// Lock user
const lockUserSchema = z.object({
  reason: z.string().min(1).max(500),
});

// Suspend user (reason optional)
const suspendUserSchema = z.object({
  reason: z.string().max(500).optional(),
});
```

## Error Mapping

```typescript
function handleError(ctx, err) {
  if (err instanceof UserNotFoundError) ctx.throw(404, err.message);
  if (err instanceof UserValidationError) ctx.throw(400, err.message);
  if (err instanceof z.ZodError) {
    ctx.status = 400;
    ctx.body = { error: 'Validation failed', details: err.issues };
    return;
  }
  throw err;  // Unknown error — global error handler catches it
}
```

Same pattern as organization routes.

## Server Integration

```typescript
// In src/server.ts — add after client router
import { createUserRouter } from './routes/users.js';

const userRouter = createUserRouter();
app.use(userRouter.routes());
app.use(userRouter.allowedMethods());
```

## Response Format

All responses follow existing conventions:
- **Single resource:** `{ data: User }`
- **List:** `{ data: User[], total, page, pageSize, totalPages }`
- **Status change:** `204 No Content`
- **Create:** `201 Created` with `{ data: User }`
- **Password set:** `204 No Content`
- **Password clear:** `204 No Content`
- **Verify email:** `204 No Content`

## Testing Requirements

- Create user: valid, missing email, duplicate email, with password, without password, with address
- Get user by ID: found, not found, wrong org
- List users: pagination, status filter, search, sorting
- Update user: valid, not found, null fields (clearing)
- Status transitions: all valid + all invalid
- Password: set, clear, set with invalid length
- Verify email
- Zod validation: invalid email format, invalid birthdate, too-short password
- Error handling: 404 for not found, 400 for validation errors
