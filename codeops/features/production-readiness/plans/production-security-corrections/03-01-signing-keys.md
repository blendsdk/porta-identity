# Technical Specification: Signing Keys

> **Requirements**: AC-01–AC-05, AC-13, AC-15
> **Decisions**: AR-3, AR-5, AR-7
> **CodeOps Artifact Schema**: 1

## Admin Mutation Contract

Both mutation handlers keep the current route, authentication, permission, status, and response
shape. Each handler shall:

1. Generate ES256/P-256 material with `generateES256KeyPair()`.
2. Encrypt the private PEM with `encryptPrivateKey(privateKeyPem, config.signingKeyEncryptionKey)`.
3. Insert ciphertext, IV, tag, and `encrypted = true` using parameterized SQL.
4. Register `clearJwksCache()` through `afterDatabaseCommit()` only after all SQL succeeds.

Rotation performs retirement and insertion through `getPool()`. The existing
`adminMutationAudit()` request transaction owns commit/rollback; the route must not check out or
commit another client. A failed insert therefore rolls back retirement and never clears the cache.

## JWKS Cache Generation

`clearJwksCache()` increments a module-local integer generation as well as clearing value and
timestamp. A cache-miss load captures the generation before awaiting PostgreSQL. It installs its
result only when the captured and current generations match. If they differ, the caller returns
the loaded snapshot but it is not cached; the next call loads current committed state. This is
process-local state only.

## Bootstrap Serialization

`ensureSigningKeys()` uses `runDatabaseTransaction()` for one short block:

1. Acquire `LOCK TABLE signing_keys IN SHARE ROW EXCLUSIVE MODE`.
2. Query active/eligible signing rows again inside that transaction.
3. When an active row exists, insert nothing.
4. Otherwise generate, encrypt, and insert exactly one active key.

The lock is released by transaction completion. After commit, every caller reloads the complete
eligible key set from PostgreSQL and only then converts it to JWK. Both the inserting caller and a
caller that waited for the lock therefore return the same winning active key. No Redis or process
lock is introduced. Nested-safe transaction behavior permits existing startup and test
composition.

## Stored-Row Validation

Before decryption, every loaded signing row must have `encrypted = true` and non-null IV and tag.
Decryption failures and invalid private PEM all become:

```ts
new SigningKeyCryptoError('Signing key record is invalid')
```

The loading boundary records `signing-key-record-invalid` with `{ kid }` only and rethrows. It does
not continue with a partial key set. `decryptPrivateKey()` shall not embed the underlying crypto
message. Server startup logging and the server CLI error handler shall reduce this error to the
fixed message and never serialize its caught error, stack, database detail, or path, including
under `porta init --verbose`.

## File Ownership

| Files | Change |
|---|---|
| `packages/server/src/routes/keys.ts` | Encrypted inserts and post-commit cache invalidation |
| `packages/server/src/lib/signing-keys.ts` | cache generation, strict loads, serialized bootstrap |
| `packages/server/src/lib/signing-key-crypto.ts` | fixed decryption failure message |
| `packages/server/src/index.ts` | bounded startup diagnostic |
| `packages/server/src/cli/error-handler.ts` | suppress sensitive signing-row stacks in every CLI mode |
