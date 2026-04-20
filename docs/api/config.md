# Configuration API

Manage system configuration key-value pairs stored in the `system_config` database table.

**Base path:** `/api/admin/config`

## List All Configuration

```http
GET /api/admin/config
```

Returns all configuration entries. Sensitive values (keys containing `secret`, `password`, `key`) are masked in the response.

**Response:** `200 OK`

```json
{
  "data": [
    {
      "key": "access_token_ttl",
      "value": "3600",
      "description": "Access token TTL in seconds",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    {
      "key": "refresh_token_ttl",
      "value": "86400",
      "description": "Refresh token TTL in seconds",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

## Get Configuration Value

```http
GET /api/admin/config/:key
```

**Response:** `200 OK`

```json
{
  "key": "access_token_ttl",
  "value": "3600",
  "description": "Access token TTL in seconds",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

## Set Configuration Value

```http
PUT /api/admin/config/:key
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `value` | string | ✅ | Configuration value |
| `description` | string | | Optional description |

```json
{
  "value": "7200",
  "description": "Access token TTL in seconds"
}
```

**Response:** `200 OK`

::: tip
Configuration changes are cached in memory with a 60-second TTL. After updating a value, it may take up to 60 seconds for the change to take effect across all running instances.
:::

## Common Configuration Keys

| Key | Default | Description |
|-----|---------|-------------|
| `access_token_ttl` | `3600` | Access token TTL (seconds) |
| `refresh_token_ttl` | `86400` | Refresh token TTL (seconds) |
| `id_token_ttl` | `3600` | ID token TTL (seconds) |
| `authorization_code_ttl` | `600` | Authorization code TTL (seconds) |
| `session_ttl` | `86400` | Session TTL (seconds) |
| `interaction_ttl` | `3600` | Interaction TTL (seconds) |
