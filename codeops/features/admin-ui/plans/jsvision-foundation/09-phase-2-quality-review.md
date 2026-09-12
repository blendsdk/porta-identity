# Phase 2 Quality Review

## Scope

- Baseline tree: `3f5b6c9d304a989fd2d8bed6f7fe91d55bf35081`
- Review lenses: API surface, terminal lifecycle, authentication security
- Verification boundary: affected CLI and SDK packages, repository structure, and the focused server initialization-guidance test
- Explicitly excluded: full Porta server verification, new CI workflows, runtime matrices, workspaces, and standalone admin applications

## Initial Review Disposition

| Finding                                                    | Severity      | Resolution                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RV-201 / SA-201: actions were not bound to real keys       | Major         | Added application keymap bindings and decoded-key tests for Authenticate, Retry, Reauthenticate, Cancel, and Quit.                                                                                                                                          |
| RV-202 / SA-204: login interactions were stubs             | Major / Minor | Added JSVision-owned authorization URL, manual callback, and cross-origin replacement dialogs.                                                                                                                                                              |
| RV-203: first-run server selection was unreachable         | Major         | Missing configuration now opens a validating JSVision server-origin dialog before session preparation.                                                                                                                                                      |
| RV-204: chrome did not follow live resize                  | Major         | Menu and status items now switch when the live viewport crosses the recoverable boundary.                                                                                                                                                                   |
| RV-205 / SA-205: signal ownership competed                 | Major / Minor | The native admin runner uses one JSVision host with immediate signal exit disabled; its callback aborts the current operation, quits once, restores the terminal, and reaches shared finalization. Injected runners retain isolated signal seams for tests. |
| RV-206: reauthentication cancellation discarded identity   | Major         | Session-level cancellation is represented as no replacement state, so both Escape and dialog-level cancellation retain the current verified identity.                                                                                                       |
| RV-207 / SA-203: fatal causes could reach root diagnostics | Major         | Application errors discard internal causes and the command emits one fixed bounded startup message with exit code 1.                                                                                                                                        |
| SA-202: refresh network work was not cancellable           | Major         | `CliAuthOptions.signal` reaches the refresh fetch as well as the existing credential lock and persistence paths.                                                                                                                                            |

## Bounded Rereview

The independent reviewer cleared RV-201, RV-202, RV-203, RV-204, and RV-207. The security auditor cleared SA-201, SA-203, SA-204, and SA-205. Their bounded rereview identified two residual major cases:

1. Native signals still used JSVision's immediate process exit before the administration finalizer.
2. Dialog-level reauthentication cancellation still resolved to an unauthenticated replacement state.

Both residuals were corrected without adding infrastructure or product scope. The native runner now configures `exitOnSignal: false` and routes the host callback through operation abort, Quit, terminal restoration, and finalization. Reauthentication now returns no replacement state on a cancelled coordinator result, which preserves the verified presentation. Focused PTY and headless tests exercise native signal restoration/status, application abort/finalization, decoded keyboard cancellation, and resolved dialog cancellation.

## Verification

All commands ran on Node 24.20.0 with Yarn Classic 1.22.22.

| Gate                                       | Result                                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------------- |
| `yarn install --frozen-lockfile`           | Passed                                                                             |
| `yarn workspace @portaidentity/cli verify` | Passed: lint, typecheck, build, 39 files / 443 tests |
| `yarn workspace @portaidentity/sdk verify` | Passed: lint, typecheck, build, 33 files / 413 tests                               |
| `yarn test:structure`                      | Passed: 83 tests                                                                   |
| Focused server init-guidance selector      | Passed: 1 test                                                                     |

No critical or major finding remains after the authorized residual corrections and post-rereview scoped verification.
