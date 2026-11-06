# CLI: Users

Manage users, role assignments, custom claim values, and 2FA via the `porta user` command.

**Mode:** HTTP (requires `porta login`)

## User CRUD

### `porta user create`

```bash
porta user create --org <id> --email alice@example.com \
  [--name "Alice Smith"] [--password "secure-password"]
```

| Flag         | Required | Description                                                                                                                                                             |
| ------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--org`      | ✅       | Organization ID                                                                                                                                                         |
| `--email`    | ✅       | Email address                                                                                                                                                           |
| `--name`     |          | Display name. Split into OIDC `givenName`/`familyName` on the first space (e.g. `"Alice Smith"` → given `Alice`, family `Smith`; a single token sets only `givenName`). |
| `--password` |          | Initial password (omit for a passwordless user)                                                                                                                         |

### `porta user invite`

```bash
porta user invite --org <id> --email bob@example.com \
  [--name "Bob Jones"] \
  [--role <application-id>:<role-id>] ... \
  [--claim '<application-id>:<claim-definition-id>:<json>'] ... \
  [--locale nl] \
  [--personal-message "Welcome to the team"]
```

Sends an invitation email. No account is created yet: the recipient's account
is created only when they accept the invitation and set a password. The
`--name` value is split into OIDC `givenName`/`familyName` on the first space
(same behavior as `create`). The command prints the invitation outcome:
`invitationId`, `email`, `emailDelivery`, `invitationSent`, and `expiresAt`. `emailDelivery` is
`sent`, `failed`, or `unknown`; `invitationSent` is true only when the transport accepted the
message.

| Flag                 | Required | Description                                                                                                                                                                                            |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--org`              | ✅       | Organization ID                                                                                                                                                                                        |
| `--email`            | ✅       | Email address                                                                                                                                                                                          |
| `--name`             |          | Display name, split into `givenName`/`familyName` on the first space                                                                                                                                   |
| `--role`             |          | Role to pre-assign as `<application-id>:<role-id>`. Repeat for more roles. Use `porta app list` and `porta app role list <app-id>` to find the IDs. Roles are applied when the invitation is accepted. |
| `--locale`           |          | Optional invitation language input, such as `nl`. Rendering normalizes regional tags and falls back through organization/global defaults.                                                              |
| `--personal-message` |          | Personal message included in the invitation email (max 500 characters)                                                                                                                                 |

The deferred result shape is deliberate: no user exists until the invitation is
accepted, so the command does not return a user ID. Assign additional roles after
acceptance with `porta user roles assign`.

#### Invitation claims

Repeat `--claim` to pre-assign custom claim values when the invitation is accepted. Replace each
placeholder with a real UUID and quote the entire assignment so your shell preserves JSON:

```bash
porta user invite --org <id> --email bob@example.com \
  --claim '<application-id>:<department-claim-id>:"Engineering:West"' \
  --claim '<application-id>:<preferences-claim-id>:{"newsletter":false}'
```

Only the first two colons separate identifiers; colons inside JSON are data. Strings, numbers,
objects, arrays, `true`, `false` and `null` are supported using normal JavaScript JSON number
semantics. Non-finite numbers, malformed JSON and duplicate application/claim pairs are rejected
before client creation. Duplicate detection ignores UUID case, even when values are equal.
Every `--claim` needs a value. Missing values are argument errors (exit1); explicitly empty or
negated values such as `--no-claim` are local validation errors (exit3).

The complete invitation must be encodable as ordinary JSON before any request is sent. Local
claim errors identify the option and position without echoing the submitted JSON; `--json` emits
the fixed validation envelope without an invented HTTP status. The CLI does not fetch a claim
catalogue or change server authorization/type rules. A valid JSON value can still be rejected by
the server's claim policy. Claims do not change the deferred invitation result or email-delivery
meaning described above.

The shipped invitation templates support English (`en`) and formal Dutch (`nl`). `--locale nl`
requests Dutch email copy. Unsupported input falls through organization default, global default
and English; email selection does not use browser preferences. Regional values such as `nl-NL`
are normalized for rendering, while the stored input remains unchanged. The recipient's browser
can override the invitation language on valid acceptance pages without changing the stored account
locale. See [invitation language selection](../guide/custom-ui.md#invitation-language).

## Bulk email-file invitations

```bash
porta bulk invite --file ./recipients.txt --org <organization-id> \
  --role <application-id>:<role-id> \
  --claim '<application-id>:<claim-definition-id>:"Engineering"' \
  --locale nl --personal-message "Welcome" --json
```

`--file` and `--org` are required. Roles and claims are repeatable; each claim needs its own
value. Global `--server`, `--insecure`, `--verbose` and `--json` retain their meaning. There is
no confirmation prompt, concurrency option or per-recipient name/claim override.

The file must be a readable regular UTF-8 file, at most **1,048,576 raw bytes** and **1,000 unique
recipients**. These exact limits are accepted. Invalid UTF-8 and non-regular inputs, including
pipes, are rejected. Use one ordinary ASCII email address per line with LF or CRLF endings.
One initial BOM is allowed; blank lines and surrounding whitespace are ignored. An interior BOM
or bare carriage return is invalid. For example:

```text
Alice@example.com

alice@EXAMPLE.com
bob@example.com
```

This input makes two SDK calls: `Alice@example.com` from line1 and `bob@example.com` from line4.
The repeated address counts as a duplicate. Comparison ignores case but does not remove plus tags
or merge distinct addresses. The first trimmed spelling and physical line number are retained.

All file, shared-field and complete-request encoding validation finishes before client creation.
Malformed organization/role/claim input, locale longer than 10 characters or a message longer
than 500 characters fails locally with no recipient report and no invitation calls. Locale is
trimmed and omitted if empty. Authorization, ownership, claim-type rules and locale resolution
remain server decisions; this is not a multi-recipient transaction or atomic server preflight.

### Dispatch and reports

Invitations run sequentially, one SDK method invocation per unique address. A 409 conflict is
reported as rejected and processing continues. Valid acknowledged creations also continue,
including when email delivery failed or is unknown. Other client errors, rate limiting,
authentication/authorization failure, server errors, transport failures and malformed success
responses stop the loop; later recipients are reported as unattempted. The CLI never waits on
Retry-After or retries an invitation. Existing SDK authentication recovery remains unchanged.

JSON mode writes one stdout object with exactly `summary`, `results` and `stopReason`. Each result
contains `line`, `email`, `outcome`, and only these additional fields:

| Outcome       | Additional field | Meaning                                                                                    |
| ------------- | ---------------- | ------------------------------------------------------------------------------------------ |
| `created`     | `invitation`     | Existing five-field invitation result; account creation is still deferred until acceptance |
| `rejected`    | `error`          | Safe classified error from an observed client-error response                               |
| `unknown`     | `error`          | `OUTCOME_UNKNOWN`; creation may have committed, so do not assume rejection                 |
| `unattempted` | None             | No SDK invitation call; report-level `stopReason` explains the stop                        |

`stopReason` is null or a [safe error envelope](overview.md#automation-errors). Opaque SDK
authentication failures count as unknown after invocation and omit unproven HTTP status, even
when authentication may have failed before invitation HTTP dispatch. A 5xx does not prove rollback.
Only known status and validated request metadata can appear in unknown-row errors.

The summary has `inputRecords`, `uniqueRecipients`, `duplicates`, `attempted`, `created`, `sent`,
`deliveryFailed`, `deliveryUnknown`, `rejected`, `unknown` and `unattempted`. Its invariants are:

```text
inputRecords = uniqueRecipients + duplicates
uniqueRecipients = created + rejected + unknown + unattempted
created = sent + deliveryFailed + deliveryUnknown
attempted = created + rejected + unknown
```

`attempted` counts SDK method invocations, not proven HTTP requests. SDK refresh recovery may
make more than one HTTP request inside one attempt. `deliveryUnknown` is an acknowledged
creation with unknown email delivery; `unknown` means creation itself is uncertain. Client
construction failure reports every recipient unattempted and zero attempts.

Human mode prints the ordered line/email/outcome table, delivery distinctions, counts and bounded
stop text. Neither mode prints claim values, input paths, tokens or raw external error text.
Recipient rows are unpadded and tab-separated so full addresses do not multiply into excessive
padding across the report. Counts retain the normal formatted table. Use JSON for automation.

| Exit | Meaning                                                                           |
| ---- | --------------------------------------------------------------------------------- |
| 0    | Every unique recipient was created and email delivery was sent                    |
| 1    | Any other incomplete normal result, including conflict or failed/unknown delivery |
| 2    | Final authentication/authorization stop; takes priority over earlier failures     |
| 3    | Local preflight validation failed before any report or invitation                 |

Missing required flags are parser errors with exit1. A nonzero normal JSON batch writes one
`BATCH_INCOMPLETE` envelope on stderr, carrying only safe metadata from `stopReason` when known.
This new exit policy does not change the legacy `bulk execute` policy.

### Manual recovery

Investigate **unknown creation outcomes before manually rerunning**. A later normal run calls the
SDK again; there is no persistent skip cache, resume file, automatic resend or exactly-once claim.
The existing API can replace pending invitation links on a later otherwise-identical run.
Investigate failed/unknown delivery separately from creation. Native interruption or termination
may leave a request committed without a final report; no durable checkpoint is promised.

## Remaining single-user commands

### `porta user list`

```bash
porta user list --org <id> [--status active|inactive|locked] \
  [--search "alice"] [--page 1] [--page-size 20]
```

The `--status` choices are `active`, `inactive`, and `locked`
(matching the server `UserStatus`).

### `porta user show`

```bash
porta user show --org <id> <user-id>
```

The Name column is derived from the user's `givenName`/`familyName`
(joined with a space; an em-dash when both are empty).

### `porta user update`

```bash
porta user update --org <id> <user-id> [--name "Alice Johnson"]
```

`--name` is split into `givenName`/`familyName` just like `create`.

---

## Status Management

```bash
porta user deactivate  --org <id> <user-id>   # active → inactive
porta user activate    --org <id> <user-id>   # inactive → active
```

Administrators manage only the `active` and `inactive` lifecycle states. The
server may temporarily report `locked` after failed login attempts and restores
the account automatically after the configured cooldown.

### `porta user set-password`

```bash
porta user set-password --org <id> <user-id> --password "new-password"
```

### `porta user history`

```bash
porta user history --org <id> <user-id>
```

Returns the current first-page history envelope.

## Interactive Admin UI

After `porta admin` authenticates and an organization is selected, open the Users menu to browse,
search, filter, create, or invite users. Enter on a user row opens its detail view. Available profile,
credential, history, lifecycle, and Delete actions are shown only when the verified identity has the
corresponding permission. The detail view also offers **Roles** when the administrator can read
roles. That modal lists direct assignments across applications and allows assignments and removals
only when the corresponding capability is available. Import and export are not part of this screen.

The invite dialog also offers a **Roles** selector when the administrator can both assign roles and
read applications. The checklist is optional: checked roles are sent with the invitation and applied
when it is accepted, while an invitation without roles remains valid. If the role catalog cannot be
read, the dialog reports that role options are unavailable and still allows the invitation to be
sent. The selector never retries automatically and never assigns roles before acceptance.

---

## User Roles

Assign and manage a user's direct RBAC role assignments within one organization. The role itself
belongs to an application, so use `porta app role list <app-id>` to find its ID.

### `porta user roles assign`

```bash
porta user roles assign --org <org-id> <user-id> --role <role-id>
```

### `porta user roles remove`

```bash
porta user roles remove --org <org-id> <user-id> --role <role-id>
```

### `porta user roles list`

```bash
porta user roles list --org <org-id> <user-id>
```

The list shows the role ID, name, slug, and creation date. Removing a role can invalidate the
current admin session; authenticate again when the command reports that reauthentication is
required.

---

## User Custom Claims

Set and manage custom claim values for a user. Each subcommand requires the application that owns
the claim definition; the server addresses values through the application path.

### `porta user claims set`

```bash
porta user claims set --org <org-id> --app <app-id> <user-id> \
  --claim <claim-id> --value "Engineering"
```

### `porta user claims remove`

```bash
porta user claims remove --org <org-id> --app <app-id> <user-id> --claim <claim-id>
```

### `porta user claims list`

```bash
porta user claims list --org <org-id> --app <app-id> <user-id>
```

---

## Two-Factor Authentication

Admin commands for managing a user's 2FA enrollment. By default, these commands use HTTP mode (authenticated via `porta login`). Use `--direct` to bypass HTTP and connect directly to the database (useful for emergency access when the server is down).

**Permission required:** `admin:user:2fa` (for disable, reset, and recovery code operations)

### `porta user 2fa status`

```bash
# HTTP mode (default — requires porta login)
porta user 2fa status --org-id <id> --user-id <id>

# Direct mode (connects directly to database)
porta user 2fa status --user-id <id> --direct
```

Shows whether 2FA is enabled, the active method (`email` or `totp`), TOTP configuration status, and remaining recovery code count.

| Flag        | Required  | Description                                    |
| ----------- | --------- | ---------------------------------------------- |
| `--org-id`  | HTTP mode | Organization ID (not needed in direct mode)    |
| `--user-id` | ✅        | User ID                                        |
| `--direct`  |           | Use direct database connection instead of HTTP |
| `--json`    |           | Output as JSON                                 |

### `porta user 2fa disable`

```bash
# HTTP mode
porta user 2fa disable --org-id <id> --user-id <id>

# Direct mode
porta user 2fa disable --user-id <id> --direct
```

Force-disables 2FA for the user. Prompts for confirmation (use `--force` to skip). Protected: cannot disable the super-admin user's 2FA.

| Flag        | Required  | Description                    |
| ----------- | --------- | ------------------------------ |
| `--org-id`  | HTTP mode | Organization ID                |
| `--user-id` | ✅        | User ID                        |
| `--direct`  |           | Use direct database connection |
| `--force`   |           | Skip confirmation prompt       |

### `porta user 2fa reset`

```bash
# HTTP mode
porta user 2fa reset --org-id <id> --user-id <id>

# Direct mode
porta user 2fa reset --user-id <id> --direct
```

Resets 2FA by disabling and clearing all enrollment data, forcing the user to re-enroll on next login. Prompts for confirmation. Protected: cannot reset the super-admin user's 2FA.

| Flag        | Required  | Description                    |
| ----------- | --------- | ------------------------------ |
| `--org-id`  | HTTP mode | Organization ID                |
| `--user-id` | ✅        | User ID                        |
| `--direct`  |           | Use direct database connection |
| `--force`   |           | Skip confirmation prompt       |

---

## Data Export and Deletion

Commands for data portability and physical user deletion.

### `porta user export`

```bash
porta user export --org-id <id> --user-id <id>
```

Exports all personal data for a user as a JSON document. The export includes profile data, organization membership, role assignments, custom claim values, audit log entries, 2FA enrollment status, and active OIDC sessions.

Use `--json` to pipe the output to a file:

```bash
porta user export --org-id <id> --user-id <id> --json > user-data.json
```

### `porta user delete`

```bash
porta user delete <org-id> <user-id>
```

Permanently deletes the user and owned identity and security data. This includes role assignments,
claim values, credentials, recovery data, and server-backed sessions. Audit history is retained
separately under the configured audit policy and can still identify the deleted user.

The CLI always asks whether to keep or delete the named user. There is no record-deletion
`--force` option.

::: danger Irreversible
Deletion cannot be undone. A control-plane user cannot be deleted when that would leave no other
active user with the exact built-in `porta-super-admin` role.
:::
