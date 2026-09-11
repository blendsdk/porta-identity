# Ambiguity Register: Organization Settings and Branding Plan

> **Status**: ✅ GATE PASSED — all 3 items resolved
> **Last Updated**: 2026-09-11 11:25
> **CodeOps Artifact Schema**: 1

|   # | Category            | Ambiguity / Gap                                                                        | Options Presented                                                                                                                                                                                                                            | User Decision                                                                                      | Status      |
| --: | ------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------- |
|   1 | Scope ambiguities   | Does the plan implement only preflighted `admin-ui/RD-06`, without optional additions? | Keep the exact RD-06 boundary / reopen requirements                                                                                                                                                                                          | User confirmed the exact preflighted RD-06 boundary with no optional additions.                    | ✅ Resolved |
|   2 | Technical unknowns  | What is the smallest implementation structure?                                         | Directly extend existing server routes/services, SDK domains, CLI Admin UI patterns, templates/CSP, one forward migration, and bundled proxy configuration; add no concurrency or generalized support machinery / introduce new abstractions | User confirmed the direct existing-pattern implementation and prohibited unnecessary complexity.   | ✅ Resolved |
|   3 | Non-functional gaps | Which verification boundary governs execution?                                         | Affected server, SDK, and CLI workspace verification; structure and UI tests; security assurance with `production-security`; clean-revision `tenant-admin` compatibility; never root `yarn verify` / a different boundary                    | User confirmed the proposed verification boundary and the standing root `yarn verify` prohibition. | ✅ Resolved |
|   4 | Technical (runtime) | Should the effective-branding module follow the execution-plan path or the committed specification and auth consumers? | Use one `src/auth/effective-branding.ts` module / duplicate or wrap it under `src/lib` | User confirmed one direct `src/auth/effective-branding.ts` module; no duplicate wrapper. | ✅ Resolved |

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
