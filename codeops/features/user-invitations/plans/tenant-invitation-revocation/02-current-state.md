# Current State: Tenant Invitation Revocation

> **Parent**: [Index](00-index.md)
> **Observed baseline**: origin/develop `4e305086172b6785337815c8e2cc3de4b08c1866` (v1.15.0)

| Evidence | Current fact | Planned touch |
| --- | --- | --- |
| `packages/server/src/routes/tenant-users.ts:447–501` | Tenant invitation accepts service/user actors and passes actor application into shared creation. | Creation itself remains mounted as-is. |
| `packages/server/src/users/invite-service.ts:305–328` | Application is validated for pre-assignment but not persisted. | Pass optional application ownership to existing insertion. |
| `packages/server/src/auth/token-repository.ts:766–840` | Replaces by organization/email; hash lookup checks unused/unexpired tenant token. | Add insert column/input only; preserve replacement and public reads. |
| `packages/server/migrations/033_invitation_deferred_user_creation.sql:31–35` | Partial uniqueness is organization/email-wide. | Do not alter it. |
| `packages/server/src/users/invitation-service.ts:55–90` | Acceptance locks token, inserts user and consumes token atomically. | Reuse its row-lock arbitration, without redesign. |
| `packages/server/src/lib/audit-log.ts:254–279` | Transactional audit writer propagates failure. | Reuse for actual revocations. |
| `packages/server/src/middleware/tenant-user-auth.ts:187–266` | Live service/user membership and application checks; control-plane rejected. | Reuse policy configured like invite. |
| `packages/server/src/middleware/tenant-user-rate-limiter.ts:40–90` | Existing strict delete limiter supports both actor kinds. | Reuse unchanged. |
| `packages/sdk/src/domains/users.ts:157–173` | Existing domain uses transport-selected prefix and returns invitation handle. | Add method and exported input type. |

## Risks and dependencies

- Ownership cannot be reconstructed for legacy/admin artifacts; resolved by AR #2/#7.
- Existing replacement can invalidate another application's invitation for the same organization/email; explicitly unchanged, not a new isolation claim.
- Application deletion will clear owner without expiring the artifact; compatibility tradeoff explicitly accepted in AR #7.
- Audit failures must roll back; race tests must observe real blocking/order, not sleep-based assumptions.
- Server wiring must mount the new route independently of Admin API authentication.
- Real-service tests use existing PostgreSQL/Redis/MailHog and registered assurance/compatibility runners. No new dependency is needed.
