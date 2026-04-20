# Config Fail-Fast (Phase A)

> **Document**: 03-config-fail-fast.md
> **Parent**: [Index](00-index.md)

## Overview

Add a `superRefine` to `src/config/schema.ts` that runs only when `NODE_ENV === 'production'` and rejects well-known dev placeholder values. Provides clear per-field error messages. An escape hatch (`PORTA_SKIP_PROD_SAFETY=true`) skips the check but logs an ERROR at startup.

## Architecture

### Current

`configSchema` is a flat `z.object({...})`; `config/index.ts` parses `process.env` through it, logs fatal on failure, calls `process.exit(1)`.

### Proposed

1. Add two new optional fields:
   ```ts
   trustProxy: z.coerce.boolean().default(false),
   metricsEnabled: z.coerce.boolean().default(false),
   ```
2. Wrap the whole schema with `.superRefine((data, ctx) => { ... })`.
3. In the refinement, short-circuit unless `data.nodeEnv === 'production'` AND `process.env.PORTA_SKIP_PROD_SAFETY !== 'true'`.
4. For each rule that fails, push a `ctx.addIssue({ code: 'custom', path: [<field>], message: ... })`.

## Rule Catalogue

| Rule | Fail condition | Message |
|---|---|---|
| R1 COOKIE_KEYS placeholder | any key matches `/change.?me/i` OR equals the `.env.example` default | `COOKIE_KEYS contains a dev placeholder ("change-me" pattern detected); generate with \`openssl rand -base64 32\`` |
| R2 COOKIE_KEYS length | any key < 32 chars | `COOKIE_KEYS[${i}] is shorter than 32 chars; production requires ≥ 32 chars of entropy` |
| R3 2FA key missing | `twoFactorEncryptionKey` undefined/empty AND `twoFactorEnabled` (or always, if feature always on) | `TWO_FACTOR_ENCRYPTION_KEY is required in production` |
| R4 2FA key placeholder | equals `0123456789abcdef` repeated 4× | `TWO_FACTOR_ENCRYPTION_KEY still set to the dev placeholder` |
| R5 2FA key length | hex-decoded length < 32 bytes | `TWO_FACTOR_ENCRYPTION_KEY must decode to ≥ 32 bytes (64 hex chars)` |
| R6 DB password | `DATABASE_URL` includes `:porta_dev@` | `DATABASE_URL still contains the dev password "porta_dev"` |
| R7 Issuer scheme | `ISSUER_BASE_URL` starts with `http://` and host is not `localhost`/`127.*`/`::1` | `ISSUER_BASE_URL must use HTTPS in production` |
| R8 Log level | `logLevel` is `debug` or `trace` | `LOG_LEVEL=${logLevel} is too verbose for production; use info, warn, or error` |
| R9 SMTP host | `smtpHost` is `localhost` or `127.*` | `SMTP_HOST points at a dev inbox (MailHog); configure a real SMTP relay` |

Rules R3–R5 apply only if the 2FA module is in use. For simplicity we treat `TWO_FACTOR_ENCRYPTION_KEY` as unconditionally required in production, because any org that ever enabled 2FA will need it to decrypt existing secrets.

## Escape hatch

```
PORTA_SKIP_PROD_SAFETY=true
```

When set, `superRefine` returns early. The config loader logs:

```
logger.error({ event: 'config.safety_skipped' }, 'PORTA_SKIP_PROD_SAFETY=true — production safety checks bypassed');
```

Use for incident response only.

## Implementation sketch

```ts
// src/config/schema.ts
import { z } from 'zod';

const baseSchema = z.object({
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
  port: z.coerce.number().int().positive().default(3000),
  host: z.string().default('0.0.0.0'),
  logLevel: z.enum(['trace','debug','info','warn','error','fatal','silent']).default('info'),
  databaseUrl: z.string().url(),
  redisUrl: z.string().url(),
  issuerBaseUrl: z.string().url(),
  cookieKeys: z.array(z.string().min(16)).min(1),
  twoFactorEncryptionKey: z.string().optional(),
  smtpHost: z.string().default('localhost'),
  smtpPort: z.coerce.number().int().positive().default(1025),
  // existing fields…
  trustProxy: z.coerce.boolean().default(false),      // new
  metricsEnabled: z.coerce.boolean().default(false),  // new
});

export const configSchema = baseSchema.superRefine((data, ctx) => {
  if (data.nodeEnv !== 'production') return;
  if (process.env.PORTA_SKIP_PROD_SAFETY === 'true') return;

  const placeholderRe = /change[\-_]?me/i;
  data.cookieKeys.forEach((k, i) => {
    if (placeholderRe.test(k)) {
      ctx.addIssue({ code: 'custom', path: ['cookieKeys', i],
        message: 'COOKIE_KEYS contains a dev placeholder ("change-me" pattern); generate with `openssl rand -base64 32`' });
    }
    if (k.length < 32) {
      ctx.addIssue({ code: 'custom', path: ['cookieKeys', i],
        message: `COOKIE_KEYS[${i}] is shorter than 32 chars; production requires >= 32 chars` });
    }
  });

  const tfe = data.twoFactorEncryptionKey;
  if (!tfe) {
    ctx.addIssue({ code: 'custom', path: ['twoFactorEncryptionKey'],
      message: 'TWO_FACTOR_ENCRYPTION_KEY is required in production' });
  } else {
    if (/^0123456789abcdef/.test(tfe)) {
      ctx.addIssue({ code: 'custom', path: ['twoFactorEncryptionKey'],
        message: 'TWO_FACTOR_ENCRYPTION_KEY still set to the dev placeholder' });
    }
    const bytes = tfe.match(/^[0-9a-f]+$/i) ? tfe.length / 2 : Buffer.from(tfe, 'base64').length;
    if (bytes < 32) {
      ctx.addIssue({ code: 'custom', path: ['twoFactorEncryptionKey'],
        message: 'TWO_FACTOR_ENCRYPTION_KEY must decode to >= 32 bytes (64 hex chars or 44+ base64)' });
    }
  }

  if (/:porta_dev@/.test(data.databaseUrl)) {
    ctx.addIssue({ code: 'custom', path: ['databaseUrl'],
      message: 'DATABASE_URL still contains the dev password "porta_dev"' });
  }

  if (/^http:\/\//.test(data.issuerBaseUrl)) {
    const url = new URL(data.issuerBaseUrl);
    if (!['localhost','127.0.0.1','::1'].includes(url.hostname)) {
      ctx.addIssue({ code: 'custom', path: ['issuerBaseUrl'],
        message: 'ISSUER_BASE_URL must use HTTPS in production' });
    }
  }

  if (data.logLevel === 'debug' || data.logLevel === 'trace') {
    ctx.addIssue({ code: 'custom', path: ['logLevel'],
      message: `LOG_LEVEL=${data.logLevel} is too verbose for production; use info/warn/error` });
  }

  if (data.smtpHost === 'localhost' || /^127\./.test(data.smtpHost)) {
    ctx.addIssue({ code: 'custom', path: ['smtpHost'],
      message: 'SMTP_HOST points at a dev inbox; configure a real SMTP relay for production' });
  }
});
```

## Loader updates (`src/config/index.ts`)

- Unchanged core flow. On refinement failure, pino-fatal each issue, then `process.exit(1)`.
- Bump up the error rendering so each issue shows on its own line: `ERR: <path>: <message>`.

## Testing Requirements

Unit tests in `tests/unit/config/schema.production.test.ts`:

- Each rule R1–R9: provide a base config with one offending field, assert parse fails with the expected message.
- Valid prod config: all fields non-placeholder, HTTPS issuer, random 32+ char keys, proper 2FA hex key → parse succeeds.
- `NODE_ENV=development` with all `.env.example` values → parse succeeds (baseline).
- `NODE_ENV=production` + `PORTA_SKIP_PROD_SAFETY=true` → parse succeeds even with placeholders (and loader should log the error).
