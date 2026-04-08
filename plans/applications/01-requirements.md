# Requirements: Application & Client Management

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)

## Feature Overview

Implement a three-layer entity management system:

1. **Applications** — Global product definitions (e.g., "BusinessSuite") with modules
   (e.g., "CRM", "Invoicing"). Applications are platform-wide, not scoped to an org.
2. **Clients** — OIDC registrations scoped to an organization + application pair.
   Each client has a type (confidential/public), application type (web/native/spa),
   redirect URIs, grant types, scopes, and CORS origins.
3. **Secrets** — Credentials for confidential clients, stored as Argon2id hashes.
   Multiple active secrets per client enable zero-downtime rotation. Plaintext is
   shown exactly once at creation and never stored.

## Functional Requirements

### Must Have — Applications

- [ ] Application CRUD (create, read, update, archive)
- [ ] Application slug auto-generation from name and validation
- [ ] Application status lifecycle: `active` → `inactive` → `archived`
- [ ] Application module CRUD (create, read, update, deactivate)
- [ ] Module slug namespaced per application (unique within app, not globally)
- [ ] Application list with pagination, search, and status filtering

### Must Have — Clients

- [ ] Client CRUD (create, read, update, revoke)
- [ ] Auto-generated `client_id` (32 random bytes, base64url, ~43 chars)
- [ ] Client types: `confidential` (server-side) and `public` (SPA, mobile, desktop)
- [ ] Application types: `web`, `native`, `spa`
- [ ] Configurable redirect URIs (validated, no wildcards)
- [ ] Configurable post-logout redirect URIs
- [ ] Configurable grant types per client (with smart defaults by type)
- [ ] Configurable scopes per client
- [ ] CORS allowed origins per client
- [ ] PKCE required by default (configurable per client)
- [ ] Client status lifecycle: `active` → `inactive` → `revoked`
- [ ] Client scoped to organization + application
- [ ] Token endpoint auth method per client
- [ ] Client list by organization, by application, with pagination

### Must Have — Secrets

- [ ] Secret generation (48 random bytes, base64url, ~64 chars)
- [ ] Secret stored as Argon2id hash (plaintext never stored, shown once at creation)
- [ ] Multiple active secrets per client (zero-downtime rotation)
- [ ] Secret revocation (immediate, permanent)
- [ ] Secret expiration (optional expiry date)
- [ ] Secret labels (human-readable identifier)
- [ ] Secret verification against all active secrets for a client
- [ ] Track `last_used_at` for each secret on successful verification
- [ ] Expired secret cleanup utility

### Should Have

- [ ] Redirect URI validation (HTTPS in prod, HTTP for localhost in dev)
- [ ] Client metadata mapping to node-oidc-provider format

### Won't Have (Out of Scope)

- Dynamic client registration (RFC 7591) — admin-only creation
- Client certificates (mTLS)
- Sector identifier URI validation
- Client logo/branding (org has branding, not clients)
- Bulk client creation (simplicity first)
- Secret usage statistics beyond `last_used_at`
- Automatic expiry warnings

## Technical Requirements

### Performance

- Client lookups by `client_id` must be fast (Redis-cached, 5-min TTL)
- Secret verification iterates active secrets — max ~5 active secrets per client
- Application lookups by slug must be Redis-cached

### Security

- Client IDs: cryptographically random, not guessable
- Secrets: Argon2id hashing, never stored in plaintext
- Redirect URIs: strict match, no wildcards, HTTPS enforced in production
- All write operations audit-logged

### Compatibility

- Integrates with existing `node-oidc-provider` via `findClient` callback
- Maps internal Client model to OIDC client metadata format
- Works with existing tenant resolver and CORS middleware

## Scope Decisions

| Decision                 | Options Considered                     | Chosen                        | Rationale                                     |
|--------------------------|----------------------------------------|-------------------------------|-----------------------------------------------|
| Module layout            | Single module, two modules, three      | Two: `applications/`, `clients/` | Clear separation, manageable file sizes      |
| Client ID format         | UUID, random string, prefixed          | Random base64url (32 bytes)   | Standard OIDC practice, not guessable         |
| Secret hashing           | Plaintext, bcrypt, argon2              | Argon2id                      | Most secure, resistant to GPU attacks         |
| Multiple secrets         | Single, multiple                       | Multiple active secrets       | Enables zero-downtime rotation                |
| Redirect URI wildcards   | Allow wildcards, strict match          | Strict match only             | Security best practice                        |
| Default auth method      | basic, post, none                      | `client_secret_basic`         | Most widely supported                         |
| Slug reuse from orgs     | Shared utility, per-module             | Per-module (same pattern)     | Keeps modules independent, different reserved words |

## Acceptance Criteria

1. [ ] Application CRUD operations work correctly with status lifecycle
2. [ ] Application module CRUD works with per-app slug namespacing
3. [ ] Client creation generates cryptographically random `client_id`
4. [ ] Confidential client creation returns secret plaintext exactly once
5. [ ] Secret plaintext is never stored in the database
6. [ ] Secret verification works via Argon2id comparison
7. [ ] Multiple active secrets work for the same client
8. [ ] Secret revocation is immediate and permanent
9. [ ] Expired secrets are not valid for authentication
10. [ ] Redirect URI validation enforces HTTPS in production mode
11. [ ] Default grant types are correctly set based on client/app type
12. [ ] CORS origin checking works per-client
13. [ ] Client metadata maps correctly to node-oidc-provider format
14. [ ] `last_used_at` is updated on successful secret verification
15. [ ] All write operations are audit-logged
16. [ ] Public clients have `token_endpoint_auth_method: none`
17. [ ] All API routes protected by super-admin middleware
18. [ ] All tests pass, no regressions in existing 348 tests
