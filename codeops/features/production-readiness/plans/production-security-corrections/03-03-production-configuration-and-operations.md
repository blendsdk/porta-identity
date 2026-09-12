# Technical Specification: Production Configuration and Operations

> **Requirements**: AC-12, AC-14
> **Decisions**: AR-7–AR-8
> **CodeOps Artifact Schema**: 1

## Production Secret Separation

After structural presence, length, and hexadecimal validation, production validation normalizes
both values to lowercase and rejects byte-equivalent keys. This separation check runs before the
`PORTA_SKIP_PROD_SAFETY` early return, so the escape hatch cannot disable domain separation.
Placeholder checks retain their current behavior. The message names the two environment variables
and requires different values; it never prints either value. This adds one comparison and no
configuration layer.

## Key Command Guidance

Successful non-JSON conventional key generation and rotation output must tell the operator:

1. restart every running Porta instance; and
2. verify the committed active signing key after restart.

`generate` adds another active key without retiring existing active keys. `rotate` atomically
retires every currently active key and creates one new active key; it is not a later deactivation
step for a previously generated key. The wording appears only after a successful API response.
`--json` retains its existing machine-only payload with no prose. Failures retain current error
handling. No command attempts remote restarts or provider mutation.

## Documentation Surfaces

| Surface | Required correction |
|---|---|
| `README.md` | Distinct required 64-hex production secrets and restart boundary |
| `docs/cli/infrastructure.md` | accurate generate/rotate lifecycle and restart procedure |
| environment guide | Exact variables, generation guidance, unequal values |
| deployment guide | restart all instances and verify active key after key changes |
| production Docker guide/example | placeholders only; no MailHog, CI DNS, or automatic steady-state migration claim |
| database migration index | current encrypted signing-key behavior, migration 028, no “future” encryption wording |

The docs identify selective portability and database-managed global configuration as later
operational work, not blockers for a correctly configured new production installation. Root
encryption keys remain outside PostgreSQL.

## File Ownership

- `packages/server/src/config/schema.ts`
- `packages/cli/src/commands/keys.ts`
- `README.md`
- `docs/guide/environment.md`, `docs/guide/deployment.md`, `docs/database/migrations.md`
- `docs/cli/infrastructure.md`
- `docker/DOCKERHUB.md`
