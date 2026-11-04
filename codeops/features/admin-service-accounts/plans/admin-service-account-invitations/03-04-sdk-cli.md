# Wire, SDK and Conventional CLI

> **Authority**: R10/R13; AR-16/19/20

## Server contract

The approved client subresource uses internal client UUIDs, not public OAuth client IDs.
GET/PUT return `{data: binding}`; DELETE returns204. Binding projection and status/error mappings
are owned by AR-19. All requests require human Super Admin authority. PUT input is the03-01
SetServiceAccountInput; strict body/target validation and immutable account email are enforced
server-side. No public credential/version field or arbitrary permissions input is accepted.

Register the three methods through a focused routes/client-service-account.ts module integrated
with the existing client router. Use existing fixed-body domain-error mapping and preserve413/429.
Do not leak rejected values in validation responses. No optimistic editor, polling or Admin UI.

## SDK

Add focused public service-account types to types/client-service-accounts.ts and the existing type
barrel. ClientsDomain adds:

- getServiceAccount(id: string): Promise<ClientServiceAccount>
- setServiceAccount(id: string, input: SetClientServiceAccountInput): Promise<ClientServiceAccount>
- revokeServiceAccount(id: string): Promise<void>

Use existing HttpTransport and runtime response guards; encode path identifiers safely and reject
dot-segment traversal before dispatch. SDK data uses ISO dates and the same exact request/response
fields; reject malformed responses without returning partial data. No transport/auth rewrite.
Machine consumers reuse createClientCredentialsAuth with explicit scope admin:user:invite and
the control-plane token endpoint; no browser refresh token or new SDK provider is needed.

## CLI

Add commands/client-service-account.ts under the existing client command:

- `porta client service-account get <client-id>`
- `porta client service-account set <client-id> --policy-file <path> [--email <address>]`
- `porta client service-account revoke <client-id>`

The set policy file is UTF-8 JSON `{targets:[...]}`, at most100KiB. Use bounded regular-file input,
complete local shape/identifier/email/count/duplicate/encoding validation before createClient, and
safe fixed errors. Do not dereference special files or expand file contents as command options.
The CLI cannot know first-versus-replacement state without a request; the server enforces initial
email presence. Do not add a preflight GET or automatic retry to set.

JSON get/set print the unwrapped binding; JSON revoke prints exactly
`{"clientId":"<internal UUID>","status":"revoked"}` on initial and repeated successful revoke,
without secrets. Human output uses existing safe sanitization,
concise summaries and unpadded policy rows so long labels cannot amplify output. Explicit mutations
are direct, without another confirmation workflow, report file or credential-persistence feature.
Existing global JSON error classification/exits and ordinary human behavior are unchanged.
No client-credentials login/storage command is added to the CLI; these commands manage bindings
using existing human administrator authentication. Machine invitation execution is an SDK use case.

## Documentation and qualification

Update docs/api/authentication.md, docs/api/clients.md, docs/guide/sdk-node.md, docs/cli/clients.md,
package SDK/CLI references and maintainer security/API/data-model docs where facts change. Explain
first-bind/restoration secret retirement, explicit replacement-secret generation, limits, SDK
scope, email delivery, revocation ordering, safe rollout and rollback guard. Remove the blanket
claim that every Admin client-credentials token is rejected, but retain the denial for unbound,
tenant or unauthorized clients. Do not publish infrastructure/root secrets or test DNS examples.

ST-46–60 own SDK/CLI/public-contract behavior. Packed compatibility qualifies package/source
provenance and existing contracts; direct new-feature OAuth/security tests remain separately
required. Run only registered selectors; do not invent a compatibility profile.

## Direct packed machine journey (PF-002)

Before implementation, independently author
test-harness/assurance/tests/service-account-packed.spec.test.ts from ST-57 and this contract.
The focused live driver is test-harness/assurance/compat/service-account-invitations-live.ts, with
a small service-account-invitations.ts evidence collector/validator. Reuse the existing prepared
consumer, packed public exports, owned operational fixture, exact source/image/archive provenance
and cleanup helpers. Integrate the new journey only into the existing
`pnpm assurance:compat --select compatibility` path AFTER its existing credential-isolation
outcomes; do not change ST-69–73 or the closed p1-admin read catalog. Report the new feature journey
separately from credential isolation, preserving existing failure/cleanup precedence.

The journey explicitly provisions an owned bound client, generates its replacement secret via the
existing endpoint, obtains a token through the packed SDK auth provider, invites an allowlisted
ordinary target and independently observes durable invitation state. It revokes the binding and
observes rejection with no new invitation. Package outputs alone are insufficient. Cleanup removes
all owned fixture data, consumer/worktree and secret material even on failure; no unrelated user
or installation is modified. This is an existing-seam test extension, not a new harness/selector.
