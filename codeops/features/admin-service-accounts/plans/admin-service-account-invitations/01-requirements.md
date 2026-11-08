# Requirements: Admin Service-Account Invitations

> **Source**: GitHub #184, narrowed by explicit user decisions AR-2/15/16
> **Ownership**: Standalone owning requirements; no upstream RD

## Functional requirements

| ID  | Required behavior                                                                                                                                                                                                                                              | Authority     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| R1  | Only an explicitly bound active confidential control-plane client may obtain invitation-capable machine identity. Ordinary tenant/public/unbound clients gain no Admin capability.                                                                             | AR-6/8/15/16  |
| R2  | Binding creation provisions a new real super-admin-organization user, permanently classified internally as service-only, with exactly the reserved canonical porta-invite-service role. Never adopt a human account or share an owned account between clients. | AR-7/15       |
| R3  | Service-only accounts cannot use human login, magic links, reset/recovery, password-setting, ordinary OIDC account resolution or the human Admin token lane. Classification survives unbinding, revocation and reactivation attempts.                          | AR-7/15       |
| R4  | Only authenticated human Super Admin authority manages bindings and bound-client/credential mutations. Generic role administration cannot assign the reserved role or mutate service-owned memberships. Ordinary clients/users retain existing behavior.       | AR-6/15       |
| R5  | Machine authority is limited to the real Admin invitation POST operation, explicit target organizations and application-qualified allowed role/claim definitions. Other Admin operations, preview and control-plane targets are denied.                        | AR-2/5/16     |
| R6  | Policy bounds, input shape, live-definition semantics, OAuth scope, operation permission and token lifetime are exactly those approved in AR-16. All validation is complete before a policy update changes existing rows.                                      | AR-12/13/16   |
| R7  | First binding/restoration retires prior secrets. Restore only the same owned account. Policy/lifecycle changes and explicit secret revocation invalidate earlier machine authority versions. Overlapping secret generation alone does not.                     | AR-9/15       |
| R8  | Authority and invitation persistence are ordered against revocation. A revocation ordered first admits no invitation; an invitation committed first is not recalled, and its post-commit delivery may continue. Preserve creation versus delivery outcomes.    | AR-9/11/15/18 |
| R9  | Binding/account/role/credential mutations that form one security operation and their durable audit commit atomically. Identify both the service account and issuing client without recording tokens or secrets.                                                | AR-11/15/18   |
| R10 | Provide the approved secret-free Admin subresource, SDK methods and conventional CLI management commands. Preserve existing invitation results, human authentication, stdout/error/exit contracts and Admin UI behavior.                                       | AR-3/10/16/19 |
| R11 | Fail closed on unavailable authority and strict rate counters. Keep existing token/Admin protections and enforce the approved client-wide invitation ceiling; no new mutation retry or queue.                                                                  | AR-12/16      |
| R12 | Protect existing installations and upgrades: ordered additive migration, reserved-role seeding, no unsafe downgrade of surviving service accounts, no claimed old-binary coexistence after provisioning.                                                       | AR-18/20      |
| R13 | Qualify the feature with independent immutable specifications, actual HTTP/database/concurrency/security evidence, relevant packed compatibility and CI; publish operator/developer documentation and remove all task-owned resources.                         | AR-14/16/20   |

## Scope exclusions

No general service-account platform, arbitrary admin roles, wildcard targets, account conversion,
automatic pre-binding credential reuse, human Admin UI, new dependency/infrastructure, worker,
token wrapper, secret lineage framework, new portability format, release, merge or issue mutation.
Existing tenant APIs are not widened to implement this feature. This plan does not promise
permission snapshots for allowlisted role identities, delivery cancellation or retroactive undo.

## Compatibility and acceptance

Existing human, tenant and unbound-client behavior remains covered by regression tests. New
service-only identities are additive and never become human identities through fallback defaults.
The scope's acceptance evidence is the ST catalog in07; interfaces and mechanics are owned by03.
Coverage targets are core90%, support80%, glue60%. No new numerical latency promise is invented;
authority queries are bounded by the approved input limits and are checked for obvious unbounded
work. Security and correctness are not traded for throughput.
