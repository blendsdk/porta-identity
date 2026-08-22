# Data Import API

The data import API enables importing configuration from a JSON manifest, supporting migration between Porta servers. Supports three modes: merge, overwrite, and dry-run.

## Endpoints

| Method | Path                | Permission           | Description                   |
| ------ | ------------------- | -------------------- | ----------------------------- |
| `POST` | `/api/admin/import` | `admin:import:write` | Import configuration manifest |

## Import Modes

| Mode        | Behavior                                                                                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `merge`     | Skip existing tenant-qualified natural keys unchanged and create missing entities                                                                          |
| `overwrite` | Create missing entities and update only documented presentation/configuration fields; ownership, IDs, protocol authority, and credentials remain unchanged |
| `dry-run`   | Run the same planner against a repeatable-read snapshot without writes, audit entries, identifiers, or generated secrets (default)                         |

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
  "default_locale": "en",
  "branding_company_name": "Acme Corporation"
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
  "created": [{ "type": "organization", "slug": "acme-corp", "name": "Acme Corp" }],
  "updated": [
    {
      "type": "application",
      "slug": "my-app",
      "name": "My App",
      "changes": ["name", "description"]
    }
  ],
  "skipped": [{ "type": "role", "slug": "admin", "reason": "Already exists" }],
  "credentials": [
    {
      "clientName": "api",
      "clientType": "confidential",
      "credentialWillBeGenerated": true
    }
  ]
}
```

Successful responses never contain an `errors` array. A committed confidential-client create
returns its generated client ID and secret once, after the database commit. Dry-run responses use
only `credentialWillBeGenerated`; they contain no generated identifier or secret.

## Security

- Import **never** processes: client secrets, user passwords, signing keys, session data, audit logs
- All changes use one **repeatable-read PostgreSQL transaction** — all succeed or all roll back
- Version, unknown fields, duplicate natural keys, parents, collisions, and secret-equivalent input
  are rejected before mutation
- Overwrite never moves ownership, changes security authority, or rotates existing credentials
- The audit entry retains only actor, mode, version, manifest digest, and aggregate counts

## Error Handling

| Error                                                | Status | Description                                                                                    |
| ---------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| Invalid manifest schema                              | `400`  | Manifest doesn't match expected format                                                         |
| Unsupported manifest version                         | `400`  | Version is not `1.0`                                                                           |
| Missing parent, collision, or immutable-field change | `409`  | Whole manifest rejected with no mutation                                                       |
| Transaction failure                                  | `503`  | Whole manifest rolled back; response carries a correlation ID but no infrastructure diagnostic |

## Related

- [Data Export API](./exports.md) — Export entity data as CSV/JSON
- [Branding API](./branding.md) — Logo/favicon asset management
