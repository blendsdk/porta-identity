# Native Machine Tokens and Invitation Authority

> **Authority**: R1/R5–R9/R11; AR-8/9/15/16/18/19

## Issuance and lookup

Preserve the exact matched secret identity from the existing modern SHA-256 and legacy Argon2id
bridge branches in trusted request-only state, bound to internal/public client IDs and the
resolved issuer organization. The bridge currently rewrites a proven secret to the canonical
digest: that rewritten digest is NOT proof of which credential authenticated. Carry the bounded
record through a focused request-keyed WeakMap shared by the outer bridge and native hook, keyed
by the raw IncomingMessage, not outer Koa ctx.state (the provider creates another context).
Never accept caller fields/headers as proof or persist secret lineage. At feature issuance,
under the parent client lock, revalidate the matched secret's exact ownership, active state and
expiry before deriving binding/version metadata. Missing/retired/wrong proof cannot gain a newer
generation. Preserve existing ordinary-client in-flight handoff assertions unchanged. ST-63 covers
first binding, restoration and explicit overlapping-secret revocation races (PF-007).

Use native asynchronous extraTokenClaims for ClientCredentials only, never rewrite AccessToken
or return a synthetic account identity to every client. A classified binding authorizes only its
current active confidential control-plane client and the independently required admin:user:invite
OAuth scope. Require the trusted resolved control-plane organization at the OIDC request boundary;
do not infer issuer authority from an unvalidated header/body URL. Tokens requested through another
issuer, without the feature scope, or with incompatible resource restriction gain no Admin access.

Persist `extra['urn:porta:service-account']` as accountId, bindingId and version UUIDs, all derived
from authoritative server state at issuance. Nothing is supplied by caller-controlled metadata.
Reject issuance if eligibility cannot be established; map known dependency failures safely. The
feature TTL is300 seconds only for feature-capable tokens; preserve native existing tenant/unbound
token lifetimes and resource overrides. No refresh token or browser grant is added for service users.

The Admin provider boundary gains an explicit ClientCredentials lookup. Require exact, typed
metadata and matching native client ID, account, binding, version, active state, canonical role,
scope and current client ownership. Missing, malformed or stale extra grants nothing. Native
adapter live-reference validation remains in place; binding/version checks are additional.

## Exact route opt-in

Keep default requireAdminAuth human-only. Extract the existing real invitation POST handler into
a focused Admin invitation router at its unchanged path, registered before the ordinary users
router. Its dedicated middleware explicitly permits the machine lane as well as the unchanged
human lane. No global ClientCredentials fallback is added to Admin routers. The separate preview
and every other operation remain human-only even if they use the same permission constant.

Machine state carries the validated binding/token version and issuing public OAuth client ID
separately from the established AdminUser fields. Do not synthesize adminUser for a machine actor.
The dedicated invitation authentication/permission boundary handles that lane explicitly; generic
human permission middleware remains unchanged. The fixed ceiling is invitation only.
Human auth rejects permanently classified accounts and ignores the reserved service role.
Management routes are always human Super Admin only.

## Durable dispatch

The existing adminMutationAudit middleware remains the OUTER transaction owner even after router
extraction. Add a narrow validated machine-actor branch for the exact invitation operation only,
using existing client audit columns plus safe account/binding/version metadata. Preserve the
ordinary human branch, final generic audit, rollback and error ownership. Nested helpers must
reuse this owner rather than assume they commit independently. If its final audit fails, the
invitation/business audit and all mutation state roll back and no email is sent (PF-006).

For a machine invite, parse the existing invitation schema, then enter the existing short database
transaction. Acquire client/binding/account locks in the established order, recheck native identity,
version, account/role/client state and exact target/assignment allowlists, then consume the strict
client-wide invitation counter. Validate live application-qualified definitions and the complete
JSON request before modifying invitation state. Reject non-finite claim numbers/encoding failure
without silently converting values; use iterative finite-value checks and native encoding rather
than a custom serializer/depth cap. Preserve supported JSON values.

Use the existing inviteUser persistence/email workflow. Keep its invitation/audit commit inside
the authority transaction; locks release at commit before delivery. If revocation wins the lock
first, reject the invitation without a durable record. If invitation commit wins, later revocation
does not undo it or suppress post-commit delivery. No retries or compensation queue.

Finalize sent/failed/unknown fields from the delivery holder AFTER the actual outer commit's email
effect, before HTTP serialization. A copied pre-commit result is not valid final delivery evidence.
Use a focused invitation-result finalization hook or equivalent local projection, not a general
callback framework; preserve the public result shape and direct-call behavior. Test through full
createApp, including sent/failed/unknown delivery, business plus outer audit attribution, final
audit rollback and SMTP paused while revocation completes. Router-only tests are insufficient.

The actor is a service client in existing audit columns, with real service-account ID, binding and
authorization version in safe metadata. Human invitation attribution stays unchanged. Return the
same creation/delivery response and existing conflict semantics; do not treat failed/unknown email
delivery as a rolled-back invitation.

## Limits, failures and evidence

Strict30 requests/hour per bound client across ALL target organizations, in addition to retained
Admin/token protection. Counter unavailability fails closed with503; exhaustion429 retains
Retry-After. No per-target-only counter loophole, permission cache or wait/retry mechanism.
Authentication denial401, authorization denial403, validation400, and dependency503 retain safe
fixed bodies; never return metadata/token/SQL internals to public callers.

ST-29–45/62/63/67 qualify real OAuth HTTP issuance, route isolation, version/replay/rebinding, live
state changes, outage behavior, concurrency, audit and delivery ordering. A model-only probe or
ordinary Admin compatibility journey does not prove these new boundaries.
