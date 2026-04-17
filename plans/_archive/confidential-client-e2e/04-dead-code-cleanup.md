# Dead Code Cleanup

> **Document**: 04-dead-code-cleanup.md
> **Parent**: [Index](00-index.md)

## Problem

`findClient` is NOT a valid oidc-provider v9.8.0 configuration option.
`grep -r "findClient" node_modules/oidc-provider/lib/` returns zero matches.
The config property is silently ignored — client lookup goes through the adapter.

The adapter factory (`adapter-factory.ts:100-103`) already correctly routes
Client model lookups to `findForOidc()`.

## Files to Remove

- `src/oidc/client-finder.ts` — Dead code (190 lines)
- `tests/unit/oidc/client-finder.test.ts` — Tests for dead code

## Files to Clean

### `src/oidc/provider.ts`
- Remove import: `import { findClientByClientId } from './client-finder.js'`
- Remove `findClient: findClientByClientId` from `createProvider()` call

### `src/oidc/configuration.ts`
- Remove `findClient?` from `BuildProviderConfigParams` interface
- Remove `findClient` from destructuring
- Remove `...(findClient ? { findClient } : {})` spread

### `tests/unit/oidc/configuration.test.ts`
- Remove any tests that pass/check `findClient` parameter
