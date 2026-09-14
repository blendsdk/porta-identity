# Environment Portability

The conventional CLI can export selected Porta data to one JSON manifest and import that manifest
into another Porta installation. This is for controlled environment transfer, not PostgreSQL
backup and restore.

## Export a Manifest

```bash
porta export manifest \
  --organization acme \
  --category organizations \
  --category applications_authorization \
  --application customer-portal \
  --output acme-porta.json
```

Use repeated `--application` flags or `--all-applications` when any selected category is
application-related. Organization-only exports do not accept an application selector.

| Category                     | Content                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| `organizations`              | Organization settings and branding                                                         |
| `applications_authorization` | Applications, modules, roles, permissions, claim definitions, and role-permission mappings |
| `users_assignments`          | Users, role assignments, and custom-claim values                                           |
| `oidc_clients`               | OIDC client configuration without existing secrets                                         |

For a complete non-control-plane export, use `--environment` instead of `--organization`. This
requires a super-administrator. Existing output files require confirmation; `--yes` skips only that
confirmation.

## Preview and Import

Import always previews first:

```bash
porta import manifest acme-porta.json --mode keep-existing
```

| Mode              | Behavior                                                                         |
| ----------------- | -------------------------------------------------------------------------------- |
| `keep-existing`   | Keep compatible matching records unchanged and create missing records.           |
| `update-existing` | Update allowed portable fields on compatible matches and create missing records. |

The CLI prints the ordered preview and asks before applying it. `--yes` skips that confirmation,
but not preview or server validation. A rejected preview exits without applying anything. Import
is atomic and never deletes destination records.

## Credentials and Sensitive Data

Exports omit passwords, hashes, current client secrets, signing keys, sessions, recovery material,
audit logs, database identifiers, and control-plane records. If import creates a confidential OIDC
client, its generated secret is displayed once after commit. Store it securely at that time.

## Automation Output

`--json` produces machine-readable command status. Export status contains only the output path,
attachment filename, and record counts; the manifest remains in the selected file. Import JSON
output contains the plan or committed result and may contain one-time credentials after a
successful apply.

```bash
porta export manifest \
  --organization acme \
  --category organizations \
  --output acme-porta.json \
  --yes \
  --json

porta import manifest acme-porta.json \
  --mode update-existing \
  --yes \
  --json
```

The CLI reads at most 64 MiB from one local JSON file. It does not retry mutations or write
generated secrets to another file.

## Docker Deployments

Run administrative transfers from the standalone `@portaidentity/cli` installation. The Docker
image and `docker/porta.sh` wrapper expose infrastructure commands only.

```bash
npm install -g @portaidentity/cli
porta login --server https://porta.example.com
porta export manifest --organization acme --category organizations --output acme-porta.json
```

## Related

- [Export API](/api/exports) — Selective manifest request and report exports
- [Import API](/api/imports) — Strict manifest, result, and error contract
