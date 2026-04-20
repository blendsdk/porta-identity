# Custom Claims API

Manage custom claim definitions and user claim values.

## Claim Definitions

**Base path:** `/api/admin/applications/:appId/claims`

### Create Claim Definition

```http
POST /api/admin/applications/:appId/claims
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | ✅ | Claim name |
| `claim_type` | string | ✅ | `string`, `number`, `boolean`, or `json` |
| `description` | string | | Description |
| `validation_rules` | object | | Type-specific validation rules |

```json
{
  "name": "department",
  "claim_type": "string",
  "description": "Employee department",
  "validation_rules": {
    "required": true,
    "enum": ["Engineering", "Sales", "Marketing", "Support"]
  }
}
```

**Response:** `201 Created`

### List Claim Definitions

```http
GET /api/admin/applications/:appId/claims
```

**Response:** `200 OK` — All claim definitions for the application.

### Get Claim Definition

```http
GET /api/admin/applications/:appId/claims/:claimId
```

### Update Claim Definition

```http
PUT /api/admin/applications/:appId/claims/:claimId
```

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | Updated description |
| `validation_rules` | object | Updated validation rules |

### Archive Claim Definition

```http
POST /api/admin/applications/:appId/claims/:claimId/archive
```

---

## User Claim Values

### Set User Claim Value

```http
PUT /api/admin/applications/:appId/claims/:claimId/users/:userId
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `value` | any | ✅ | Value matching the claim's type |

The value is validated against the claim definition's `validation_rules` before storage.

```json
{ "value": "Engineering" }
```

**Response:** `200 OK`

### Get User Claim Value

```http
GET /api/admin/applications/:appId/claims/:claimId/users/:userId
```

### Remove User Claim Value

```http
DELETE /api/admin/applications/:appId/claims/:claimId/users/:userId
```

### List All Claim Values for a User

```http
GET /api/admin/applications/:appId/claims/users/:userId
```

**Response:** `200 OK` — All claim values for the user within the application.
