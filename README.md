> ⚠️ **Beta Software** — Porta is under active development. APIs, configuration, and
> database schemas may change between versions. Not recommended for production use yet.

[![CI](https://github.com/blendsdk/porta-identity/actions/workflows/ci.yml/badge.svg)](https://github.com/blendsdk/porta-identity/actions/workflows/ci.yml)
[![Docker](https://img.shields.io/docker/v/blendsdk/porta?sort=semver&label=Docker%20Hub)](https://hub.docker.com/r/blendsdk/porta)
[![License](https://img.shields.io/github/license/blendsdk/porta-identity)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A522-brightgreen)](https://nodejs.org/)

# Porta

Multi-tenant OIDC provider built on [node-oidc-provider](https://github.com/panva/node-oidc-provider) + Koa + TypeScript + PostgreSQL + Redis. Provides organization-scoped authentication, user management, RBAC, custom claims, two-factor authentication, and a comprehensive admin CLI.

## 🔗 Quick Links

| | |
|---|---|
| 📖 [Documentation](https://blendsdk.github.io/porta-identity/) | Full guides, API reference, CLI docs |
| 🐳 [Docker Hub](https://hub.docker.com/r/blendsdk/porta) | Pull the production Docker image |
| 🚀 [Quick Start](https://blendsdk.github.io/porta-identity/guide/quickstart) | Get running in under 5 minutes |
| 📋 [Admin API](https://blendsdk.github.io/porta-identity/api/overview) | REST API reference for admin operations |
| 💻 [CLI Reference](https://blendsdk.github.io/porta-identity/cli/overview) | Command-line administration tool |

## 🚀 Quick Start

The fastest way to try Porta is with Docker Compose:

```bash
git clone https://github.com/blendsdk/porta-identity.git && cd porta-identity
cp .env.docker .env.docker.local   # adjust settings if needed

# Start Porta + PostgreSQL + Redis (auto-migrates on first run)
docker compose -f docker/docker-compose.prod.yml up -d

# Bootstrap the admin system (creates first admin user)
docker exec porta-app node dist/cli/index.js init
```

Then open [http://localhost:3000/health](http://localhost:3000/health) to verify.

For source development setup, see the [Quick Start guide](https://blendsdk.github.io/porta-identity/guide/quickstart).

## ✨ Features

- **Multi-Tenant OIDC** — Path-based tenancy with per-org OIDC endpoints
- **User Management** — CRUD, status lifecycle, password policies (NIST SP 800-63B)
- **RBAC** — Roles, permissions, and user-role mappings per application
- **Custom Claims** — Type-validated custom claim definitions and user values
- **Two-Factor Auth** — Email OTP, TOTP (authenticator apps), recovery codes
- **Login Methods** — Per-org and per-client configurable (password, magic link)
- **Admin CLI** — 14+ commands for managing orgs, apps, clients, users, roles, and more
- **Admin API** — JWT-authenticated REST API for all admin operations
- **ES256 Signing** — ECDSA P-256 keys, auto-bootstrapped, stored in database
- **Hybrid OIDC Adapters** — Redis for sessions, PostgreSQL for tokens/grants
- **Audit Logging** — Comprehensive event logging for security and compliance

## 📖 Documentation

Visit the **[Porta Documentation](https://blendsdk.github.io/porta-identity/)** for:

- Architecture overview and design decisions
- Environment variable reference
- Database schema and migrations
- Deployment and production guidance

## 🤝 Contributing

Porta is currently in early development. Contributions are welcome — please open an issue to discuss before submitting a pull request.

```bash
# Development setup
git clone https://github.com/blendsdk/porta-identity.git && cd porta-identity
yarn install
cp .env.example .env
yarn docker:up        # Start PostgreSQL, Redis, MailHog
yarn build && node dist/cli/index.js migrate up && node dist/cli/index.js init
yarn dev              # Start dev server with hot-reload
yarn verify           # Run lint + build + tests before committing
```

## 📄 License

MIT — © TrueSoftware NL
