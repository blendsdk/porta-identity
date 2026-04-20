# Bootstrap & Authentication

These commands handle initial setup and CLI authentication.

## `porta init` {#porta-init}

Bootstrap the admin infrastructure. This is typically the **first command** you run after deploying Porta and running migrations.

```bash
porta init
```

**What it does:**

1. Creates the **super-admin organization** (`porta-admin`)
2. Creates the **admin application** with the `porta-admin` RBAC role
3. Creates a **PKCE-enabled OIDC client** for the CLI
4. Creates the **first admin user** (prompts for email and password)
5. Assigns the `porta-admin` role to the first user

**Mode:** Direct DB (connects directly to PostgreSQL and Redis)

**Options:**

| Flag | Description |
|------|-------------|
| `--database-url` | Override `DATABASE_URL` |
| `--redis-url` | Override `REDIS_URL` |

**Example:**

```bash
# Interactive — prompts for admin email and password
porta init

# With explicit database URL
porta init --database-url postgresql://user:pass@localhost:5432/porta
```

::: warning
`porta init` should only be run **once** during initial deployment. Running it again will fail if the super-admin organization already exists.
:::

---

## `porta login` {#porta-login}

Authenticate with the Porta server using OIDC Authorization Code + PKCE flow.

```bash
porta login [--url <server-url>]
```

**What it does:**

1. Fetches OIDC discovery metadata from `/api/admin/metadata`
2. Generates a PKCE `code_verifier` and `code_challenge`
3. Opens your browser to the Porta login page
4. After you authenticate, captures the authorization code via a local callback server
5. Exchanges the code for access and refresh tokens
6. Stores credentials at `~/.porta/credentials.json`

**Mode:** HTTP

**Options:**

| Flag | Description |
|------|-------------|
| `--url` | Porta server URL (default: `http://localhost:3000`) |

**Example:**

```bash
# Login to local development server
porta login

# Login to production
porta login --url https://auth.example.com
```

---

## `porta logout` {#porta-logout}

Clear stored credentials.

```bash
porta logout
```

Removes the `~/.porta/credentials.json` file.

**Mode:** HTTP

---

## `porta whoami` {#porta-whoami}

Display information about the currently authenticated user.

```bash
porta whoami
```

**Output:**

```
┌───────────┬──────────────────────────────────────┐
│ Field     │ Value                                │
├───────────┼──────────────────────────────────────┤
│ User ID   │ 550e8400-e29b-41d4-a716-446655440000 │
│ Email     │ admin@example.com                    │
│ Org       │ porta-admin                          │
│ Roles     │ porta-admin                          │
│ Server    │ http://localhost:3000                 │
└───────────┴──────────────────────────────────────┘
```

**Mode:** HTTP — requires prior `porta login`.
