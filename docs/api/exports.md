# Data Export API

The data export API enables downloading entity data in CSV or JSON format. Exports exclude sensitive data (passwords, secrets, keys).

## Endpoints

| Method | Path | Permission | Description |
|--------|------|-----------|-------------|
| `GET` | `/api/admin/export/users` | `user:read` | Export users |
| `GET` | `/api/admin/export/organizations` | `org:read` | Export organizations |
| `GET` | `/api/admin/export/clients` | `client:read` | Export clients |
| `GET` | `/api/admin/export/roles` | `role:read` | Export roles |
| `GET` | `/api/admin/export/audit` | `audit:read` | Export audit log |

## Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `format` | string | `json` | Export format: `json` or `csv` |
| `organizationId` | UUID | — | Required for users, clients, audit exports |
| `applicationId` | UUID | — | Required for roles export |
| `startDate` | ISO datetime | — | Start date filter (audit only) |
| `endDate` | ISO datetime | — | End date filter (audit only) |

## Export Users

```http
GET /api/admin/export/users?format=csv&organizationId=uuid
Authorization: Bearer <token>
```

### Exported Fields

| Field | Description |
|-------|-------------|
| `id` | User UUID |
| `email` | Email address |
| `status` | Account status |
| `given_name` | First name |
| `family_name` | Last name |
| `nickname` | Nickname |
| `locale` | Preferred locale |
| `email_verified` | Email verification status |
| `phone_number` | Phone number |
| `created_at` | Creation timestamp |
| `updated_at` | Last update timestamp |
| `last_login_at` | Last login timestamp |
| `login_count` | Total login count |

> **Security**: Password hashes, secrets, and other sensitive fields are **never** included in exports.

## Export Organizations

```http
GET /api/admin/export/organizations?format=json
Authorization: Bearer <token>
```

No `organizationId` parameter required — exports all organizations.

## Export Audit Log

```http
GET /api/admin/export/audit?format=csv&organizationId=uuid&startDate=2026-01-01T00:00:00Z&endDate=2026-01-31T23:59:59Z
Authorization: Bearer <token>
```

- Limited to **10,000 rows** per export
- Date range filtering via `startDate` and `endDate`

## Response Headers

All export responses include:

```http
Content-Type: text/csv
Content-Disposition: attachment; filename="users-export-2026-01-15T10-30-00.csv"
```

## CSV Format

- First row is the column header
- Values containing commas, quotes, or newlines are properly escaped
- Null values are represented as empty strings
- Dates are formatted as ISO 8601

## JSON Format

```json
{
  "data": [...],
  "exportedAt": "2026-01-15T10:30:00Z",
  "total": 42
}
```
