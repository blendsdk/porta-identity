# Ambiguity Register: Organization Settings and Branding Plan

> **Status**: ✅ GATE PASSED — all 6 items resolved
> **Last Updated**: 2026-09-11 21:08
> **CodeOps Artifact Schema**: 1

|   # | Category            | Ambiguity / Gap                                                                                                        | Options Presented                                                                                                                                                                                                                            | User Decision                                                                                                                                                                                                                              | Status      |
| --: | ------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
|   1 | Scope ambiguities   | Does the plan implement only preflighted `admin-ui/RD-06`, without optional additions?                                 | Keep the exact RD-06 boundary / reopen requirements                                                                                                                                                                                          | User confirmed the exact preflighted RD-06 boundary with no optional additions.                                                                                                                                                            | ✅ Resolved |
|   2 | Technical unknowns  | What is the smallest implementation structure?                                                                         | Directly extend existing server routes/services, SDK domains, CLI Admin UI patterns, templates/CSP, one forward migration, and bundled proxy configuration; add no concurrency or generalized support machinery / introduce new abstractions | User confirmed the direct existing-pattern implementation and prohibited unnecessary complexity.                                                                                                                                           | ✅ Resolved |
|   3 | Non-functional gaps | Which verification boundary governs execution?                                                                         | Affected server, SDK, and CLI workspace verification; structure and UI tests; security assurance with `production-security`; clean-revision `tenant-admin` compatibility; never root `yarn verify` / a different boundary                    | User confirmed the proposed verification boundary and the standing root `yarn verify` prohibition.                                                                                                                                         | ✅ Resolved |
|   4 | Technical (runtime) | Should the effective-branding module follow the execution-plan path or the committed specification and auth consumers? | Use one `src/auth/effective-branding.ts` module / duplicate or wrap it under `src/lib`                                                                                                                                                       | User confirmed one direct `src/auth/effective-branding.ts` module; no duplicate wrapper.                                                                                                                                                   | ✅ Resolved |
|   5 | Technical (runtime) | What truthful observation should replace the stale unchanged-database expectation for the mail-failure assurance case? | Verify the intended durable retry job and job-owned token through one bounded query of the harness-owned PostgreSQL container / retain the stale equality oracle / weaken the incomplete registry                                            | User approved the durable-retry integrity oracle after the existing organization fingerprint was proven unrelated.                                                                                                                         | ✅ Resolved |
|   6 | Final assurance     | How should the registered production HTML CSP product failure be disposed?                                             | Diagnose and correct the exact cause / defer it outside this feature / relabel or suppress it                                                                                                                                                | The user superseded the initial deferral and authorized a fix. Diagnosis proved that the observer compared rotating CSRF tokens as stable identity evidence; the correction verifies stable form targets and repeated CSP headers instead. | ✅ Resolved |

## Resolution Notes

**AR-1:** The planning target and modification set are the implementation plan for preflighted
RD-06. Other requirements, plans, source, tests, and documentation are context only.

**AR-2:** The direct component boundary reuses current repository patterns and adds no optional
feature, concurrency workflow, or material support system.

**AR-3:** Execution uses these confirmed gates:

```text
yarn workspace @portaidentity/server verify
yarn workspace @portaidentity/sdk verify
yarn workspace @portaidentity/cli verify
yarn test:structure
yarn test:ui
yarn assurance:harness --project security --profile production-security
yarn assurance:compat --select tenant-admin   # from a clean committed revision
```

Root `yarn verify` is excluded by the user's standing instruction.

**AR-4 (runtime):** Effective branding belongs to the existing authentication presentation area at
`src/auth/effective-branding.ts`. The plan and implementation use that one module directly; no
parallel `src/lib` module or compatibility wrapper is added.

**AR-5 (runtime):** The mail-failure assurance case verifies Porta's intended durable recovery
behavior instead of requiring no database change. One bounded observer tied to the owned harness
PostgreSQL container confirms exactly one probe job, a valid retry or terminal state, a bounded
attempt count and closed failure reason, one job-owned reset token, and no orphan reset token. It
returns only boolean evidence and never retains protected addresses, token hashes, or raw rows.
The existing incomplete registry remains unchanged. This is the user-approved necessary
modification-set expansion for the pre-existing final-gate blocker.

**AR-6 (final assurance):** Runs `80b7ecaf-97f4-458a-91dc-e3b52ee50d0a` and
`3c7ea4ed-cb23-4249-8b01-466996abc56f` reported `st55-production-html-csp-policy` as a product
failure even though its status, body contract, and CSP headers passed. The observer incorrectly
required two HTML renders to be byte-identical, while Porta correctly rotates the form CSRF token
on each render. The user authorized correcting this false product classification. The observer now
checks that every form remains under the created interaction path and that the second response
retains the required CSP headers. Existing evidence artifacts remain unchanged.
