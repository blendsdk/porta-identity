# GitHub Issue: Feature Request for oidc-provider

> **Repository**: https://github.com/panva/node-oidc-provider
> **Type**: Feature Request
> **Status**: Draft — ready for submission

---

## Title

Feature: `compareClientSecret` configuration hook for custom secret verification

## Description

### Use Case

Multi-tenant OIDC providers that manage their own client registry (not using Dynamic Client Registration) need to:

1. **Store secrets securely** — hashed, not plaintext
2. **Support secret rotation** — overlapping validity windows where both old and new secrets are valid during a grace period
3. **Support multiple active secrets** — e.g., during zero-downtime key rollover

### Current Behavior

`compareClientSecret(actual)` in `lib/models/client.js` does a direct string comparison:

```javascript
compareClientSecret(actual) {
  return constantEquals(this.clientSecret, actual, 1000);
}
```

This means the adapter **must** return the plaintext `client_secret` in its metadata for authentication to work. There's no hook to customize how secrets are compared.

### Problem

This forces implementers into one of these suboptimal patterns:

1. **Store plaintext secrets** — insecure, violates security best practices
2. **Pre-hash in middleware** — a Koa middleware that SHA-256 hashes the presented secret before oidc-provider processes it, while the adapter returns the SHA-256 hash as `client_secret`. This works for `client_secret_basic` and `client_secret_post` but **breaks `client_secret_jwt`** (where the secret is used as an HMAC key, not compared directly)
3. **Monkey-patch the Client prototype** — fragile, breaks on version upgrades

None of these support multi-secret rotation cleanly.

### Proposed Solution

Add a `compareClientSecret` configuration callback, defaulting to the current behavior:

```javascript
new Provider('https://op.example.com', {
  // ... other config

  async compareClientSecret(client, actual) {
    // client: Client instance (has client.clientId, client.clientSecret, etc.)
    // actual: the presented client_secret string
    // return: boolean

    // Default behavior (unchanged):
    // return constantEquals(client.clientSecret, actual, 1000);

    // Custom: multi-secret with Argon2id
    const secrets = await db.getActiveSecrets(client.clientId);
    for (const secret of secrets) {
      if (await argon2.verify(secret.hash, actual)) return true;
    }
    return false;
  }
});
```

### Implementation

The change is minimal (~10 lines). In `lib/models/client.js`:

```javascript
// FROM:
compareClientSecret(actual) {
  return constantEquals(this.clientSecret, actual, 1000);
}

// TO:
async compareClientSecret(actual) {
  const { compareClientSecret: compare } = instance(provider).configuration;
  if (compare) {
    return compare(this, actual);
  }
  return constantEquals(this.clientSecret, actual, 1000);
}
```

This is **fully backwards-compatible** because `compareClientSecret` is already called with `await` in `lib/shared/client_auth.js`:

```javascript
// line 182 — already async
const matches = await ctx.oidc.client.compareClientSecret(clientSecret);
```

In `lib/helpers/defaults.js`, add with documentation:

```javascript
/**
 * compareClientSecret
 *
 * description: Function used to verify a client's secret during authentication.
 *   When configured, this function replaces the default constant-time string
 *   comparison, allowing implementers to use custom secret storage (e.g., hashed
 *   secrets) or support multiple active secrets for rotation scenarios.
 *
 * example: Verify against Argon2id-hashed secrets
 *   async compareClientSecret(client, actual) {
 *     const hash = await db.getSecretHash(client.clientId);
 *     return argon2.verify(hash, actual);
 *   }
 *
 * example: Support multiple active secrets for rotation
 *   async compareClientSecret(client, actual) {
 *     const secrets = await db.getActiveSecrets(client.clientId);
 *     for (const secret of secrets) {
 *       if (await argon2.verify(secret.hash, actual)) return true;
 *     }
 *     return false;
 *   }
 *
 * @param {Client} client - The Client instance being authenticated
 * @param {string} actual - The presented client_secret value
 * @returns {boolean|Promise<boolean>} Whether the secret matches
 */
compareClientSecret: undefined,
```

### Why This Matters

- **Security**: Production deployments shouldn't store plaintext client secrets. While machine-generated secrets have high entropy (making SHA-256 sufficient), many compliance frameworks require proper hashing.
- **Zero-downtime rotation**: Deploy new secret → old secret valid during grace period → old secret expires. This is a common operational requirement.
- **Multi-tenant providers**: Managing thousands of clients with proper secret lifecycle requires flexibility in secret verification.
- **Standards alignment**: RFC 6749 doesn't mandate plaintext secret storage. The OAuth 2.0 Security Best Current Practice (RFC 9700) recommends treating client secrets with the same care as user credentials.

### Alternatives Considered

1. **Override on prototype**: `provider.Client.prototype.compareClientSecret = ...` — fragile, the Client class is created inside a closure and not easily accessible after construction
2. **Middleware pre-hashing**: Works for `client_secret_basic`/`client_secret_post` but not `client_secret_jwt`
3. **Store plaintext in adapter**: Works but insecure
4. **`client_secret` as array**: Would support multi-secret but is a bigger API change and doesn't solve the hashing problem

### Impact

- No breaking changes
- Default behavior unchanged
- Minimal code change (~10 lines in client.js + ~20 lines in defaults.js)
- All existing tests continue to pass

---

## Context

We're building **Porta](https://github.com/TrueSoftwareNL/porta), a multi-tenant OIDC provider on top of node-oidc-provider. We manage our own client registry in PostgreSQL with Argon2id-hashed secrets and need a clean way to verify secrets without storing them in plaintext.

Currently we use a SHA-256 pre-hashing middleware workaround, which works for basic/post auth methods but is architecturally inelegant and doesn't support `client_secret_jwt`.
