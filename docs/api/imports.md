# Portability Import API

The import API previews and applies strict JSON manifests produced by the selective
[manifest export](./exports.md#selective-manifest-export). It does not accept the retired nested
provisioning format, YAML, aliases, or secret material.

## Endpoint

| Method | Path                | Base permission      | Description                          |
| ------ | ------------------- | -------------------- | ------------------------------------ |
| `POST` | `/api/admin/import` | `admin:import:write` | Preview or apply one strict manifest |

Selected categories also require their create, update, lifecycle, and assignment permissions.
Environment-scoped imports require a super-administrator.

## Request

```http
POST /api/admin/import
Authorization: Bearer <token>
Content-Type: application/json

{
  "manifest": {
    "version": "1.0",
    "exported_at": "2026-09-14T10:11:12.345Z",
    "scope": { "kind": "organization", "organization_slug": "acme" },
    "categories": ["organizations"],
    "application_selection": {
      "all_applications": false,
      "application_slugs": []
    },
    "organizations": [],
    "applications": [],
    "application_modules": [],
    "roles": [],
    "permissions": [],
    "claim_definitions": [],
    "role_permission_mappings": [],
    "users": [],
    "user_role_assignments": [],
    "user_claim_values": [],
    "clients": []
  },
  "mode": "dry-run"
}
```

Every collection is required, even when empty. Unknown fields, duplicate natural keys, invalid
relationships, unsupported versions, cross-scope references, and credential-like input are
rejected.

## Modes

| Mode              | Behavior                                                                            |
| ----------------- | ----------------------------------------------------------------------------------- |
| `dry-run`         | Validate and plan without writes, generated credentials, or audit mutation.         |
| `keep-existing`   | Reuse compatible matching records unchanged and create missing records.             |
| `update-existing` | Update documented portable fields on compatible matches and create missing records. |

Import never deletes destination records. Apply repeats validation and commits the complete
manifest in one transaction. Any rejected record prevents every write.

## Result

```json
{
  "mode": "dry-run",
  "summary": {
    "organizations": { "created": 0, "updated": 0, "skipped": 1, "rejected": 0 },
    "applications": { "created": 0, "updated": 0, "skipped": 0, "rejected": 0 },
    "application_modules": { "created": 0, "updated": 0, "skipped": 0, "rejected": 0 },
    "roles": { "created": 0, "updated": 0, "skipped": 0, "rejected": 0 },
    "permissions": { "created": 0, "updated": 0, "skipped": 0, "rejected": 0 },
    "claim_definitions": { "created": 0, "updated": 0, "skipped": 0, "rejected": 0 },
    "role_permission_mappings": { "created": 0, "updated": 0, "skipped": 0, "rejected": 0 },
    "users": { "created": 0, "updated": 0, "skipped": 0, "rejected": 0 },
    "user_role_assignments": { "created": 0, "updated": 0, "skipped": 0, "rejected": 0 },
    "user_claim_values": { "created": 0, "updated": 0, "skipped": 0, "rejected": 0 },
    "clients": { "created": 0, "updated": 0, "skipped": 0, "rejected": 0 }
  },
  "items": [
    {
      "entity_type": "organizations",
      "action": "skipped",
      "natural_key": { "slug": "acme" }
    }
  ],
  "errors": []
}
```

Items and errors remain in dependency order. A committed confidential-client creation may add
`credentials`; each generated secret is
returned once after commit with `client_id`, `label`, `secret`, and `expires_at`. Preview never
contains credentials.

## Rejected Plans

A valid manifest whose records cannot form a safe plan returns `409` with code
`import_plan_rejected` and the bounded result. Error codes are `invalid_record`,
`duplicate_natural_key`, `missing_dependency`, `ambiguous_dependency`, `incompatible_record`,
`cross_scope_reference`, `control_plane_record`, and `client_id_collision`.

| Condition                   | Status | Code                      |
| --------------------------- | ------ | ------------------------- |
| Invalid request or manifest | `400`  | `import_manifest_invalid` |
| Rejected plan               | `409`  | `import_plan_rejected`    |
| Execution failure           | `503`  | `import_execution_failed` |

## Security

- Manifests cannot carry passwords, hashes, existing client secrets, signing keys, sessions,
  recovery material, audit logs, database identifiers, or control-plane records.
- Organization scope and every natural-key relationship are checked on the server.
- Failure responses contain fixed codes and, for `503`, a request ID without infrastructure detail.
- The audit entry stores bounded operation metadata, not the manifest or generated credentials.

## Related

- [Data Export API](./exports.md) — Report downloads and selective manifest export
- [Environment Portability](/cli/provisioning) — CLI export, preview, and apply workflow
