# DEF-21 Trust-Driven Consent Plan

> **Feature**: Make the OAuth consent page reachable for third-party clients and remember consent per scope
> **Status**: Ready
> **Created**: 2026-09-23
> **Implements**: test-assurance/RD-05
> **CodeOps Artifact Schema**: 1

## Overview

The OIDC consent page is currently unreachable. Two rules leave no path to it: a same-organization
client is auto-consented (`packages/server/src/routes/interactions.ts:1113`), and a client owned by
another organization is rejected with `404` before an interaction is created
(`packages/server/src/middleware/oidc-client-tenant.ts:152`). A third-party application registered
under the same organization - the intended "Connect to CRM" case - is therefore silently
auto-consented instead of asking the user.

The requirement is delegated API access inside one organization: an external application (for
example an ERP app) that a user connects to a first-party resource application (for example a CRM
app) so it can call the CRM's APIs on that user's behalf. Porta is the authorization server; the
CRM is the resource server and validates the opaque access token by introspection; the ERP is the
third-party client; the user consents.

This plan makes the consent decision depend on an explicit per-client trust flag instead of
organization equality, and makes the page reachable without ever re-asking for consent the user has
already granted.

## Decisions

| #   | Decision        | Choice                                                                               |
| --- | --------------- | ------------------------------------------------------------------------------------ |
| D1  | Trust flag      | A per-client `requireConsent` boolean, default `false`                               |
| D2  | Trusted clients | Auto-consent (existing first-party behavior)                                         |
| D3  | Explicit prompt | Honor `prompt=consent` for every client, except when nothing new is requested        |
| D4  | Token access    | Consent only; the resource application introspects the opaque access token           |
| D5  | Connected apps  | No list/revoke surface now; disconnection is token/refresh/session expiry (deferred) |
| D6  | Client scope    | The client stays bound to one organization; cross-organization clients are unchanged |
| D7  | Consent memory  | Per scope (b1): already-granted scopes never re-prompt; a new scope re-prompts       |
| D8  | Migration       | `032_client_require_consent.sql`                                                     |

## Consent gate

The interaction exposes what is not yet granted through `interaction.prompt.details`
(`missingOIDCScope`, `missingOIDCClaims`, `missingResourceScopes`). The gate in `showConsent`
becomes:

```
nothingMissing = no missingOIDCScope, missingOIDCClaims, or missingResourceScopes

nothingMissing                                        -> finish silently, reuse the grant
!nothingMissing && (requireConsent || prompt=consent) -> render the consent page
!nothingMissing && trusted && no prompt=consent       -> auto-consent
prompt=none && !nothingMissing                        -> consent_required (provider; no page)
```

The provider already persists the grant (`processConsent` in `interactions.ts`), and
`loadExistingGrant` (`packages/server/src/oidc/configuration.ts:399`) reuses it, so "remembered"
consent needs no new storage.

## Scope boundaries

In scope: the server-side trust flag (migration, client model, admin API), the `showConsent` gate,
server unit/integration/pentest coverage, the browser acceptance tests for the consent page, and
the operator documentation. The SDK, CLI, `porta admin` terminal client form, connected-apps
management, and resource-server scope/audience work are recorded as deferred follow-ups.

## Document Index

| #   | Document                               | Description                              |
| --- | -------------------------------------- | ---------------------------------------- |
| 00  | [Index](00-index.md)                   | Overview, decisions, and scope           |
| 99  | [Execution Plan](99-execution-plan.md) | Specification-first implementation tasks |

## Related Files

- `packages/server/migrations/032_client_require_consent.sql`
- `packages/server/src/clients/{types,repository,service,validators,index}.ts`
- `packages/server/src/routes/clients.ts`
- `packages/server/src/routes/interactions.ts`
- `packages/server/tests/unit/routes/client-*`, `packages/server/tests/integration/clients/*`
- `packages/server/tests/pentest/oidc-attacks/`
- `packages/server/tests/ui/flows/consent.spec.ts`, `consent-edge-cases.spec.ts`, `accessibility/form-accessibility.spec.ts`
- `repo-tests/monorepo/server-package.spec.test.mjs`
- `docs/guide/custom-ui.md`, `docs/guide/deployment.md`, `techdocs/architecture/security.md`
- `codeops/features/test-assurance/00-remaining-work.md`, `00-roadmap.md`
