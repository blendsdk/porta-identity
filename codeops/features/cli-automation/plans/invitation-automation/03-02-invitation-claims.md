# Invitation Claim Input

> **Document**: 03-02-invitation-claims.md
> **Parent**: [Index](00-index.md)
> **Authority**: AR-8/12/14 · requirement R4

## Command

`porta user invite` gains repeatable string-array option `--claim`; the bulk command reuses it.
Existing invite flags and successful human/JSON result shapes remain unchanged.
Set `requiresArg: true` on the new option so every occurrence needs a value. A bare occurrence
or a trailing valueless occurrence after a valid assignment is ARGUMENT_ERROR/exit1 at the parser
boundary, never silently omitted. Do not change the existing role option's grammar (PF-005).

```text
porta user invite --org <organization-id> --email person@example.com \
  --claim '<application-id>:<claim-definition-id>:"Engineering"'
```

The placeholders must be replaced with actual UUIDs. Shell examples must quote each complete
assignment; colons within JSON strings/objects are data, not extra separators.

## Parsing

Add documented `parseClaimAssignments(values?: string[]): InviteUserInput['claims']` to
`src/parsers.ts`, importing the public SDK type only. Undefined/empty input returns undefined.
That helper convention does not authorize valueless CLI occurrences. Validate runtime array
elements before string operations: yargs negation can produce a Boolean despite a TypeScript
string-array declaration. Non-string assignments, including `--no-claim`, and explicitly empty
string values are local validation failures/exit3, without client creation or raw-value output.
Split at the first two colons. Trim the two identifier fields; retain their submitted case in
the payload, as the existing role parser does. Both must match its canonical UUID-shape guard.
Parse the entire remainder as unknown with JSON.parse. Reject an empty/malformed remainder and
non-finite numbers at any depth; otherwise preserve JavaScript JSON values, including null,
objects, arrays, false,0 and strings containing colons. Normal JSON.parse number semantics apply;
this is not arbitrary-precision JSON.
Check finite numbers with an explicit worklist rather than unbounded recursive traversal. Once
all input is parsed, JSON.stringify the complete prepared invitation input before createClient,
including roles, claims, recipient and request-wrapper nesting. Convert encoding failures into
the local validation discriminator/exit3 and discard the encoded text. Reuse that same plain
prepared request for SDK dispatch. Do not add a fixed nesting limit, custom serializer or new
dependency. Parsing an isolated claim successfully is not proof the SDK can encode its request
(PF-006).

Keep the small shared encoding check in `src/parsers.ts` as documented
`validateInvitationEncoding(input: InviteUserInput): void`, using the public SDK type. It returns
normally only when ordinary complete-request encoding succeeds; otherwise it throws the local
input discriminator. It does not retain or return the serialized body. This helper is reused by
single and bulk preparation, not a generalized serialization layer.

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
The new claim parser and pre-dispatch encodability check use the local-input discriminator while
retaining bounded option/assignment diagnostics in human mode. They do not relabel legacy errors.

Update `docs/cli/users.md`, CLI help and `packages/cli/README.md` with quoting, repetition,
duplicate behaviour and the existing deferred-invitation result. No SDK/server schema or package
dependency change is needed. Concrete expected values are owned by ST-16–23 in07.
ST-49/50 additionally qualify option cardinality and complete-request encodability.
