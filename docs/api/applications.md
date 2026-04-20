# Applications API

Manage applications (SaaS products) that clients and RBAC are scoped to.

**Base path:** `/api/admin/applications`

## Create Application

```http
POST /api/admin/applications
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Application display name |
| `slug` | string | | URL slug (auto-generated from name) |
| `description` | string | | Description of the application |

```json
{
  "name": "ERP System",
  "description": "Enterprise resource planning application"
}
```

**Response:** `201 Created`

## List Applications

```http
GET /api/admin/applications
```

Supports `page`, `pageSize`, `search`, `status`, `sort`, `order` parameters.

**Response:** `200 OK` — Paginated list of applications.

## Get Application

```http
GET /api/admin/applications/:id
```

**Response:** `200 OK` — Full application object.

## Update Application

```http
PUT /api/admin/applications/:id
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name |
| `description` | string | Description |

**Response:** `200 OK`

## Archive / Activate / Deactivate

```http
POST /api/admin/applications/:id/archive
POST /api/admin/applications/:id/activate
POST /api/admin/applications/:id/deactivate
```

**Response:** `200 OK` — Updated application with new status.

## Application Modules

Modules are logical groupings within an application (e.g., CRM, Invoicing, HR).

### Add Module

```http
POST /api/admin/applications/:id/modules
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Module name |
| `slug` | string | | Module slug |
| `description` | string | | Module description |

### List Modules

```http
GET /api/admin/applications/:id/modules
```

### Update Module

```http
PUT /api/admin/applications/:id/modules/:moduleId
```

### Deactivate Module

```http
POST /api/admin/applications/:id/modules/:moduleId/deactivate
```
