# Requirements: CLI (Admin CLI Tooling)

> **Document**: 01-requirements.md
> **Parent**: [Index](00-index.md)
> **Source**: [RD-09](../../requirements/RD-09-cli.md)

## Feature Overview

A yargs-based CLI tool (`porta`) that provides administrative commands for all domain entities. The CLI is the primary management interface for Porta v5 until a web UI is built. It calls the existing service layer directly — no HTTP API — and supports both human-readable table output and machine-parseable JSON output.

## Functional Requirements

### Must Have

- [x] yargs-based CLI with hierarchical command structure (from RD-09)
- [x] CLI entry point: `porta <command> <subcommand> [options]`
- [x] Commands for all CRUD operations across all domain entities
- [x] Database migration commands (up, down, status, create)
- [x] Signing key management commands (generate, rotate, list, cleanup)
- [x] System configuration commands (get, set, list, reset)
- [x] Formatted output: table format (default) and JSON format (`--json`)
- [x] Confirmation prompts for destructive operations (`--force` to skip)
- [x] Error handling with clear, actionable error messages
- [x] Environment-aware (reads `.env` or accepts `--database-url`, `--redis-url` flags)
- [x] Exit codes: 0 for success, 1 for error

### Should Have

- [x] Dry-run mode for destructive operations (`--dry-run`)
- [x] Verbose output mode (`--verbose`)
- [x] Seed data command for development
- [x] Health check command (test DB + Redis connectivity)
- [x] Audit log viewer (recent events, filterable)

### Deferred (Depends on Unimplemented RD)

- [ ] `user 2fa status/disable/reset` — Requires RD-12 (2FA), not yet implemented. Stub commands that return "2FA not yet implemented" message.
- [ ] `org update --2fa-policy` — Requires RD-12 (2FA). The `--2fa-policy` flag will be registered but will return a "not yet implemented" message until RD-12 is complete.

### Won't Have (Out of Scope)

- Web-based admin UI (separate project, later)
- Real-time log streaming
- Background job management
- Backup/restore commands (infrastructure concern)
- Interactive mode for complex operations (inquirer-based prompts — too complex for initial CLI, can be added later)
- Autocompletion script generation (nice-to-have, can add later)

## Technical Requirements

### Command Structure

Ten top-level commands organized hierarchically:

| Command   | Subcommands | Description                    |
| --------- | ----------- | ------------------------------ |
| `org`     | 8           | Organization management        |
| `app`     | 5 + 4 nested groups (module, role, permission, claim) | Application management |
| `client`  | 5 + 1 nested group (secret) | Client management       |
| `user`    | 12 + 3 nested groups (roles, claims, 2fa) | User management |
| `keys`    | 4           | Signing key management         |
| `config`  | 4           | System configuration           |
| `migrate` | 4           | Database migrations            |
| `seed`    | 1           | Seed data (dev only)           |
| `health`  | 1           | Health check                   |
| `audit`   | 1           | Audit log viewer               |

### Global Options

| Flag             | Type    | Default | Description                          |
| ---------------- | ------- | ------- | ------------------------------------ |
| `--json`         | boolean | false   | Output in JSON format                |
| `--verbose`      | boolean | false   | Verbose output                       |
| `--force`        | boolean | false   | Skip confirmation prompts            |
| `--dry-run`      | boolean | false   | Preview destructive operations       |
| `--database-url` | string  | env     | PostgreSQL connection URL override   |
| `--redis-url`    | string  | env     | Redis connection URL override        |

### Architecture

- **Direct service invocation** — CLI imports and calls service functions directly, no HTTP
- **Bootstrap** — CLI initializes DB + Redis connections before running any command
- **Graceful cleanup** — CLI disconnects DB + Redis after command completes
- **Functional style** — Matches project's existing pattern of standalone exported functions

### Output Formats

- **Table** (default) — Human-readable formatted table via `cli-table3`
- **JSON** (`--json`) — Machine-parseable JSON output to stdout

### Error Handling

- Domain errors (NotFound, Validation) → user-friendly message + exit 1
- Infrastructure errors (DB, Redis) → technical message + exit 1
- Unknown errors → generic message, stack trace in verbose mode

## Scope Decisions

| Decision            | Options Considered              | Chosen                    | Rationale                                        |
| ------------------- | ------------------------------- | ------------------------- | ------------------------------------------------ |
| CLI framework       | commander, yargs, oclif         | yargs                     | User requirement, flexible, well-maintained      |
| Output format       | Table only, JSON only, both     | Both (table + `--json`)   | Human-readable default, scriptable with JSON     |
| Service access      | HTTP API calls, direct service  | Direct service invocation | Faster, no HTTP overhead, same codebase          |
| Prompts             | None, readline, inquirer        | readline for confirmations | Simple y/N prompts, `--force` for automation    |
| Table rendering     | console.table, cli-table3, columnify | cli-table3            | Lightweight, customizable widths, clean output   |
| Color output        | No color, chalk, picocolors     | chalk                     | Standard, widely used, rich API                  |
| File splitting      | Single file per command group, split by subgroup | Split nested subgroups | app.ts and user.ts would exceed 500 lines with all nested commands |
| 2FA commands        | Implement fully, stub, omit     | Stub with message         | RD-12 not yet implemented, but CLI structure should be ready |

## Acceptance Criteria

1. [ ] `porta --help` shows all commands and options
2. [ ] All org commands work (create, list, show, update, suspend, activate, archive, branding)
3. [ ] All app commands work (create, list, show, update, archive)
4. [ ] All module commands work (create, list, update, deactivate)
5. [ ] All client commands work (create, list, show, update, revoke)
6. [ ] Client secret generation shows plaintext once with warning
7. [ ] All user commands work (create, invite, list, show, update, status changes)
8. [ ] `porta user create` sends invitation email by default
9. [ ] `porta user create --no-notify` skips invitation email
10. [ ] `porta user create --passwordless` sends welcome email instead of invite
11. [ ] `porta user invite <id>` re-sends invitation (new token, old invalidated)
12. [ ] User role assignment and removal works
13. [ ] User custom claim set/get/delete works
14. [ ] All role/permission commands work
15. [ ] Key management commands work (list, generate, rotate, cleanup)
16. [ ] Config commands work (list, get, set, reset)
17. [ ] Migration commands work (up, down, status, create)
18. [ ] Health check tests DB and Redis connectivity
19. [ ] `--json` flag produces valid JSON output for all commands
20. [ ] `--force` skips confirmation prompts
21. [ ] Exit code 0 on success, 1 on error
22. [ ] Clear error messages for invalid input
23. [ ] CLI works in development (`tsx`) and production (`node dist/`)
24. [ ] 2FA commands return "not yet implemented" stub message
25. [ ] All unit tests pass, minimum 80% coverage on CLI code
