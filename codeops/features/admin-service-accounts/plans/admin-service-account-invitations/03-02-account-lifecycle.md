# Permanent Accounts and Credential Lifecycle

> **Authority**: R2–R4/R7/R9/R12; AR-15/18/19

## Explicit provisioning

service.ts exports getServiceAccount(clientId, actor), setServiceAccount(clientId, input, actor)
and revokeServiceAccount(clientId, actor). actor is the authenticated Admin identity, not a supplied
body user ID. Revalidate human Super Admin authority inside mutations using canonical application
membership and the existing effective Super Admin role semantics. An account with the permanent
service marker is never a human administrator, regardless of roles.

### Independent-oracle interface packet

The public feature barrel exposes these planned server-side signatures. This fixes the test
interface before implementation; it does not widen the approved HTTP or SDK contract:

- `getServiceAccount(clientId: string, actor: AdminUser): Promise<ServiceAccountBinding>`
- `setServiceAccount(clientId: string, input: unknown, actor: AdminUser): Promise<ServiceAccountBinding>`
- `revokeServiceAccount(clientId: string, actor: AdminUser): Promise<void>`

`AdminUser` is the existing middleware identity with id, email, organizationId, roles:string[]
and permissions:readonly string[]. Those role/permission arrays are not authority snapshots for
lifecycle mutations: revalidate the actor's live account, organization and canonical role assignment.
Missing/denied/conflicting operations throw fixed safe domain errors; exact HTTP codes remain
AR-19/03-04's route contract. Native Date projection fields follow03-01. Existing client mutation
and secret methods keep their actorId argument and revalidate that ID under the parent lock when
a binding exists; an omitted actor must not bypass bound-client authority. Ordinary client calls
keep their established behavior. No new actor registry or mutation context is introduced.

Runtime AR-24 fixes the authorization point at the authoritative post-client-lock READ COMMITTED
statement. Do not hold actor/assignment locks through commit or add a broader coordinator.
Generic role mutations reject permanent service classification before organization/target locks.
For physical owned-user deletion, discover the binding without a lock, then acquire client→binding→
control-plane organization→owned user and revalidate ownership before the existing deletion capture.
The ordinary lifecycle helper's combined account lock must not invert that deletion order.

Client eligibility: active, confidential, owned by the super-admin organization and canonical
Admin application, with client_credentials and real client-secret authentication enabled. Do not
promote tenant/public clients or bootstrap human identities implicitly. Existing unrelated grants
confer no new machine Admin authority; service accounts cannot use human account flows.

First set requires a valid accountEmail. Create a NEW real account with no password, no recovery
or welcome message, permanent internal classification, and exactly the reserved canonical role.
An email collision is409 and rolls everything back; never adopt the existing user. Atomically
retire all old client secrets, create the binding with fresh random version and durable audit.
No secret is generated/returned by this operation. The administrator separately generates a new
secret through the existing operation.

Active policy replacement preserves the same account/email and existing secrets, writes the full
validated policy and a new random authorization version, and records one mutation audit.
Restoration from revoked state reactivates only the same owned account, establishes the reserved
role, retires all current secrets and mints a new version. Different supplied accountEmail is400.
Physical loss of the owned account is not silently repaired by adopting another identity. Preserve
the same-table non-restorable ownership marker and lost-owner409 behavior specified in03-01.

Revocation deactivates binding and account and changes version in the same transaction/audit.
Repeated revoke is a no-op returning204. A bound client's deactivation or resulting configuration
losing eligibility atomically revokes the binding/account and changes its version. Ordinary client
activation or configuration repair leaves that binding revoked. Only explicit binding restoration
can reactivate the same owned account and retire secrets. Client/account physical deletion follows
03-01's ownership rules and cannot leave usable authority. No worker removes orphan accounts or
changes their permanent class (PF-003/PF-009).

## Human and generic mutation guards

Add a narrow authoritative isServiceAccount lookup/guard in the users public module. Keep the
permanent flag internal rather than breaking every existing User/SDK projection. Apply direct
guards to password verification, magic-link issuance, queued recovery issuance, token consumption,
password setting/reset completion, ordinary OIDC account finding and human Admin authentication.
Check authoritative state even for old artifacts. Preserve generic public failure responses,
rate limits and password rejection shape; never disclose account classification to unauthenticated
callers. The machine lane uses its own active classified-account lookup.

Generic role assignment/removal cannot assign the reserved role to humans or modify dedicated
service memberships, even when an ordinary delegation ceiling includes invitation permission.
The service-only role contributes nothing in the human AccessToken lane. The machine lane fails
closed if any unexpected role membership is present and never unions broader roles.

Generic credential/profile/lifecycle authority-restoring operations on service-owned accounts are
rejected; only explicit binding lifecycle restores authority. Physical deletion remains under
human Super Admin control and atomically leaves the non-restorable marker while its client
survives. Preserve ordinary users. The bulk user-status writer is an independent direct SQL path:
exclude permanently flagged users in BOTH its lock and mutation predicates, retain its concealed
per-item denial and preserve mixed ordinary-user results. No User Admin or Super Admin bulk
activation/deactivation may mutate dedicated service identities (PF-008).

For feature-bound clients, configuration, lifecycle and secret mutations must check current
binding ownership and human Super Admin authority under the client lock. Keep existing App Admin
rights for ordinary clients. Generic permission checks alone are insufficient. Generation of an
overlapping new secret preserves tokens. Explicit revocation of a live secret changes the binding
authorization version atomically; all earlier machine tokens fail, without per-secret lineage.
Initial promotion/restoration retires every preexisting secret so retained credentials cannot
inherit authority. Secret contents remain in existing hash/one-time-display handling.

## Audit and races

Reuse writeAuditLogInTransaction. Management events identify the human actor, client, owned account,
binding and affected policy identifiers without secret values. Cache invalidation follows commit.
Lock consistently with03-01; ordinary mutators must not slip between eligibility validation and
binding creation. Do not hold database locks through email or other external work.

ST-13–28/61/64–66 are the lifecycle oracles. Phase2 ST-25 establishes version/secret transition
invariants only; actual usable-token preservation/revocation is ST-62 in Phase3. Their fixtures may
create classified rows directly in an owned
scratch database to test public human/authentication denial without depending on the new HTTP
management route, which remains unmounted until Phase3 is secure.
