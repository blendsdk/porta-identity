# Data Import API

The data import API enables importing configuration from a JSON manifest, supporting migration between Porta servers. Supports three modes: merge, overwrite, and dry-run.

## Endpoints

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| `POST` | `/api/admin/import` | `import:write` | Import configuration manifest |

## Import Modes

| Mode | Behavior |
|------|----------|
| `merge` | Skip existing entities (match by slug), create new ones only |
| `overwrite` | Update existing entities, create new ones |
| `dry-run` | Show what would change without applying (default) |

## Request

```http
POST /api/admin/import
Authorization: Bearer <token>
Content-Type: application/json

{
  "mode": "dry-run",
  "manifest": {
    "version": "1.0",
    "organizations": [...],
    "applications": [...],
    "clients": [...],
    "roles": [...],
    "permissions": [...],
    "claim_definitions": [...]
  }
}
```

## Manifest Format

The manifest is a versioned JSON envelope containing entity arrays. All entity types are optional.

### Version

Currently only `"1.0"` is supported. Incompatible versions are rejected with `400 Bad Request`.

### Entity Types

Entities are processed in **dependency order** to satisfy foreign key constraints:

1. **Organizations** — No dependencies
2. **Applications** — Depend on organizations (via `organization_slug`)
3. **Clients** — Depend on applications (via `application_slug` + `organization_slug`)
4. **Roles** — Depend on applications
5. **Permissions** — Depend on applications
6. **Claim Definitions** — Depend on applications

### Organization Schema

```json
{
  "name": "Acme Corp",
  "slug": "acme-corp",
  "display_name": "Acme Corporation",
  "contact_email": "admin@acme.com",
  "plan": "enterprise"
}
```

### Application Schema

```json
{
  "name": "My App",
  "slug": "my-app",
  "organization_slug": "acme-corp",
  "description": "Main application"
}
```

### Client Schema

```json
{
  "client_name": "Web Client",
  "application_slug": "my-app",
  "organization_slug": "acme-corp",
  "client_type": "confidential",
  "application_type": "web",
  "grant_types": ["authorization_code"],
  "redirect_uris": ["https://app.example.com/callback"],
  "response_types": ["code"],
  "scope": "openid profile email"
}
```

### Role / Permission Schema

```json
{
  "name": "Editor",
  "slug": "editor",
  "application_slug": "my-app",
  "organization_slug": "acme-corp",
  "description": "Can edit content"
}
```

### Claim Definition Schema

```json
{
  "name": "Department",
  "slug": "department",
  "application_slug": "my-app",
  "organization_slug": "acme-corp",
  "claim_type": "string",
  "description": "User's department"
}
```

## Response

```json
{
  "mode": "dry-run",
  "created": [
    { "type": "organization", "slug": "acme-corp", "name": "Acme Corp" }
  ],
  "updated": [
    { "type": "application", "slug": "my-app", "name": "My App", "changes": ["name", "description"] }
  ],
  "skipped": [
    { "type": "role", "slug": "admin", "reason": "Already exists" }
  ],
  "errors": [
    { "type": "client", "slug": "orphan-client", "error": "Parent application 'missing-app' not found" }
  ]
}
```

## Security

- Import **never** processes: client secrets, user passwords, signing keys, session data, audit logs
- All changes are applied in a **single PostgreSQL transaction** — all succeed or all rollback
- Manifest version is checked before any processing
- All input is validated with Zod schemas
- An audit log entry is created for each import operation

## Error Handling

| Error | Status | Description |
|-------|--------|-------------|
| Invalid manifest schema | `400` | Manifest doesn't match expected format |
| Unsupported manifest version | `400` | Version is not `1.0` |
| Transaction failure | `500` | Database error, all changes rolled back |
| Missing parent entity | — | Recorded in `errors[]` array, doesn't fail the import |

## Related

- [Data Export API](./exports.md) — Export entity data as CSV/JSON
- [Branding API](./branding.md) — Logo/favicon asset management
