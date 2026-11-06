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

AR-37 also covers natural proof expiry during the native issuance parent-lock wait. The exact
post-lock row predicate compares expiry with PostgreSQL clock_timestamp(), not transaction-start
NOW(). This is current validity at that locked check, not a new requirement for validity through
later commit/provider persistence/HTTP delivery. Keep ordinary credential selectors unchanged.

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

Preserve the native provider's existing lookup clock tolerance. Feature authentication must still
honor the native model's strict expiry/isValid state, not mistake a model returned within lookup
grace for usable invitation authority. Expiry specifications observe native exp−iat=300 and strict
isExpired state at the application boundary; faking Node time does not advance Redis's wall clock.

Under AR-38, retain only finite trusted native exp as tokenExpiresAt on the existing request-only
principal. Recheck strict exp > current epoch seconds after awaited authentication authority and
again after all locked dispatch authority/reference checks, immediately before feature counter
admission. Equality rejects with401. Preserve that primitive in the live principal handoff; never
accept it from inputs or add it to the closed persisted identity namespace. No native model/raw
token wrapper, extra lookup or store is introduced. Already admitted work need not remain unexpired
through counter I/O, persistence, COMMIT or SMTP and is not cancelled on later expiry.

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

Runtime AR-35 selects the existing bounded parser using a short authentication-only transaction,
then reauthenticates after body completion before durable dispatch. Initial identity is not retained
as mutation authority. Human parser coverage and malformed/oversized error precedence stay as
before; only validated machine data uses native prototype-key preservation. Machine opt-in also
requires the case-sensitive /api/admin/ prefix covered by retained Admin CORS/rate protection.
Router case/trailing-slash aliases below that prefix share one counter and transaction owner;
unprotected prefix-case aliases cannot acquire a machine lane. No other route parser changes.

## Durable dispatch

The existing adminMutationAudit middleware remains the OUTER transaction owner even after router
extraction. Add a narrow validated machine-actor branch for the exact invitation operation only,
using existing client audit columns plus safe account/binding/version metadata. Preserve the
ordinary human branch, final generic audit, rollback and error ownership. Nested helpers must
reuse this owner rather than assume they commit independently. If its final audit fails, the
invitation/business audit and all mutation state roll back and no email is sent (PF-006).

Only the server-global invocation defers this exact POST. Its dedicated router reuses the default
adminMutationAudit owner after bounded parsing/fresh authentication and before permission/handler
execution. Captured initial authentication errors are released only after parsing through the
same existing error owner. No raw parser-error body recovery or generic deferred-auth framework.

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

Under runtime AR-32, the existing InvitationEmailOptions gains only the default-off internal
`reportRecipientAcknowledgement` option for validated bound-account invitations. Ordinary human,
tenant-service and direct callers keep their current transport-result behavior. In the opted-in
lane, the recipient in accepted only means sent/true; rejected only means failed/false; neither or
both means unknown/false. A rejected transport Promise remains failed/false in both modes. The
boolean is not a request/header/token input, and `actor.kind === 'service'` alone cannot enable it.
Do not record a sent delivery audit for failed/unknown acknowledgements or expose arbitrary
transport error details. The result still finalizes only after the actual outer commit/effects.

## Limits, failures and evidence

Strict30 requests/hour per bound client across ALL target organizations, in addition to retained
Admin/token protection. Counter unavailability fails closed with503; exhaustion429 retains
Retry-After. No per-target-only counter loophole, permission cache or wait/retry mechanism.
Authentication denial401, authorization denial403, validation400, and dependency503 retain safe
fixed bodies; never return metadata/token/SQL internals to public callers.

ST-29–45/62/63/67 qualify real OAuth HTTP issuance, route isolation, version/replay/rebinding, live
state changes, outage behavior, concurrency, audit and delivery ordering. A model-only probe or
ordinary Admin compatibility journey does not prove these new boundaries.

## Independent-oracle fixture coordination

The native specification author owns new `machine-http-fixtures.ts` and, if required, a separate
small `credential-proof-fixtures.ts` under server tests/integration/service-accounts. The other
authors consume the frozen helper interface, never each other's oracle bodies or product source.
No existing sealed helper is edited. These are focused test helpers, not a new runner or framework.

- `createMachineHttpFixture(options?: {bound?: boolean; method?: 'client_secret_basic' |
  'client_secret_post'}): Promise<MachineHttpFixture>` creates a real provider and full createApp
  HTTP listener using the existing lifecycle fixture. The default is bound; unbound setup is
  explicit. It first verifies NODE_ENV and exact matching test database/Redis URLs, then resets
  only those owned stores. It initializes real rendering and captures only the true external
  email transport. First binding retires the old credential; bound setup generates a new one.
- `MachineHttpFixture` exposes `lifecycle`, `provider`, `baseUrl`, `binding` (null only when
  explicitly unbound), `credential` (id/plaintext), and asynchronous `close()`. It also exposes a
  focused `humanToken(actor)` fixture seam mapping opaque tokens only to actual stored human IDs;
  unknown tokens still use the genuine provider lookup, and ClientCredentials lookup stays real.
  No machine identity or authority is fabricated. Secrets are never included in assertion dumps.
- `issueMachineToken(fixture, options?)` uses real token HTTP. Options may select secret, public
  client ID, issuer slug, scope, Basic/POST method, and additional raw form fields. It returns
  status plus safely parsed body, never logs token/credential-bearing payloads.
- `machineRequest(fixture, {method,path,token?,body?,rawBody?,headers?})` is only a small HTTP
  request helper, returning status/body/text/headers. `rawBody` enables valid JSON syntax that
  parses to non-finite/deep values without mocking validation. No retry or auth fallback is added.
- `readMachineInvitation(organizationId,email)` queries actual invitation state, and a separate
  count verifies no eager user. Neither helper is a substitute for an explicit positive/negative
  assertion in each oracle. Cross-author imports cover fixture helpers only.

The documented ordinary native ClientCredentials baseline is600 seconds without a resource;
preserve existing resource access-token TTL overrides. Feature tokens use300 seconds and native
stored expiry as well as the response. Initial management PUT is201; replacement/restoration200,
GET200 and DELETE204, as fixed by AR-19. A protected-operation test must use a confirmed route,
not credit404 as authentication denial. Existing GET/PUT/DELETE clients, user list/create,
configuration read and invitation preview provide the ordinary human-only operation matrix.

The native author owns this frozen common HTTP helper. Management and invitation authors consume
its contract without reading native oracle bodies. The staged construction release preceded the
full release below; no product implementation is authorized by either. This fixture contract adds
no product capability or new infrastructure.

Runtime AR-32/33 close those remaining interfaces before full authoring release:

- The feature barrel re-exports
  `buildServiceAccountInvitationRateLimitKey(clientId: string): string` from rate-limit.ts. The
  internal client UUID is the only varying key component; real Redis key corruption can isolate
  feature-counter failure without disabling native token lookup or other retained limits.
- Both machine business and outer audits have actor_type client, null actor_id/user_id, public
  OAuth actor_client_id and live actor_client_name. Exact safe metadata fields are serviceAccountId,
  bindingId and authorizationVersion, from the validated locked binding; existing metadata remains.
- AR-32's default-off acknowledgement option and exact truth table govern only validated bound
  invitations. Existing human/tenant/direct results and rejected-Promise semantics remain.
- The native author owns the separate small credential-proof-fixtures.ts using the existing real
  bridge's afterCredentialValidation callback. Real resolver/client binding, body/raw-request/org
  transfer, original URL and issuer context stay intact. No createApp hook is added. Return reached,
  release and close controls, always release/settle requests in finally. Distinct modern canonical
  and proven credentials prevent ordinary provider rejection from hiding a missing proof check.
- Concurrency fixtures may consume the existing holdLifecycleWork and waitForLifecycleParentBlock
  helpers: they run real operations inside the existing transaction and observe the exact blocked
  parent query through pg_blocking_pids. SMTP holding starts only at the true external transport.

All three source-free authors may now write only their assigned disjoint new specification/helper
files. No implementation is released until their intended red and frozen oracle identities qualify.
