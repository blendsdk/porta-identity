# DEF-25 Token/Introspection Limiter Plan

> **Feature**: Mount the OIDC token and introspection rate limiters on the real endpoints with a real client key
> **Status**: Ready
> **Created**: 2026-09-22
> **Implements**: test-assurance/RD-05
> **CodeOps Artifact Schema**: 1

## Overview

The general OIDC rate limiters are mounted on the outer Koa app and match
`/<orgSlug>/oidc/token` and `/<orgSlug>/oidc/token/introspection`
(`packages/server/src/middleware/token-rate-limiter.ts:44,143`). The OIDC router strips the
`/<orgSlug>` prefix before delegating to `oidc-provider` (`packages/server/src/server.ts:457,515-525`),
so the real endpoints are `/<orgSlug>/token` and `/<orgSlug>/token/introspection`. The limiters
therefore never protect the real token endpoint.

The limiter also runs before OIDC body parsing (`server.ts:434-444`, `462-473`), so its
`client_id` component is always `unknown` and the key degenerates to the client IP. Mounting it on
the real path unchanged would throttle every client behind one address.

This plan mounts both limiters on the OIDC router after the body parser, matches the real paths,
and derives the client key from the parsed body or HTTP Basic credentials.

## Decisions

| # | Decision | Choice |
| - | -------- | ------ |
| D1 | Fix shape | Move both limiters onto the OIDC router after body parsing and match the real paths |
| D2 | Limit values | Keep `token` 30/300s and `introspection` 100/60s |
| D3 | Client key | `client_id` from the parsed body, else from HTTP Basic credentials, else `unknown` |
| D4 | Placement | After tenant resolution and body parsing, before the client-tenant binding and provider callback |
| D5 | Status records | Move DEF-25 to resolved and fully close DEF-14 once the live ST-53 case passes |

## Scope boundaries

In scope: the two limiter middlewares, their mounting in `server.ts`, the shared client-key
helper, the unit tests for both limiters, the real-endpoint penetration specification, and the
CodeOps status records. Out of scope: changing the limit values, the legacy client-secret limiter,
or the OIDC provider routes.

## Document Index

| #   | Document                               | Description                              |
| --- | -------------------------------------- | ---------------------------------------- |
| 00  | [Index](00-index.md)                   | Overview, decisions, and scope           |
| 99  | [Execution Plan](99-execution-plan.md) | Specification-first implementation tasks |

## Related Files

- `packages/server/src/middleware/token-rate-limiter.ts`
- `packages/server/src/server.ts`
- `packages/server/tests/unit/middleware/token-rate-limiter.test.ts`
- `packages/server/tests/unit/middleware/introspection-rate-limiter.test.ts`
- `packages/server/tests/pentest/infrastructure/forwarded-client-ip-identity.spec.test.ts`
- `test-harness/assurance/production-exposure/forwarded-context-observers.ts`
- `codeops/features/test-assurance/00-remaining-work.md`, `00-roadmap.md`
