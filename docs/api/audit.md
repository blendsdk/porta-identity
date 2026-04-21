# Audit Log API

View the audit trail of administrative and security events.

**Base path:** `/api/admin/audit`

## List Audit Events

```http
GET /api/admin/audit
```

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | integer | Page number (default: 1) |
| `pageSize` | integer | Items per page (default: 20) |
| `action` | string | Filter by action type |
| `entity_type` | string | Filter by entity type |
| `entity_id` | uuid | Filter by entity ID |
| `actor_id` | uuid | Filter by actor (who performed the action) |
| `organization_id` | uuid | Filter by organization |
| `from` | ISO 8601 | Start date/time |
| `to` | ISO 8601 | End date/time |

**Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "event-uuid",
      "action": "organization.created",
      "entityType": "organization",
      "entityId": "org-uuid",
      "actorId": "user-uuid",
      "actorEmail": "admin@example.com",
      "organizationId": "org-uuid",
      "metadata": {
        "name": "Acme Corp",
        "slug": "acme-corp"
      },
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "total": 156,
    "page": 1,
    "pageSize": 20,
    "totalPages": 8
  }
}
```

## Audit Event Types

### Organization Events

| Action | Description |
|--------|-------------|
| `organization.created` | New organization created |
| `organization.updated` | Organization details updated |
| `organization.suspended` | Organization suspended |
| `organization.activated` | Organization reactivated |
| `organization.archived` | Organization archived |
| `organization.branding_updated` | Branding settings changed |

### User Events

| Action | Description |
|--------|-------------|
| `user.created` | New user created |
| `user.invited` | User invitation sent |
| `user.updated` | User profile updated |
| `user.suspended` | User suspended |
| `user.activated` | User activated |
| `user.locked` | User locked (security) |
| `user.unlocked` | User unlocked |
| `user.archived` | User archived |
| `user.password_changed` | Password changed |
| `user.login_success` | Successful login |
| `user.login_failure` | Failed login attempt |

### Client Events

| Action | Description |
|--------|-------------|
| `client.created` | New OIDC client created |
| `client.updated` | Client configuration updated |
| `client.revoked` | Client revoked |
| `client.secret_generated` | New client secret generated |
| `client.secret_revoked` | Client secret revoked |

### RBAC Events

| Action | Description |
|--------|-------------|
| `role.created` | New role created |
| `role.updated` | Role updated |
| `role.archived` | Role archived |
| `role.permission_assigned` | Permission assigned to role |
| `role.permission_removed` | Permission removed from role |
| `user.role_assigned` | Role assigned to user |
| `user.role_removed` | Role removed from user |

### Security Events

| Action | Description |
|--------|-------------|
| `security.login_method_disabled` | Attempted login via disabled method |
| `security.2fa_enabled` | 2FA enabled for user |
| `security.2fa_disabled` | 2FA disabled for user |
| `security.rate_limited` | Rate limit triggered |

### GDPR Events

| Action | Description |
|--------|-------------|
| `user.data_exported` | User data exported (GDPR Article 20) |
| `user.data_purged` | User data purged (GDPR Article 17) |

### Account Lockout Events

| Action | Description |
|--------|-------------|
| `user.auto_locked` | Account auto-locked after failed login threshold |
| `user.auto_unlocked` | Account auto-unlocked after cooldown expired |

::: info
Audit events are **fire-and-forget** — they are written asynchronously to avoid impacting request latency. All events include the actor (who), the entity (what), and metadata (details). If an audit write fails, a WARN-level log entry is emitted.
:::

## Audit Retention & Cleanup

Porta supports configurable audit log retention with automatic cleanup of old entries.

### Configure Retention

The retention period is managed via the `audit_retention_days` system configuration key:

```bash
# Set retention to 365 days
porta config set --key audit_retention_days --value 365
```

### Cleanup Old Entries

```http
DELETE /api/admin/audit/cleanup
```

Deletes audit log entries older than the configured `audit_retention_days` value.

**Response:** `200 OK`

```json
{
  "deleted": 1542,
  "retentionDays": 365,
  "cutoffDate": "2025-04-21T00:00:00.000Z"
}
```

::: warning
Audit cleanup is irreversible. Ensure your retention period meets your compliance requirements before running cleanup. Consider exporting old audit data to cold storage before purging.
:::
