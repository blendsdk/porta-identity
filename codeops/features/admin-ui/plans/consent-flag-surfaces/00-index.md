# Consent Flag Surfaces Implementation Plan

> **Feature**: Expose the per-client `requireConsent` flag through the SDK, the administrative CLI, and the embedded `porta admin` UI
> **Status**: Planning Complete
> **Created**: 2026-09-24
> **Implements**: admin-ui/RD-04
> **CodeOps Artifact Schema**: 1

## Overview

DEF-21 made consent trust-driven: a client whose `requireConsent` flag is `true` shows the OIDC
consent page, and a trusted client (`false`, the default) is auto-consented. The server already
persists the flag and accepts and returns it on the admin client API
(`packages/server/migrations/032_client_require_consent.sql`), but no human-facing or developer
surface can set it: the SDK `Client` type omits it, the CLI has no option, and the Admin UI edit
form does not show it.

This plan closes that gap. It adds `requireConsent` to the SDK client types and response guard, adds
a `--require-consent` / `--no-require-consent` option to `porta client create` and
`porta client update`, and adds a "Require consent" switch to the Admin UI Protocol tab. It also
fixes an adjacent contract gap: the flag is currently missing from the portability export/import
contract, so a backup followed by a restore would silently trust a third-party client.

The tenant binding, the consent decision logic, and the server database schema are unchanged. This
plan only carries the existing server field to the surfaces that read and write it, plus the
documentation that lists client fields.

## Minimum-Sufficient Baseline

**Original goal:** Let an operator set, read, and round-trip the existing per-client `requireConsent`
flag from the SDK, the CLI, and the Admin UI.

**Smallest viable design:** Mirror the already-implemented `requirePkce` / `require_pkce` field in
each surface: a boolean on the SDK types and `isClient` guard, a yargs boolean option mapped into
the existing SDK input object, a JSVision `Switch` in the existing Protocol tab, and one added
column in the existing portability SQL and schema. No new abstraction, package, or shared helper is
introduced.

**Excluded machinery:** None. The change reuses existing per-surface patterns and adds no layer,
dependency, harness, or framework.

**Approved complexity:** None. No Complexity Escalation Gate packet was required.

## Document Index

| #     | Document                                                | Description                                      |
| ----- | ------------------------------------------------------- | ------------------------------------------------ |
| AR    | [Ambiguity Register](00-ambiguity-register.md)          | Zero-Ambiguity Gate decisions (audit trail)      |
| 00    | [Index](00-index.md)                                    | This document — overview and navigation          |
| 01    | [Requirements](01-requirements.md)                      | Scope delta against RD-04                        |
| 02    | [Current State](02-current-state.md)                    | Analysis of the four affected surfaces           |
| 03-01 | [SDK Contract](03-01-sdk-contract.md)                   | SDK types, guard, and exact-type oracle          |
| 03-02 | [CLI Command](03-02-cli-command.md)                     | `client create` / `client update` / `client get` |
| 03-03 | [Admin UI Protocol Tab](03-03-admin-ui-protocol-tab.md) | Terminal switch and save intent                  |
| 03-04 | [Portability and Docs](03-04-portability-and-docs.md)   | Export/import contract and field docs            |
| 07    | [Testing Strategy](07-testing-strategy.md)              | ST cases and verification                        |
| 99    | [Execution Plan](99-execution-plan.md)                  | Phases, sessions, and task checklist             |

## Quick Reference

### Usage Examples

```bash
# Create a third-party client that must show the consent page
porta client create --org acme --app crm --name "ERP Connector" --require-consent

# Read it back
porta client get --org acme <client-id>      # prints "Require Consent  true"

# Switch an existing client to require consent, or back off, without touching anything else
porta client update --org acme <client-id> --require-consent
porta client update --org acme <client-id> --no-require-consent
```

```ts
import { createClient } from '@portaidentity/sdk';

const { client } = await createClient({ ... });
await client.clients.create({
  organizationId: 'acme',
  applicationId: 'crm',
  clientName: 'ERP Connector',
  requireConsent: true,
});
```

### Key Decisions

| Decision             | Outcome                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------- |
| Plan home            | `admin-ui` / `admin-ui/RD-04` (AR-1)                                                    |
| Portability scope    | Included; backup/restore must preserve the flag (AR-2)                                  |
| CLI update semantics | `--require-consent` / `--no-require-consent`; absent leaves the client unchanged (AR-3) |
| Admin UI placement   | Protocol tab switch only (AR-4)                                                         |
| UI create dialog     | Unchanged; new clients default to `false` (AR-5)                                        |
| CLI display          | `client get` line only (AR-8)                                                           |
| migrations.md        | Out of scope; pre-existing gap recorded (AR-7)                                          |

## Related Files

- `packages/sdk/src/types/clients.ts`, `packages/sdk/src/domains/clients.ts`
- `packages/sdk/src/types/imports.ts`, `packages/sdk/tests/type-contracts/portability.spec.test.ts`
- `packages/cli/src/commands/client.ts`
- `packages/cli/src/admin/client-state.ts`, `client-service.ts`, `client-workspace.ts`
- `packages/server/src/portability/{types,repository,schema,plan-support,import-user-client-writers}.ts`
- `docs/api/clients.md`, `docs/cli/clients.md`, `docs/database/schema.md`,
  `techdocs/architecture/data-model.md`
