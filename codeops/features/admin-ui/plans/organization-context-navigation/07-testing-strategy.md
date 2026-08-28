# Testing Strategy: Organization Context and Navigation

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Testing Overview

The test suite extends the existing CLI admin specifications, implementation diagnostics, real
JSVision frame-buffer tests, PTY coverage, and one packed playground journey. SDK and server code
remain untouched. Specification expectations are written before each implementation phase and
verified red before production code changes. (AR-4, AR-5, AR-9)

### Coverage Goals

| Code type                                                 |    Target |
| --------------------------------------------------------- | --------: |
| `organization-service.ts` and session/capability logic    | 90% lines |
| `state.ts` and application orchestration                  | 80% lines |
| `organization-dialogs.ts`, presentation, and command glue | 60% lines |

Existing higher per-file thresholds remain unchanged. `packages/cli/vitest.config.ts` adds the two
new files using the analogous service/presentation targets rather than introducing another coverage
tool. (AR-1)

### RD-01 Specification Supersession

The existing mixed application specifications are first split while green. Only these assertions
change when the new RD-02 specifications are written:

| Classification | Existing assertion                                                                                                       | RD-02 treatment                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Superseded     | `Application`/`Session` top-level menus                                                                                  | Replaced by labelled Menu/Organizations expectations (OC-01/OC-03) |
| Superseded     | Identity and email in the landing content                                                                                | Moved to Who am I (OC-02/OC-12)                                    |
| Superseded     | Organizations absent from the foundation screen                                                                          | Replaced by organization menu/landing expectations (OC-03/OC-12)   |
| Re-expressed   | Normalized server, authentication state, and insecure warning                                                            | Proven through landing and Who am I where applicable (OC-02/OC-12) |
| Retained       | Default-theme background, shortcuts, responsive Quit-only recovery, terminal safety, cancellation, signals, and teardown | Preserved unchanged                                                |

## 🚨 Specification Test Cases

> These cases are immutable behavioral oracles derived from RD-02 and the component specifications.
> Implementation must change when it disagrees with a case.

### Capabilities and Service Boundary

| #     | Input / Scenario                                                                                     | Expected Output / Behavior                                                                                                                    | Source                                      |
| ----- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| ST-01 | Valid permissions contain only `admin:org:read`                                                      | Read is enabled and Create is disabled                                                                                                        | RD-02 OC-04; 03-01 §Capabilities            |
| ST-02 | Valid permissions contain only `admin:org:create`                                                    | Create is enabled and Switch is disabled                                                                                                      | RD-02 OC-04; 03-01 §Capabilities            |
| ST-03 | Valid roles contain exact `porta-admin` while permissions are absent/non-array                       | Both organization capabilities are enabled                                                                                                    | RD-02 OC-04; 03-01 §Capabilities            |
| ST-04 | Roles are malformed while permissions are a valid read array                                         | Read remains enabled; malformed roles do not invalidate permissions                                                                           | RD-02 AC-6; 03-01 §Capabilities             |
| ST-05 | Relevant claim entry is non-string, over its established slug bound, or control-bearing              | The action derived from that entry remains disabled and raw content is not retained                                                           | RD-02 Validation; 03-01 §Capabilities       |
| ST-06 | `listAll()` returns three valid organizations in archived, active, suspended order                   | The service returns three four-field contexts in the same order                                                                               | RD-02 OC-06/OC-07; AR-2                     |
| ST-07 | Any returned organization row has invalid UUID, slug, name, status, server-bound length, or controls | The operation returns only `Invalid server response`; no partial list is published                                                            | RD-02 OC-06; 03-01 §Organization Validation |
| ST-08 | Create input has empty optional slug/locale                                                          | SDK receives name only; empty optionals are omitted                                                                                           | RD-02 OC-09; 03-01 §Operations              |
| ST-09 | SDK create returns a valid full Organization                                                         | Service returns only its id, name, slug, and status projection                                                                                | RD-02 OC-10; AR-7                           |
| ST-10 | SDK throws 400, 401, 403, 409, 429, 5xx, and an unclassified failure                                 | Results map respectively to validation, session-invalid, unauthorized, conflict, unavailable, unavailable, and unavailable without raw detail | 03-01 §Failure Mapping; AR-3                |

### Menus, Dialogs, and Landing View

| #     | Input / Scenario                                                                                | Expected Output / Behavior                                                                                                                                                     | Source                                                 |
| ----- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| ST-11 | UTF-8 glyph capability is usable / unusable                                                     | Global label is respectively `☰ Menu` / `Menu`                                                                                                                                | RD-02 OC-01; 03-02 §Global and Organization Menus      |
| ST-12 | Authenticated state at 80×24 activates Who am I by keyboard                                     | Real menu command opens the dialog with only normalized server, `Authenticated`, safe name/email fallbacks, and conditional TLS warning; OK/Escape closes it and returns focus | RD-02 OC-02/AC-1                                       |
| ST-13 | Identity text contains ASCII/C1 controls or exceeds its trust bound                             | Fixed fallback text renders; no control or raw tail reaches the frame                                                                                                          | RD-02 Validation/AC-9                                  |
| ST-14 | User lacks organization-read capability and has no selection                                    | Chooser opens with `Organization listing unavailable`, sends no list request, and Cancel/Reauthenticate work; Reauthenticate starts only after chooser ownership is released   | RD-02 OC-05/AC-2                                       |
| ST-15 | Read-capable chooser receives zero organizations                                                | It shows `No organizations available`, selects nothing, and keeps permitted Create reachable                                                                                   | RD-02 OC-06                                            |
| ST-16 | Read-capable chooser receives one or several organizations, including a valid long Unicode name | Rows remain in service order, show display-width-clipped `name (slug) [status]`, preserve valid Unicode, and select no row automatically                                       | RD-02 OC-05–OC-07; AR-2                                |
| ST-17 | Create/Switch capability is unavailable                                                         | Corresponding item remains visible, appends its fixed reason, and cannot activate                                                                                              | RD-02 OC-03/AC-6; 03-02 §Global and Organization Menus |
| ST-18 | Name/slug/locale lengths are at each accepted and rejected boundary                             | Accepted values may submit; rejected values keep the dialog open and dispatch nothing                                                                                          | RD-02 OC-09/AC-4                                       |
| ST-19 | Selected context exists at 80×24 and 48×12                                                      | Landing shows only bounded name, slug, textual status, and normalized server                                                                                                   | RD-02 OC-12/OC-13                                      |
| ST-20 | Terminal crosses below the recovery threshold with a modal open                                 | Modal ownership closes before resize-only redraw; Quit remains reachable and late results are ignored                                                                          | RD-02 OC-13/AC-9; AR-8                                 |

### Application Workflows

| #     | Input / Scenario                                                                                      | Expected Output / Behavior                                                                                                                                                   | Source                                                |
| ----- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| ST-21 | Login or stored verification succeeds with no selection                                               | Chooser opens after authentication releases modal ownership; cancellation leaves no selection                                                                                | RD-02 OC-05; 03-03 §Initial Authentication and Choice |
| ST-22 | User confirms any valid active/suspended/archived row                                                 | Only the in-memory organization context changes; issuer/server/profile binding remains unchanged, while transparent global-session refresh remains allowed                   | RD-02 OC-07/OC-08                                     |
| ST-23 | Switch load fails, response is invalid, or user cancels                                               | Previous selection is unchanged and only the fixed local category may render                                                                                                 | RD-02 OC-08; AR-3                                     |
| ST-24 | Valid Create succeeds                                                                                 | Exactly one logical SDK submission occurs and the returned projection becomes selected                                                                                       | RD-02 OC-10/AC-5                                      |
| ST-25 | Create receives a definite 401 then SDK refresh succeeds                                              | Existing SDK may replay once; a second UI activation is not emitted                                                                                                          | RD-02 AC-5; AR-8                                      |
| ST-26 | Create is activated repeatedly while pending                                                          | Only one organization service call dispatches                                                                                                                                | RD-02 OC-10/AC-5                                      |
| ST-27 | Create is cancelled after dispatch or returns unavailable/invalid response                            | Previous selection remains, late result is quarantined, and Create stays unavailable until a successful list reload                                                          | RD-02 State boundaries; AR-8                          |
| ST-28 | Reauthentication returns same UUID with changed safe name/status                                      | Selected projection refreshes atomically                                                                                                                                     | RD-02 OC-11/AC-7                                      |
| ST-29 | Reauthentication reconciliation proves absence/malformed match/403                                    | Selection clears and the organization-choice state opens                                                                                                                     | RD-02 OC-11/AC-7                                      |
| ST-30 | Reauthentication is cancelled/fails, or reconciliation returns transport/5xx/malformed unrelated data | Previously verified state/selection remains; reconciliation shows only the fixed local category                                                                              | RD-02 OC-11/AC-7                                      |
| ST-31 | Organization operation returns final 401 after SDK handling                                           | Organization modal closes, Create recovery clears for a definite rejection, and RD-01 session-invalid state is entered; a create-only user can create after reauthentication | RD-02 Authorization; 03-03 §Create Flow               |
| ST-32 | Quit/disposal occurs while organization work is pending                                               | Finalization runs once and no late result changes menus, identity, selection, or content                                                                                     | RD-02 AC-9; AR-8                                      |
| ST-35 | Production organization factory before and after verified authentication                              | Factory is not invoked before verified organization work and then binds the normalized selected server                                                                       | RD-02 OC-14; 03-03 §Production Wiring                 |

### Packed Playground and Scope

| #     | Input / Scenario                                              | Expected Output / Behavior                                                                                                                                                                                                                                                                                                                                                                   | Source                            |
| ----- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| ST-33 | Packed CLI authenticates against the running admin playground | Initial chooser is observed then cancelled; focus returns; Who am I proves the verified email; an organization is explicitly switched; a high-entropy organization is created and auto-selected; terminal restoration succeeds                                                                                                                                                               | RD-02 AC-10; AR-9                 |
| ST-34 | Packed journey completes or fails after create dispatch       | After proving the slug absent, an inner `finally` runs a packed Node cleanup child with the temporary credential home, selected issuer, and `NODE_USE_SYSTEM_CA=1`; it verifies nonce ownership, destroys only that slug through the installed packed SDK, verifies absence, preserves unrelated resources, and retains simultaneous journey/cleanup failures in an ordered `AggregateError` | 01-requirements Acceptance; AR-10 |

### Final Execution Evidence

| #     | Evidence                                                                          | Expected result                                                                     | Source                   |
| ----- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------ |
| EV-01 | Recorded phase/repository baseline, final diff, and structure tests are inspected | No server/SDK/dependency/workflow/matrix/search/pagination implementation was added | RD-02 Out of Scope; AR-4 |

## Test Categories

### Specification Tests

| Test file                                                    | ST cases                        | Component                                                 |
| ------------------------------------------------------------ | ------------------------------- | --------------------------------------------------------- |
| `packages/cli/tests/admin/session.spec.test.ts`              | ST-01–ST-05, ST-28–ST-31        | UserInfo/session behavior                                 |
| `packages/cli/tests/admin/organization-service.spec.test.ts` | ST-06–ST-10, ST-28–ST-30        | SDK validation and reconciliation                         |
| `packages/cli/tests/admin/organization-dialogs.spec.test.ts` | ST-12–ST-18                     | Dialog behavior                                           |
| `packages/cli/tests/admin/application.spec.test.ts`          | ST-11–ST-14, ST-17, ST-19–ST-32 | Menus and workflows                                       |
| `packages/cli/tests/admin/command.spec.test.ts`              | ST-35                           | Lazy authenticated SDK wiring and selected-server binding |
| `docker/admin-playground/tests/admin-cli.e2e.spec.test.mjs`  | ST-33–ST-34                     | Packed live journey                                       |

### Implementation Tests

| Test file                                                    | Description                                                             | Priority |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- | -------- |
| `packages/cli/tests/admin/organization-service.impl.test.ts` | Type guards, payload construction, typed-error branches, hostile detail | High     |
| `packages/cli/tests/admin/organization-dialogs.impl.test.ts` | JSVision signal/focus/button/list internals and narrow geometry         | High     |
| `packages/cli/tests/admin/application.impl.test.ts`          | Operation generation, recovery gate, command registration, disposal     | High     |
| `packages/cli/tests/admin/session.impl.test.ts`              | Capability extraction and credential non-persistence                    | High     |
| `packages/cli/tests/admin/session-wiring.impl.test.ts`       | Lazy organization-domain factory and reauth wiring                      | Medium   |
| `packages/cli/tests/admin/application.pty.impl.test.ts`      | Resize/redraw and terminal restoration regression                       | High     |

### Integration and End-to-End

| Scenario                   | Components                                           | Expected result                                           |
| -------------------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| Headless JSVision workflow | Session, service, application, dialogs, presentation | Complete state transitions through real widget/event loop |
| Packed playground journey  | Packed SDK/CLI, live Porta, PTY, browser login       | ST-33 and exact ST-34 cleanup                             |

## Test Data

- Valid UUID organizations covering active, suspended, and archived status.
- Malformed organization objects varying one required projection field at a time.
- UserInfo roles/permissions including exact, missing, non-array, bounded, and control-bearing cases.
- SDK typed errors with hostile body/message content that must not render; duplicate selected UUIDs;
  and a thrown pre-return `listAll()` failure.
- High-entropy packed organization slug/name nonce, proved absent before dispatch and retained only
  until exact cleanup.

Mocks are limited to the injected SDK organization domain, authentication boundary, and time/PTY
edges. JSVision application tests use real widgets and frame buffers.

## Verification Checklist

- [ ] Every ST case is implemented in a `*.spec.test.*` file before its production phase.
- [ ] Existing mixed RD-01 application specifications are split while green; only assertions directly
      superseded by RD-02 are replaced, and all other theme/security/lifecycle behavior remains.
- [ ] Each new spec suite is observed failing before implementation and passing afterward.
- [ ] Implementation tests cover internal branches without changing specification expectations.
- [ ] `yarn workspace @portaidentity/cli verify` passes on Node 24 LTS.
- [ ] `yarn test:structure` passes on Node 24 LTS.
- [ ] The existing packed playground journey passes and proves exact test-organization cleanup,
      including primary-only, cleanup-only, and simultaneous-failure evidence.
- [ ] EV-01 is recorded against the execution baseline rather than inferred by the packed runtime test.
- [ ] SDK verification/compatibility remains unnecessary because SDK source/contracts are unchanged.
- [ ] Full Porta/server verification remains unnecessary because server source is unchanged. (AR-5)
