# Project Scaffolding: Project Setup

> **Document**: 03-project-scaffolding.md
> **Parent**: [Index](00-index.md)

## Overview

Initialize the npm project with all dependencies, TypeScript configuration, Vitest setup, npm scripts, and project-level config files (`.gitignore`, `.env.example`). This creates the buildable foundation before any application code.

## package.json

### Project Metadata

```json
{
  "name": "porta",
  "version": "5.0.0",
  "description": "Porta v5 — OIDC Identity Provider",
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "main": "dist/index.js"
}
```

### Production Dependencies

| Package | Purpose | Notes |
| ------- | ------- | ----- |
| `koa` | HTTP framework | oidc-provider is Koa-based (ADR-002) |
| `koa-router` | HTTP routing | Admin API, health endpoint |
| `koa-bodyparser` | Request body parsing | JSON body support |
| `oidc-provider` | OIDC protocol engine | ADR-001 — not configured yet, just installed |
| `pg` | PostgreSQL client | Direct usage per ADR-002 |
| `ioredis` | Redis client | Direct usage per ADR-002 |
| `nodemailer` | Email sending (SMTP) | ADR-006 |
| `ejs` | Template engine | Server-rendered interaction pages (ADR-004) |
| `zod` | Schema validation | Config validation, API input validation |
| `argon2` | Password hashing | SEC-02 |
| `nanoid` | ID generation | Client IDs, tokens |
| `otplib` | TOTP library | MFA-01 |
| `qrcode` | QR code generation | MFA-02 |

### Development Dependencies

| Package | Purpose |
| ------- | ------- |
| `typescript` | TypeScript compiler |
| `tsx` | TypeScript execution + watch mode |
| `vitest` | Test framework |
| `@types/koa` | Koa type definitions |
| `@types/koa-router` | Router type definitions |
| `@types/koa__router` | Alternative router types |
| `@types/pg` | PostgreSQL type definitions |
| `@types/nodemailer` | Nodemailer type definitions |
| `@types/ejs` | EJS type definitions |
| `@types/qrcode` | QR code type definitions |

### npm Scripts

```json
{
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "verify": "npm run build && npm test",
    "migrate": "echo 'Migration runner not implemented yet — see Plan 2: core-oidc'",
    "bootstrap": "echo 'Bootstrap not implemented yet — see Plan 2: core-oidc'"
  }
}
```

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Key choices:**
- `module: "NodeNext"` — Required for ESM-only with `.js` extensions in imports
- `target: "ES2022"` — Node 22 supports all ES2022 features natively
- `strict: true` — Per project requirements (DEV-01)
- `rootDir: "src"` — All source under `src/`, output mirrors to `dist/`

## Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
    },
  },
});
```

## Directory Structure

Create the following directories with `.gitkeep` files where empty:

```
src/
  app/              # Koa application setup, middleware
  config/           # Configuration loading (env vars)
  middleware/        # Shared Koa middleware
  utils/            # Shared utility functions
  oidc/             # (empty — Plan 2)
  auth/             # (empty — Plan 3)
  interaction/      # (empty — Plan 3)
  admin/            # (empty — Plan 5)
  self-service/     # (empty — Plan 5)
  models/           # (empty — Plan 2)
  services/         # (empty — Plan 2)
  crypto/           # (empty — Plan 2)
  email/            # (empty — Plan 3)
  audit/            # (empty — Plan 6)
  types/            # Shared TypeScript types
tests/
  unit/             # Unit tests
  integration/      # Integration tests (Docker required)
views/              # EJS templates (empty — Plan 3)
  emails/           # Email templates (empty — Plan 3)
locales/            # i18n translation files (empty — Plan 3)
migrations/         # PostgreSQL migration files (empty — Plan 2)
docker/             # Additional Docker configs if needed
scripts/            # Utility scripts
```

## .gitignore

```
# Dependencies
node_modules/

# Build output
dist/

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Test
coverage/

# Docker
docker/data/

# Temporary scripts
scripts/tmp-*

# Logs
*.log
```

## .env.example

Contains every env var from OPERATIONS.md §Environment Variables Reference with placeholder values and comments. This file is committed to git as documentation.

```bash
# ============================================================
# Porta v5 — Environment Variables
# Copy to .env and fill in values for your environment
# ============================================================

# --- Server ---
NODE_ENV=development
PORT=3000
ISSUER=http://localhost:3000
TRUST_PROXY=false

# --- Database ---
DATABASE_URL=postgresql://porta:porta@localhost:5432/porta
DATABASE_POOL_MAX=20

# --- Redis ---
REDIS_URL=redis://localhost:6379

# --- Security ---
KEY_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000
COOKIE_SECRETS=change-me-to-a-random-string

# --- SMTP ---
SMTP_HOST=localhost
SMTP_PORT=587
SMTP_USER=user
SMTP_PASS=pass
SMTP_FROM=Porta <noreply@localhost>

# --- Token Lifetimes (seconds) ---
ACCESS_TOKEN_TTL=3600
ID_TOKEN_TTL=3600
REFRESH_TOKEN_TTL=2592000
SESSION_TTL=1209600
INTERACTION_TTL=600
MAGIC_LINK_TTL=900
INVITATION_TTL=259200
PASSWORD_RESET_TTL=3600
EMAIL_VERIFY_TTL=86400
KEY_ROTATION_OVERLAP=86400

# --- i18n ---
DEFAULT_LOCALE=en

# --- Features ---
SELF_REGISTRATION_ENABLED=false
HIBP_ENABLED=false
LOG_LEVEL=info

# --- Signing Keys ---
SIGNING_ALGORITHM=RS256
KEY_ROTATION_INTERVAL=7776000

# --- Bootstrap (first run only) ---
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_PASSWORD=change-me
# BOOTSTRAP_API_KEY_NAME=
BOOTSTRAP_ADMIN_REDIRECT_URI=http://localhost:3000/callback

# --- CLI (for porta admin CLI) ---
# PORTA_URL=http://localhost:3000
# PORTA_API_KEY=
```

## Error Handling

| Error Case | Handling Strategy |
| ---------- | ----------------- |
| Missing required env var | Config loader throws with descriptive message listing missing vars |
| Invalid env var format | Zod validation error with field name and expected format |
| Port already in use | Koa error handler logs and exits with code 1 |
