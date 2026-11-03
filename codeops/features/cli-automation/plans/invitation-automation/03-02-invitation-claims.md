# Invitation Claim Input

> **Document**: 03-02-invitation-claims.md
> **Parent**: [Index](00-index.md)
> **Authority**: AR-8/12/14 · requirement R4

## Command

`porta user invite` gains repeatable string-array option `--claim`; the bulk command reuses it.
Existing invite flags and successful human/JSON result shapes remain unchanged.

```text
porta user invite --org <organization-id> --email person@example.com \
  --claim '<application-id>:<claim-definition-id>:"Engineering"'
```

The placeholders must be replaced with actual UUIDs. Shell examples must quote each complete
assignment; colons within JSON strings/objects are data, not extra separators.

## Parsing

Add documented `parseClaimAssignments(values?: string[]): InviteUserInput['claims']` to
`src/parsers.ts`, importing the public SDK type only. Undefined/empty input returns undefined.
Split at the first two colons. Trim the two identifier fields; retain their submitted case in
the payload, as the existing role parser does. Both must match its canonical UUID-shape guard.
Parse the entire remainder as unknown with JSON.parse. Reject an empty/malformed remainder and
non-finite numbers at any depth; otherwise preserve JavaScript JSON values, including null,
objects, arrays, false,0 and strings containing colons. Normal JSON.parse number semantics apply;
this is not arbitrary-precision JSON.

Track each `(applicationId.toLowerCase(), claimDefinitionId.toLowerCase())` pair. A duplicate is
a local input failure, even if its value is equal or the UUID spelling differs only in case.
All assignments validate before any SDK call. Do not mutate existing role-parser behaviour.
Errors identify the option and1-based assignment position through bounded local diagnostics,
never echo the JSON value. JSON mode uses03-01's fixed envelope with no invented HTTP400.

## Data and authority

Construct `{ applicationId, claimDefinitionId, value }` objects explicitly. Never spread parsed
claim objects into argv, prototypes, auth configuration or request options. A `__proto__` property
inside a parsed claim remains inert nested JSON data. No eval or new parser dependency.

Server definition existence, application ownership, authorization and accepted claim-type policy
remain unchanged. Do not fetch definitions to implement an extra local authorization catalogue.
The CLI does not guarantee that a syntactically valid JSON value will be accepted on invitation
acceptance; the current server contract remains authoritative.

## Integration

Extend `UserInviteArgs` and the existing builder in `src/commands/user.ts`; parse claims before
`createClient` alongside roles and include `claims` only when present. Tests use a focused
`tests/commands/user-invite-claims.spec.test.ts`, not a larger general user test. Bulk shared-option
validation invokes the same parser; no second claim grammar is introduced. New malformed-claim
input uses the local validation exit3 without changing legacy role-error paths (AR-13/14).

Update `docs/cli/users.md`, CLI help and `packages/cli/README.md` with quoting, repetition,
duplicate behaviour and the existing deferred-invitation result. No SDK/server schema or package
dependency change is needed. Concrete expected values are owned by ST-16–23 in07.
