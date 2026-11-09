# CLI: Resource Servers

Manage application-owned resource servers with `porta app resource-server`.

**Mode:** HTTP (requires `porta login`)

Resource servers are deployment-global definitions owned by one application. They configure the
RFC 8707 resource indicators and custom scopes used by that application's clients. See the
[Applications CLI](applications.md) for the owning command family.

## Commands

### `porta app resource-server list`

```bash
porta app resource-server list <app>
```

Lists the application's resource servers in a table. Use `--json` for machine-readable output.
An application with no rows prints `No resource servers found`.

### `porta app resource-server get`

```bash
porta app resource-server get <app> <resource-server>
```

Shows one resource server. Both arguments accept a UUID or slug. Use `--json` for the raw object.

### `porta app resource-server create`

```bash
porta app resource-server create <app> \
  --name "Billing API" \
  --identifier https://billing.example.test \
  --scope billing:read \
  --scope billing:write
```

| Option | Required | Description |
| --- | --- | --- |
| `--name` | ✅ | Resource-server display name |
| `--slug` | | Application-local slug; derived from the name when omitted |
| `--identifier` | ✅ | Exact absolute resource identifier |
| `--audience` | | Access-token audience; defaults to the identifier |
| `--scope` | | Custom scope; repeat the flag for multiple scopes |

Standard OIDC scopes (`openid`, `profile`, `email`, `address`, `phone`, `offline_access`) and
duplicate scopes are rejected. Identifiers are matched exactly; register the canonical URI form
clients will send.

### `porta app resource-server update`

```bash
porta app resource-server update <app> <resource-server> \
  --name "Billing API" \
  --slug billing-api \
  --identifier https://billing.example.test \
  --scope billing:read
```

`update` replaces the complete definition. `--name`, `--slug`, and `--identifier` are required.
An omitted `--audience` resets the audience to the identifier. An omitted `--scope` clears the
custom scope registry; repeat `--scope` to set the complete replacement set.

### `porta app resource-server delete`

```bash
porta app resource-server delete <app> <resource-server>
```

Asks for confirmation, then permanently deletes the resource server and its custom-scope registry.
Use `--yes` for non-interactive deletion.

::: warning Token impact
Already-issued access tokens remain valid until their normal expiry. New requests for the deleted
identifier or audience fail with `invalid_target`.
:::

## Output

Every command supports the global `--json` flag. Human output uses tables and success/warning
messages; JSON output prints the SDK result without table decoration.

## Examples

```bash
# List every resource server on an application
porta app resource-server list acme

# Create a resource server with two custom scopes
porta app resource-server create acme \
  --name "Billing API" \
  --identifier https://billing.example.test \
  --scope billing:read \
  --scope billing:write

# Replace its definition and clear the custom scopes
porta app resource-server update acme billing-api \
  --name "Billing API" \
  --slug billing-api \
  --identifier https://billing.example.test

# Delete without an interactive prompt
porta app resource-server delete acme billing-api --yes
```

## Related

- [Applications CLI](applications.md)
- [Resource Servers API](../api/resource-servers.md)
