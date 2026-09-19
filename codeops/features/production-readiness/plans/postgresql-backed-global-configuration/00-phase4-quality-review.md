# Phase 4 Quality Review: Embedded Admin Configuration

> **Status**: Complete; RV-001 and approved capture correction verified
> **Last Updated**: 2026-09-17 20:26
> **Baseline tree**: 2ec627e5b0f6709a6110ad5b537bf3979bc0992a
> **Scope mode**: strict

Independent correctness review covers the quartet, shell/session/capability/menu/factory/barrel,
immutable specifications and implementation tests against the approved Admin UI design and full
coding standards. Independent security audit reports no findings: exact permissions, closed native
keys, fixed safe feedback, one non-replayed batch and local ownership preserve reviewed boundaries.

| Finding | Severity | Evidence | Ruling |
| --- | --- | --- | --- |
| RV-001 | MAJOR | `system-config-workspace.ts:36,231` budgets help at 52 cells. Legal refresh lifetime `31535999` requires 60 cells; an invalid draft requires 57. Mandatory startup guidance clips at the advertised fitting minimum. | User approved AR-23 with "proceed until done". Existing width/derived minimum and two rendered-cell regressions fixed; ONE scoped re-review explicitly resolves finding with no residual issue. |

Independent challenge confirms the measurements and major correctness classification. This is not
a demonstrated authentication vulnerability. No responsive framework, scroller or immutable-spec
weakening is proposed. Other reviewed lifecycle, batch, busy, dirty, reload and ownership behavior
matches the approved design.

Focused evidence: all 34 immutable UI cases pass after the user-approved AR-22 authoring corrections;
49 state/service and nine controller implementation cases pass; source compiler and focused lint
pass. Structure gate passes all 104 cases. Logs are `/tmp/porta-config-phase4-approved-green.log`,
`/tmp/porta-config-phase4-state-impl.log`, `/tmp/porta-config-phase4-controller-impl.log` and
`/tmp/porta-config-phase4-structure.log`.

Full CLI gate is not passing: 1,399 pass and 18 fail. Seventeen old exact capability expectations
omit the new config flags; independent challenge supports mechanical expected-shape enrollment,
preserving every exact equality and authorization assertion. The remaining compiled PTY SIGTERM
case returns 143 but misses terminal-restoration output. It remains independently blocking;
neither the width nor capability ruling authorizes waiving it or changing its assertion. Log:
`/tmp/porta-config-phase4-cli-verify.log`. Browser gate passes all 133 cases, with server and
database/Redis cleanup successful; log `/tmp/porta-config-phase4-ui.log`. No commit or push is made.

After the approved AR-23 corrections, focused selector passes 152 and CLI verify passes all 1,419
cases across 99 files, including lint/compiler/build. Logs: `/tmp/porta-config-phase4-ar23-focused.log`
and `/tmp/porta-config-phase4-ar23-cli-verify.log`. All exact capability equalities remain intact.

The passing rerun does not erase the original PTY failure. Independent read-only diagnosis proves
`application.pty.impl.test.ts:40` snapshots output on child `exit`, before stdio necessarily closes.
Existing signal cleanup restores before Porta's signal callback, and native runner awaits host stop.
Source alone does not prove which race caused this occurrence: initial enter-screen readiness also
precedes listener installation. Smallest first correction is complete-output collection on `close`,
keeping the original restoration assertion and failure evidence. That extra test path is AR-24;
no production cleanup change, readiness redesign or failure waiver is currently justified.

User approved AR-24 with "you may". The collector's sole change is `exit` to `close`; all original
assertions remain. Focused PTY six and fresh CLI 1,419/99 files pass with lint/compiler/build;
fresh structure 104 and browser 133 pass with cleanup successful. Logs:
`/tmp/porta-config-phase4-ar24-pty.log`, `/tmp/porta-config-phase4-final-cli-verify.log`,
`/tmp/porta-config-phase4-final-structure.log`, `/tmp/porta-config-phase4-final-ui.log`.
The confirmed capture defect is corrected, while attribution of the one historical failure
remains unproven. No production cleanup or upstream readiness change is made. Publication may
proceed after the opted-in incremental architecture update and deliberate staged-file inspection.
