# Signing Keys API

Manage ES256 (ECDSA P-256) signing keys used for JWT token signing.

**Base path:** `/api/admin/keys`

## List Signing Keys

```http
GET /api/admin/keys
```

Returns all signing keys with their metadata (no private key material).

**Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "key-uuid",
      "kid": "key-id-for-jwks",
      "algorithm": "ES256",
      "status": "active",
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

## Generate New Key

```http
POST /api/admin/keys
```

Generates a new ES256 key pair. The private key is stored as PEM in the database. The public key is automatically exposed via the JWKS endpoint.

**Response:** `201 Created`

```json
{
  "id": "key-uuid",
  "kid": "new-key-id",
  "algorithm": "ES256",
  "status": "active",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

## Rotate Keys

```http
POST /api/admin/keys/rotate
```

Generates a new active key and marks the previous active key for graceful retirement. Existing tokens signed with the old key remain valid until they expire (the old public key stays in the JWKS).

**Response:** `200 OK`

::: tip Key Rotation Best Practice
Rotate keys periodically (e.g., monthly) for security. Porta supports multiple active keys so that tokens signed with the previous key remain verifiable during the transition period.
:::

## How Keys Are Used

1. **Token Signing** — When issuing JWTs, Porta uses the most recently created active key
2. **JWKS Endpoint** — All active public keys are exposed at `/{orgSlug}/auth/jwks`
3. **Token Verification** — Relying parties fetch the JWKS to verify token signatures using the `kid` header
