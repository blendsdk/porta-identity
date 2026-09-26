[![CI](https://github.com/blendsdk/porta-identity/actions/workflows/ci.yml/badge.svg)](https://github.com/blendsdk/porta-identity/actions/workflows/ci.yml)
[![Docker](https://img.shields.io/docker/v/blendsdk/porta?sort=semver&label=Docker%20Hub)](https://hub.docker.com/r/blendsdk/porta)
[![Version](https://img.shields.io/github/v/release/blendsdk/porta-identity?sort=semver&label=version)](https://github.com/blendsdk/porta-identity/releases)
[![License](https://img.shields.io/github/license/blendsdk/porta-identity)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-brightgreen)](https://nodejs.org/)

# Porta

Multi-tenant OIDC provider built on [node-oidc-provider](https://github.com/panva/node-oidc-provider) + Koa + TypeScript + PostgreSQL + Redis. Provides organization-scoped authentication, user management, RBAC, custom claims, two-factor authentication, and a comprehensive admin CLI.

## 🔗 Quick Links

|                                                                              |                                         |
| ---------------------------------------------------------------------------- | --------------------------------------- |
| 📖 [Documentation](https://blendsdk.github.io/porta-identity/)               | Full guides, API reference, CLI docs    |
| 🐳 [Docker Hub](https://hub.docker.com/r/blendsdk/porta)                     | Pull the production Docker image        |
| 🚀 [Quick Start](https://blendsdk.github.io/porta-identity/guide/quickstart) | Get running in under 5 minutes          |
| 📋 [Admin API](https://blendsdk.github.io/porta-identity/api/overview)       | REST API reference for admin operations |
| 💻 [CLI Reference](https://blendsdk.github.io/porta-identity/cli/overview)   | Command-line administration tool        |

## 🚀 Quick Start

The fastest way to get Porta running is the interactive installer. It writes a
`docker-compose.yml` and a `.env` with generated secrets, starts the stack, and
applies migrations:

```bash
curl -fsSL https://raw.githubusercontent.com/blendsdk/porta-identity/main/install-porta.sh | bash
```

The installer asks for your public URL and SMTP relay, scans for a free host port
to publish, and prints an nginx reverse-proxy example. For an unattended install,
pass flags instead (see `--help` for the full list):

```bash
curl -fsSL https://raw.githubusercontent.com/blendsdk/porta-identity/main/install-porta.sh \
  | bash -s -- \
      --issuer-url https://auth.example.com \
      --smtp-host smtp.example.com --smtp-from noreply@example.com \
      --bind 127.0.0.1
```

Re-running with `--force` reuses every saved answer and only asks for keys that
are missing or empty. Use `--check` to list those values without changing
anything, and `--fresh` to ignore the saved file and start over.

After the stack is healthy, bootstrap the admin system:

```bash
docker exec -it porta-app porta init
```

Then open [http://localhost:3000/health](http://localhost:3000/health) to verify.
For the manual file-by-file setup, the complete environment reference, and source
development, see the [Quick Start guide](https://blendsdk.github.io/porta-identity/guide/quickstart).

### Production security essentials

Production requires `SIGNING_KEY_ENCRYPTION_KEY` and `TWO_FACTOR_ENCRYPTION_KEY` to be different,
random secrets of exactly 64 hexadecimal characters. Keep both root encryption keys in the
deployment environment or a secret manager. PostgreSQL never contains these root keys.

`porta keys generate` adds another active signing key.
It does so without retiring existing active keys.
`porta keys rotate` retires every active signing key and creates one new active key. After either
successful command, restart every running Porta instance, then run `porta keys list` and verify the
committed active signing key after restarting.

Selective environment portability and PostgreSQL-backed global configuration are separate later
operational features. Their absence is not a blocker for a correctly configured production
installation.

## ✨ Features

- **Multi-Tenant OIDC** — Path-based tenancy with per-org OIDC endpoints
- **User Management** — CRUD, status lifecycle, password policies (NIST SP 800-63B)
- **RBAC** — Roles, permissions, and user-role mappings per application
- **Custom Claims** — Type-validated custom claim definitions and user values
- **Two-Factor Auth** — Email OTP, TOTP (authenticator apps), recovery codes
- **Login Methods** — Per-org and per-client configurable (password, magic link)
- **Admin CLI** — 14+ commands for managing orgs, apps, clients, users, roles, and more
- **Admin API** — JWT-authenticated REST API for all admin operations
- **ES256 Signing** — ECDSA P-256 keys with encrypted private material at rest
- **Hybrid OIDC Adapters** — Redis for sessions, PostgreSQL for tokens/grants
- **Audit Logging** — Comprehensive event logging for security and compliance

## 📖 Documentation

Visit the **[Porta Documentation](https://blendsdk.github.io/porta-identity/)** for:

- Architecture overview and design decisions
- Environment variable reference
- Database schema and migrations
- Deployment and production guidance

## 🤝 Contributing

Contributions are welcome — please open an issue to discuss before submitting a pull request.

```bash
# Development setup
git clone https://github.com/blendsdk/porta-identity.git && cd porta-identity
yarn install
cp .env.example .env
yarn docker:up        # Start PostgreSQL, Redis, MailHog
yarn build && yarn porta migrate up && yarn porta init
yarn dev              # Start the development server with live reload
yarn verify           # Run lint + build + tests before committing
```

## 📄 License

MIT — © TrueSoftware B.V.
