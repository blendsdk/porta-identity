# Bootstrap & Authentication

These commands handle initial setup and CLI authentication.

## `porta init` {#porta-init}

Bootstrap the admin infrastructure. This is typically the **first command** you run after deploying Porta and running migrations.

```bash
porta init
```

**What it does:**

1. Creates the **super-admin organization** (`porta-admin`)
2. Creates the **admin application** with granular RBAC permissions and roles
3. Creates a **PKCE-enabled public OIDC client** for the CLI
4. Creates a **confidential OIDC client** for the [Admin GUI](/guide/admin-gui) (with client secret)
5. Creates the **first admin user** (prompts for email and password)
6. Assigns the `porta-admin` role to the first user

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
porta login [--server <url>] [--no-browser] [--client-id <id>]
```

**What it does:**

1. Fetches OIDC discovery metadata from `/api/admin/metadata`
2. Generates a PKCE `code_verifier` and `code_challenge`
3. **Browser mode** (default on host): opens your browser, captures the authorization code via a temporary localhost callback server
4. **Manual mode** (`--no-browser` or auto-detected in Docker): prints the auth URL for you to open manually, then prompts you to paste the callback URL from your browser's address bar
5. Exchanges the code for access and refresh tokens
6. Stores credentials at `~/.porta/credentials.json`

**Mode:** HTTP

**Options:**

| Flag | Description |
|------|-------------|
| `--server` | Porta server URL (default: `http://localhost:3000`) |
| `--no-browser` | Use manual mode — print URL instead of opening browser |
| `--client-id` | Override the auto-discovered admin client ID |

::: tip Docker / Headless Environments
When running inside a Docker container, `porta login` **automatically detects** the container environment (via `/.dockerenv`) and switches to manual mode. No need to pass `--no-browser` explicitly.

You can also force manual mode in other containerized runtimes (Podman, Kubernetes) by setting the `PORTA_CONTAINER=1` environment variable.
:::

**Examples:**

```bash
# Login on your local machine (opens browser automatically)
porta login

# Login to a remote server
porta login --server https://auth.example.com

# Login from inside Docker (auto-detected manual mode)
docker exec -it porta-app porta login
# → Prints URL, you open it in your host browser, paste callback URL back

# Force manual mode (SSH, CI, headless servers)
porta login --no-browser
```

**Manual mode flow:**

```
$ porta login --no-browser

Open this URL in your browser to log in:

  http://localhost:3000/porta-admin/auth?response_type=code&client_id=...

After logging in, your browser will redirect to a page that won't load.
Copy the full URL from your browser's address bar and paste it below.

Paste the callback URL: http://127.0.0.1:11111/callback?code=abc123&state=xyz

✅ Logged in as admin@example.com
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
