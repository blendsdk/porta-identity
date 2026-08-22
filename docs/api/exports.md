# Data Export API

The data export API enables bounded CSV or JSON downloads. Every endpoint requires
`admin:export:read` plus the entity-specific read permission. Exports exclude passwords, secrets,
private keys, raw audit metadata, and infrastructure details.

## Endpoints

| Method | Path                              | Permission                                | Description                                               |
| ------ | --------------------------------- | ----------------------------------------- | --------------------------------------------------------- |
| `GET`  | `/api/admin/export/users`         | `admin:export:read` + `admin:user:read`   | Export tenant users                                       |
| `GET`  | `/api/admin/export/organizations` | `admin:export:read` + `admin:org:read`    | Export organizations                                      |
| `GET`  | `/api/admin/export/clients`       | `admin:export:read` + `admin:client:read` | Export tenant clients                                     |
| `GET`  | `/api/admin/export/roles`         | `admin:export:read` + `admin:role:read`   | Export roles for an exact tenant/application relationship |
| `GET`  | `/api/admin/export/audit`         | `admin:export:read` + `admin:audit:read`  | Export allowlisted audit details                          |

## Query Parameters

| Parameter        | Type         | Default | Description                                           |
| ---------------- | ------------ | ------- | ----------------------------------------------------- |
| `format`         | string       | `json`  | Export format: `json` or `csv`                        |
| `organizationId` | UUID         | —       | Required for users, clients, roles, and audit exports |
| `applicationId`  | UUID         | —       | Required with `organizationId` for roles              |
| `startDate`      | ISO datetime | —       | Required inclusive audit-window start                 |
| `endDate`        | ISO datetime | —       | Required inclusive audit-window end                   |

## Export Users

```http
GET /api/admin/export/users?format=csv&organizationId=uuid
Authorization: Bearer <token>
```

### Exported Fields

| Field            | Description               |
| ---------------- | ------------------------- |
| `id`             | User UUID                 |
| `email`          | Email address             |
| `status`         | Account status            |
| `given_name`     | First name                |
| `family_name`    | Last name                 |
| `nickname`       | Nickname                  |
| `locale`         | Preferred locale          |
| `email_verified` | Email verification status |
| `phone_number`   | Phone number              |
| `created_at`     | Creation timestamp        |
| `updated_at`     | Last update timestamp     |
| `last_login_at`  | Last login timestamp      |
| `login_count`    | Total login count         |

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

- Limited to **10,000 rows** per export; 10,001 or more returns `export_too_large` with no partial body
- Date range filtering via `startDate` and `endDate`
- Audit rows expose only `id`, event classification, actor ID, timestamp, and event-specific
  `safe_details`; raw metadata, IP address, user agent, descriptions, bodies, and errors are omitted

## Response Headers

All export responses include:

```http
Content-Type: text/csv
Content-Disposition: attachment; filename="users-export-2026-01-15T10-30-00.csv"
```

## CSV Format

- First row is the column header
- Values containing commas, quotes, or newlines are properly escaped
- Cells whose first non-whitespace character is `=`, `+`, `-`, or `@` receive an inert apostrophe
  before RFC-compatible quoting
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
