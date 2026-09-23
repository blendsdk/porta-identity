# Configuration API

> **Last Updated**: 2026-09-17

Manage the closed deployment-global operational catalog stored as native JSONB values in
`system_config`. There are exactly 18 editable settings; keys cannot be created, renamed or deleted.
See the [editable catalog and external settings](../guide/environment.md#editable-global-configuration)
for defaults, inclusive bounds and application modes. Infrastructure, bootstrap identities and
secrets are outside this API, not values that it returns with masking.

**Base path:** `/api/admin/config`

## Endpoints and Permissions

All endpoints require normal Admin authentication and the exact permission below.

| Method and path              | Permission            | Successful response                                 |
| ---------------------------- | --------------------- | --------------------------------------------------- |
| `GET /api/admin/config`      | `admin:config:read`   | `{ data: ConfigEntry[] }`, complete catalog order   |
| `GET /api/admin/config/:key` | `admin:config:read`   | `{ data: ConfigEntry }`                             |
| `PUT /api/admin/config/:key` | `admin:config:update` | `{ data: ConfigEntry, restartRequired: boolean }`   |
| `PUT /api/admin/config`      | `admin:config:update` | `{ data: ConfigEntry[], restartRequired: boolean }` |

These are global settings, not organization-scoped configuration. Server authorization remains
mandatory regardless of CLI or Admin UI button availability.

## Authoritative Entry Metadata

`GET /api/admin/config/access_token_ttl` returns:

```json
{
  "data": {
    "key": "access_token_ttl",
    "group": "lifetimes",
    "label": "Access token lifetime",
    "description": "How long newly issued access tokens remain valid.",
    "value": 3600,
    "defaultValue": 3600,
    "valueType": "integer",
    "unit": "seconds",
    "minimum": 60,
    "maximum": 86400,
    "applicationMode": "restart-required",
    "updatedAt": "2026-09-17T00:00:00.000Z"
  }
}
```

Values are native JSON numbers, not quoted numeric strings. The locale entry uses a native string,
`valueType: "string"`, `unit: "locale"` and `allowedValues: ["en"]` instead of integer bounds.
Groups are `lifetimes`, `rate-limits`, `lockout` and `general`. Code owns labels, descriptions,
defaults, bounds and modes; clients cannot edit that metadata.

List/get responses are authoritative: missing, corrupt or unavailable stored values fail the
request. They never substitute runtime fallback defaults or return a partial catalog.

## Update One Value

```http
PUT /api/admin/config/access_token_ttl
Content-Type: application/json
```

```json
{ "value": 7200 }
```

The response contains the updated complete entry in `data` and `restartRequired: true`.
The body must contain exactly `value`; `description` or other extra fields are not accepted.
Use `{ "value": "en" }` when updating `default_locale`.

## Update an Atomic Batch

```http
PUT /api/admin/config
Content-Type: application/json
```

```json
{
  "values": {
    "magic_link_ttl": 1200,
    "access_token_ttl": 7200
  }
}
```

The response contains the two updated complete entries in catalog order and `restartRequired: true`.
`values` must be a non-empty object of catalog keys and native scalars, with no extra envelope fields.
All targets and values are validated before mutation. One database transaction updates every target
and writes one `admin.config.updated` audit record containing keys and restart status, not values.
An update or audit failure rolls back the entire batch. Missing targets are not recreated.

## Validation and Safe Errors

Integer settings accept only finite integers inside inclusive bounds. Strings containing numbers,
fractions, booleans, objects, arrays and null are invalid. Locale must exactly match a supported
choice; currently only `en` is supported.

| Status | Code                       | Meaning                                                                            |
| ------ | -------------------------- | ---------------------------------------------------------------------------------- |
| `400`  | `config_value_invalid`     | Invalid native value, empty batch or invalid body shape                            |
| `404`  | `config_entry_not_found`   | Unknown, internal, secret or environment-owned key; one uniform response           |
| `503`  | `config_store_unavailable` | Authoritative storage unavailable, missing or invalid; fixed error and `requestId` |

Normal Admin authentication/permission failures remain `401`/`403`. Error responses do not expose
stored content, database diagnostics or infrastructure. After a transport failure the mutation
outcome may be unknown: read authoritative values before deciding what to do, rather than automatically
replaying an update.

## Cache and Restart Behavior

After a successful save commits, Porta clears the local process cache; subsequent runtime reads
see the saved policy immediately. Other healthy server instances pick up runtime changes on their
next read within the existing at-most-60-second cache lifetime. There is no broadcast invalidation.

The five `restart-required` lifetime settings require restarting every Porta server instance.
Saving them does not reconfigure an already running OIDC provider. Runtime-only updates return
`restartRequired: false`; any startup key in a batch makes it `true`. Porta does not automatically
restart servers. Existing absolute token/link expiries and Redis counter expiries are not rewritten.

## SDK and Admin UI

The SDK returns entries from `config.list()`/`config.get(key)` and preserves result envelopes from
`config.set(key, value)`/`config.setMany(values)`:

```ts
const result = await client.config.setMany({ magic_link_ttl: 1200 });
console.log(result.restartRequired); // false for a runtime-only batch
```

In `porta admin`, open **System Configuration…**. Four tabs share one Save/Cancel footer. Save sends
only valid changed values in one batch; startup updates show the all-instance restart notice.
