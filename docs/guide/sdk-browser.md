# SDK Browser Usage

This guide covers using `@portaidentity/sdk` in browser applications, such as the Porta Admin GUI or custom admin dashboards.

## Architecture: BFF Pattern

Browser-based applications **must not** store credentials client-side. Instead, use the Backend-for-Frontend (BFF) pattern:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Browser SPA │────▶│  BFF Server  │────▶│  Porta API   │
│  (SDK)       │     │  (Koa/Express)│     │  /api/admin  │
└──────────────┘     └──────────────┘     └──────────────┘
       │                    │
  BrowserTransport     Proxies + injects
  (CSRF cookies)       Bearer token
```

The BFF handles OIDC authentication and stores tokens server-side. The browser SDK communicates with the BFF, which proxies requests to Porta's Admin API.

## Setup

### Install

```bash
yarn add @portaidentity/sdk
```

### Create Client

```typescript
import { createPortaClient } from '@portaidentity/sdk';
import { createBrowserTransport } from '@portaidentity/sdk/browser';

const transport = createBrowserTransport({
  // BFF proxy endpoint — NOT the Porta API directly
  baseUrl: '/api/admin',

  // CSRF cookie name (must match BFF configuration)
  csrfCookieName: 'porta.csrf',

  // Optional: redirect to login on 401
  onUnauthorized: () => {
    window.location.href = '/auth/login';
  },
});

const porta = createPortaClient({ transport });
```

## CSRF Protection

The `BrowserTransport` automatically:

1. Reads the CSRF token from the configured cookie
2. Sends it as `X-CSRF-Token` header on every mutating request (POST, PUT, PATCH, DELETE)
3. GET requests are sent without the CSRF header

This matches the double-submit cookie pattern used by the Porta Admin GUI BFF.

### Cookie Configuration

The BFF must set the CSRF cookie as a non-HttpOnly cookie so JavaScript can read it:

```typescript
// BFF server (Koa example)
ctx.cookies.set('porta.csrf', csrfToken, {
  httpOnly: false,  // Must be readable by JavaScript
  secure: true,
  sameSite: 'strict',
  path: '/',
});
```

## Common Patterns

### List with Pagination

```typescript
const orgs = await porta.organizations.list({ page: 1, pageSize: 20 });

// orgs.data — array of organizations
// orgs.total — total count
// orgs.page, orgs.pageSize — current pagination
```

### ETag / Optimistic Concurrency

```typescript
// Read with ETag
const { data: org, etag } = await porta.organizations.get('my-org');

// Update with ETag (prevents concurrent overwrites)
try {
  await porta.organizations.update('my-org', { name: 'New Name' }, etag);
} catch (err) {
  if (err instanceof PortaConflictError) {
    // Someone else modified the org — refetch and retry
  }
}
```

### Error Handling in UI

```typescript
import {
  PortaValidationError,
  PortaNotFoundError,
  PortaForbiddenError,
} from '@portaidentity/sdk';

try {
  await porta.users.create({ organizationId, email, name });
} catch (err) {
  if (err instanceof PortaValidationError) {
    // Show field-level errors in form
    const fieldErrors = err.details; // { email: 'already exists', ... }
  } else if (err instanceof PortaForbiddenError) {
    showToast('You do not have permission for this action.');
  } else if (err instanceof PortaNotFoundError) {
    showToast('Resource not found.');
  }
}
```

### Dashboard Statistics

```typescript
const stats = await porta.stats.get();
// stats.organizations, stats.users, stats.clients, etc.
```

### Branding Upload

```typescript
// Upload a logo for an organization
const logoFile = fileInput.files[0];
const buffer = await logoFile.arrayBuffer();

await porta.branding.uploadAsset(orgId, 'logo', Buffer.from(buffer), 'image/png');
```

## 401 Handling

When the BFF session expires, the SDK receives a 401 response. The `onUnauthorized` callback handles this:

```typescript
const transport = createBrowserTransport({
  baseUrl: '/api/admin',
  onUnauthorized: () => {
    // Redirect to BFF login endpoint
    window.location.href = '/auth/login?returnTo=' + encodeURIComponent(window.location.pathname);
  },
});
```

## AbortSignal Support

All SDK methods accept an optional `AbortSignal` for cancellation:

```typescript
const controller = new AbortController();

// Cancel on component unmount (React pattern)
useEffect(() => {
  porta.organizations.list({ signal: controller.signal });
  return () => controller.abort();
}, []);
```

## See Also

- [SDK Overview](/guide/sdk) — Installation, quick start, full API reference
- [SDK Node.js Usage](/guide/sdk-node) — Server-side automation
- [SDK AI Agent Guide](/guide/sdk-agent) — AI integration
- [Admin GUI](/guide/admin-gui) — Admin dashboard architecture
