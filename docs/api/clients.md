# Clients API

Manage OIDC clients. Each client belongs to an organization and an application.

**Base path:** `/api/admin/clients`

Each client is an organization-specific registration connected to one deployment-global
application; the application itself is not tenant-owned. See the
[Core ownership model](../concepts/ownership-model.md).

## Create Client

```http
POST /api/admin/clients
```

| Field                        | Type     | Required | Description                                                   |
| ---------------------------- | -------- | -------- | ------------------------------------------------------------- |
| `client_name`                | string   | ✅       | Human-readable client name                                    |
| `organization_id`            | uuid     | ✅       | Owning organization                                           |
| `application_id`             | uuid     | ✅       | Associated application                                        |
| `client_type`                | string   | ✅       | `confidential` or `public`                                    |
| `application_type`           | string   |          | `web`, `native`, or `spa` (default: `web`)                    |
| `redirect_uris`              | string[] | ✅       | Allowed redirect URIs                                         |
| `grant_types`                | string[] |          | Grant types (defaults based on client type)                   |
| `response_types`             | string[] |          | Response types                                                |
| `scope`                      | string   |          | Space-separated scopes                                        |
| `token_endpoint_auth_method` | string   |          | `client_secret_post` or `none`                                |
| `cors_origins`               | string[] |          | Allowed CORS origins (for SPAs)                               |
| `require_pkce`               | boolean  |          | Require PKCE (default: `true` for public clients)             |
| `require_consent`            | boolean  |          | Show the OIDC consent page for this client (default: `false`) |
| `login_methods`              | string[] |          | Override org default login methods                            |

```json
{
  "client_name": "ERP Web App",
  "organization_id": "org-uuid",
  "application_id": "app-uuid",
  "client_type": "public",
  "application_type": "spa",
  "redirect_uris": ["https://erp.example.com/callback"],
  "scope": "openid profile email roles custom_claims",
  "cors_origins": ["https://erp.example.com"]
}
```

**Response:** `201 Created` — Returns the client object with the generated `client_id`. For confidential clients, the initial secret is included in the response (shown only once).

## List Clients

```http
GET /api/admin/clients
```

Supports offset pagination with `page`, `pageSize`, `search`, `status`, `sort`, `order`, and
`organization_id`, or cursor pagination with `cursor` and `limit`. Cursor responses return
`nextCursor`, `previousCursor`, and `hasMore` without `total`.

**Response:** `200 OK` — Paginated list with `effectiveLoginMethods` computed for each client.

## Get Client

```http
GET /api/admin/clients/:id
```

**Response:** `200 OK` — Full client object including `effectiveLoginMethods`.

## Update Client

```http
PUT /api/admin/clients/:id
```

Updatable fields: `client_name`, `redirect_uris`, `grant_types`, `response_types`, `scope`, `cors_origins`, `require_pkce`, `require_consent`, `login_methods`.

**Response:** `204 No Content`

## Status Management

```http
POST /api/admin/clients/:id/activate
POST /api/admin/clients/:id/deactivate
```

**Response:** `200 OK`

## Delete Client

```http
DELETE /api/admin/clients/:id
```

Permanently deletes the client and its secrets. Its server-backed protocol authority and affected
sessions are revoked.

**Permission:** `admin:client:delete`

**Response:** `204 No Content`

## Client Secrets

Confidential clients can have multiple active secrets for zero-downtime rotation.

### Generate Secret

```http
POST /api/admin/clients/:id/secrets
```

| Field   | Type   | Description                   |
| ------- | ------ | ----------------------------- |
| `label` | string | Optional label for the secret |

**Response:** `201 Created`

```json
{
  "id": "secret-uuid",
  "clientId": "client-uuid",
  "label": "production-2024",
  "secret": "the-plaintext-secret",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

::: danger
The plaintext secret is shown **only once** in this response. Store it securely.
:::

### List Secrets

```http
GET /api/admin/clients/:id/secrets
```

Returns metadata only (no plaintext secrets).

### Revoke Secret

```http
POST /api/admin/clients/:id/secrets/:secretId/revoke
```

**Response:** `200 OK`

## Service-account bindings

One confidential control-plane client can be bound to a permanently noninteractive account for the
single invitation operation. These subresource routes use the internal client UUID, return
secret-free bindings, and always require a live human Super Admin.

| Method | Route | Result |
| --- | --- | --- |
| `GET` | `/api/admin/clients/:id/service-account` | `{data: binding}` |
| `PUT` | `/api/admin/clients/:id/service-account` | `201` first binding, `200` replacement |
| `DELETE` | `/api/admin/clients/:id/service-account` | `204` |

`PUT` takes `{accountEmail?, targets}`. `accountEmail` is required for the first binding and is
immutable afterwards. `targets` is the complete replacement allowlist: 1–100 ordinary
organizations, at most 100 role pairs and 100 claim-definition pairs in total, with
application-qualified references. Unknown fields, duplicates and non-UUID identifiers are rejected.

The first binding and an explicit restoration retire every existing credential of that client
without generating a replacement. Create the next secret through the existing secret endpoint.
Generating an overlapping secret does not change the authorization generation; explicitly revoking
a live secret does, so tokens issued from earlier credentials stop working for later admission.
Revoking the binding keeps the permanent ownership row and invalidates its generation.

```bash
curl -X PUT "$PORTA/api/admin/clients/$CLIENT_ID/service-account" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"accountEmail":"service.account@example.com","targets":[{"organizationId":"'$ORG_ID'","allowedRoles":[],"allowedClaimDefinitions":[]}]}'
```

After binding, the client can obtain a native token and invite into the allowlisted organizations.
Use the `admin:user:invite` scope explicitly; the token lasts 300 seconds and has no refresh grant.
The client-wide budget is 30 invitations per hour across targets. Every other Admin route remains
human-only.

For rollout, replace account-unaware server instances before creating bindings, keep the binding
revoked until the client is ready, and re-check delivery and audit after the first invitation.
Binding revocation is immediate for later attempts but does not recall invitations that were
already committed or mail that was already handed to the transport.
