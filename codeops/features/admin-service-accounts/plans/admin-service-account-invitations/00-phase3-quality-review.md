# Phase3 Quality Review: Native Machine Invitations

> **Status**: ✅ Review gate closed — all three Major findings independently closed; assurance pending
> **Baseline tree**: 4e911e65ddd3bc9aa41151cb7d0e2dab11f98671
> **Reviewed checkpoint**: 7d9bcf0dc2cbe095ff4a52076c670dff781c612b plus the expiry corrections
> **CodeOps Artifact Schema**: 1

## Review scope and qualification

The48-file bounded diff includes Phase3 native proof/token/authentication, exact invitation and
management routes, retained outer audit/delivery integration, independent specifications, hardening,
actual inventory and owning documents. Unrelated SQL and protected files are excluded. Strict scope;
no additional Admin capability, dependency, infrastructure, framework, Admin UI or risk waiver.

| Review | Independent session | Current result |
| --- | --- | --- |
| Correctness, maintainability, standards, API and concurrency | ses_e5222ebe4ffeBhDIEUSE0mplR5 | One Major RV-3-001; no other necessary finding |
| Security: auth protocol, tenant isolation, OWASP web | ses_e5221aca3ffe5btb42jQH7UUKn | Major SA-3-001 duplicates RV-3-001; distinct Major SA-3-002; no other concrete finding |

The source checkpoint passes strict full local verification and135 browser cases without retries.
That evidence missed natural credential expiry during a lock wait and does not close RV-3-001.
No production-security/protocol assurance was started before the finding arrived. The owned
verification worktree is clean at the affected checkpoint; it is not an accepted final source.

## RV-3-001 — Transaction-start time in post-lock credential expiry

**Severity:** Major. **Location:** service-accounts/tokens.ts:40–47, with transaction start in
lib/database.ts:82–84 and parent lock in service-accounts/authorization.ts.

The token hook begins its transaction before acquiring client/binding/account locks. PostgreSQL
NOW() retains that transaction-start timestamp. The later exact-secret query can therefore accept
a proven modern or legacy credential that expires while the transaction waits for its parent.
A separate still-live canonical credential allows the native provider to accept the rewritten
digest, so it cannot substitute for revalidating the exact proof's current expiry.

This violates the existing approved post-lock ownership/status/expiry revalidation contract.
The minimum correction needs fresh authoritative PostgreSQL time in the post-lock check, not a
new transaction owner, lineage store or changed expiry policy. AR-37 selects clock_timestamp()
in the existing exact-row predicate, independently challenged at equal cost to statement time
but without its pre-evaluation delay window. Independent modern/legacy HTTP lock-wait expiry regressions must first demonstrate red,
then remain sealed through the correction. No old oracle is weakened or skipped.

The new four-case expiry suite observes actual intended red and is sealed at
22ad8842f66da0fe62b66bca971ffd70f13951f297671bcf44d9458a3edd6250. Separate four-case future-expiry
controls pass on uncorrected source and are sealed at
eadc2e1d75b3034e19f0c6e4a602558b366d0aecae729d812c8ea5d99d8fac17. After the one-expression
correction, all34 selected proof/ordinary-client cases pass, including the unchanged14 ordinary
handoff controls. Lint/typecheck/build pass. Corrected full gates and scoped closure are pending.

Both distinct root causes now have independent full-application regression evidence. The two native
locked-admission cases fail as actual201-not-401 committed invitations on the uncorrected source,
then pass after a readonly trusted-expiry projection and two strict admission comparisons. The
corrected combined selection passes262 cases with zero failures or skips, and the physical
behavioral inventory is446.

### Scoped closure

| Finding | Reviewer | Result |
| --- | --- | --- |
| RV-3-001 | ses_e5193bf83ffeGo3EUvuuetIOfQ | CLOSED; no fix-introduced Critical/Major |
| SA-3-001 | ses_e5193bf82ffekOs3gM1isyENOK | CLOSED; AR-37 same root, no new defect |
| SA-3-002 | ses_e5193bf82ffekOs3gM1isyENOK | CLOSED; AR-38 boundary accepted, no new defect |

Both original reviewers confirmed the exact post-image bytes, the sealed red/green oracles and the
401 rollback behavior. Corrected strict root verification passes structure158, server unit4,417,
integration1,161 (including262 feature cases), E2E134, pentest334, SDK610 and CLI1,795; lint,
typechecks and all four build/verify tasks pass. Browser regression passes135 with one worker and
zero retries. No third review or risk waiver was used. Clean-source production-security/protocol
assurance and current-source CI remain pending and are not implied by this static closure.

SA-3-001 independently confirms this same root cause. It requires no duplicate design or separate
product fix; both original reviewers must close their finding in the single scoped re-review.

## SA-3-002 — Native token expires during blocked admission

**Severity:** Major. **Locations:** service-accounts/authentication.ts:46–55 and
routes/admin-invitations.ts:30–45,115–120.

Strict native validity/exp checks happen before the authentication authority lookup waits for the
parent lock. A still-valid artifact may expire during that wait, yet the lookup returns success
without a current expiry check. The principal does not retain trusted native expiry for the
handler's later locked admission, which currently revalidates only binding authority. The
invitation, audits and delivery can therefore start after the strict300-second admission window.

The existing upload hardening expires the artifact before post-upload lookup begins; it does not
cover this later blocked window. AR-38 owns a bounded mechanism challenge. New source-free full-
application regressions cover post-upload authentication wait and later dispatch wait. Expiry must
be current after blocking authorization checks and before the counter/mutation admission point.
This does not require continuous validity through commit/SMTP or recalling committed invitations.

## Required closure

Record the authorized technical ruling; observe and seal the new real-DB regression; implement
the narrow correction; requalify affected source and all required runtime gates. Merge any original
security findings before the single scoped major-fix re-review. Both original reviews are complete;
neither executed the attacks or independently recomputed the supplied hashes. Never use earlier root/browser/CI
success as evidence that this newly identified case passed.
