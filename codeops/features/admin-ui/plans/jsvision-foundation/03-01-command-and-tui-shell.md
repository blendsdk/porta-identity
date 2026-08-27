# Command and TUI Shell: JSVision Admin Foundation

> **Document**: 03-01-command-and-tui-shell.md
> **Parent**: [Index](00-index.md)

## Overview

This component owns the `porta admin` command boundary, JSVision application lifetime, presentation state, keyboard commands, and responsive rendering. It consumes UI-neutral session capabilities from [Authentication and Credentials](03-02-authentication-and-credentials.md); it never owns tokens, OIDC validation, HTTP policy, or credential writes. (AR-19–AR-22)

## Architecture

### Proposed Source Boundaries

| Path                           | Responsibility                                                                          |                     Imports JSVision? |
| ------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------: |
| `src/commands/admin.ts`        | Yargs command declaration, global-mode preflight, dependency construction, exit mapping | Only through admin public entry point |
| `src/admin/application.ts`     | Create/run/finalize the native or injected host; command routing                        |                                   Yes |
| `src/admin/state.ts`           | Discriminated immutable application/session/view state and transitions                  |                                    No |
| `src/admin/session-service.ts` | UI-neutral facade over server selection, login, verification, and reauthentication      |                                    No |
| `src/admin/presentation.ts`    | JSVision menus, dialogs, summary, shortcuts, responsive/resize views                    |                                   Yes |
| `src/admin/index.ts`           | Narrow documented public boundary for the command                                       |               No implementation logic |

The command must remain a thin adapter. The application receives injected session capabilities and host factories so tests can construct the real widget tree/headless renderer without calling the native terminal host. (AR-19, AR-22)

## Command Contract

```ts
/** Registers the interactive Porta administration command. */
export const adminCommand: CommandModule<GlobalArguments, AdminArguments>;

/** Starts one administration application and returns its process exit status. */
export async function runAdminApplication(options: AdminApplicationOptions): Promise<AdminExitCode>;
```

`AdminExitCode` has explicit success and usage/preflight outcomes; operational failures are classified by the session/error model rather than leaking arbitrary exception messages. The command checks stdin and stdout TTY capability before native application construction, rejects global JSON/force modes, and maps incompatible usage to exit status 2. (AR-19, AR-26)

## State Model

Use discriminated unions rather than overlapping booleans:

```ts
export type AdminConnectionState =
  | { readonly kind: 'selecting-server' }
  | { readonly kind: 'unauthenticated'; readonly server: URL; readonly reason?: SessionFailureKind }
  | { readonly kind: 'authenticating'; readonly server: URL; readonly canCancel: true }
  | { readonly kind: 'verifying'; readonly server: URL; readonly canCancel: true }
  | { readonly kind: 'authenticated'; readonly server: URL; readonly identity: VerifiedIdentity }
  | { readonly kind: 'unauthorized'; readonly server: URL; readonly identity: VerifiedIdentity }
  | { readonly kind: 'fatal'; readonly failure: PublicFailure };
```

Only `authenticated` and `unauthorized` carry a verified identity. The shell never derives identity from raw token claims. State transitions are serialized on the application event loop. The application owns at most one current-operation `AbortController`, creates a fresh controller for every login, Retry, or Reauthenticate attempt, and aborts only the current controller on Cancel, Quit, or finalization before host teardown; late completions are ignored. (AR-7, AR-19, AR-27, AR-33)

## Server-Origin Dialog

The service first evaluates flag, environment, and credential sources. If all are absent, presentation requests an origin. Validation accepts only an absolute `https:` URL with hostname and optional port whose normalized URL has `/` as pathname and empty username, password, search, and hash. Explicit `--insecure` affects certificate validation only and cannot admit HTTP. Invalid input remains in the dialog with a bounded local validation message. (AR-18, AR-26)

## Application Chrome and Commands

The normal shell contains:

- an Application menu exposing Quit;
- a Session menu exposing Reauthenticate;
- a central summary of normalized server origin, verified identity display fields, and current connection state;
- visible keyboard shortcuts for required actions;
- an authentication dialog exposing Authenticate, Retry after a classified failure, and Quit.

No placeholder navigation, disabled future-module menu, synthetic metrics, or administration data is added. (AR-2, AR-20)

## Responsive and Accessible Rendering

At 80×24 the full menu, summary, and shortcut help are visible. At 48×12 the same required actions and state remain accessible in a compact arrangement. Below the recoverable geometry, the application renders only a concise resize instruction plus a keyboard-reachable Quit command. Controls remain keyboard-complete; text/ASCII labels carry meaning independently of colour, icons, mouse support, or Unicode width behavior. (AR-21)

## Terminal Lifecycle

The native JSVision application host is the only owner of raw mode, terminal buffers, input decoding, and restoration. Async login/session work receives the application `AbortSignal` and cannot install a competing readline listener. Normal return, usage rejection after host construction, cancellation, exception, explicit quit, and catchable termination signals converge on one idempotent finalizer. On supported POSIX hosts, temporary handlers for `SIGINT`, `SIGTERM`, and `SIGHUP` abort work, restore the terminal, remove themselves, and exit with 130, 143, and 129 respectively. `SIGKILL`, `SIGSTOP`, VM-fatal failure, and power loss are outside the process-level guarantee. Fatal messages are emitted to stderr after finalization. Headless tests instantiate the actual application and render/event pipeline without invoking the native `run` path. (AR-6, AR-19, AR-26, AR-33, AR-45)

## Error Handling

| Error case                       | Handling strategy                                                | AR ref             |
| -------------------------------- | ---------------------------------------------------------------- | ------------------ |
| stdin or stdout is not a TTY     | Do not construct native host; concise stderr; exit 2             | AR-19              |
| `--json` or `--force` supplied   | Same usage rejection; no partial screen output                   | AR-19              |
| Explicit `--insecure`            | Continue only with HTTPS and keep a persistent visible warning   | AR-18, AR-19       |
| Invalid/missing server origin    | Keep validated prompt active; no network or credential use       | AR-18, AR-26       |
| Authentication cancelled         | Return to unauthenticated state with Authenticate/Quit available | AR-6, AR-19        |
| Network/protocol/storage failure | Render one allowlisted category with Retry/Quit as applicable    | AR-6, AR-17, AR-26 |
| Terminal becomes too small       | Render bounded resize state with reachable Quit                  | AR-21              |
| Unexpected fatal exception       | Finalize terminal, then emit sanitized fatal stderr              | AR-19, AR-26       |

## Testing Requirements

- Command-surface specifications for `admin`, removed `gui`, preflight flags, exit status, and no host construction on rejection.
- Headless real-application specifications at 80×24, 48×12, and below recoverable geometry.
- Keyboard routing for Quit, Reauthenticate, authentication dialog actions, focus, cancellation, and late async completion.
- PTY-level integration smoke proving native launch/quit everywhere and, on supported POSIX hosts, restoration for `SIGINT`, `SIGTERM`, and `SIGHUP`, including handler removal and no double finalization.
- Output/privacy tests proving non-colour/ASCII semantics and sanitized failures.
