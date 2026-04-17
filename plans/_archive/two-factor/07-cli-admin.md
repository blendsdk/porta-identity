# CLI & Admin Management

> **Document**: 07-cli-admin.md
> **Parent**: [Index](00-index.md)

## Overview

Replace existing CLI stubs in `src/cli/commands/user.ts` with real 2FA admin commands. Add org 2FA policy management to `src/cli/commands/org.ts`.

## User 2FA Commands

### `porta user 2fa status --user-id <id>`
Shows the 2FA state for a user: enabled/disabled, method, TOTP configured, recovery codes remaining.

### `porta user 2fa disable --user-id <id> [--force]`
Disables 2FA for a user: removes TOTP config, deletes OTP codes and recovery codes, sets `two_factor_enabled=false`. Requires `--force` or confirmation prompt.

### `porta user 2fa reset --user-id <id> [--force]`
Regenerates recovery codes for a user. Deletes old codes, generates new 10, displays them. Requires confirmation.

## Organization Policy Commands

### `porta org update --id <id> --two-factor-policy <policy>`
Update the org's `two_factor_policy`. Already handled by existing `org update` command — just needs to pass the new field through.

## Implementation Pattern

Follow existing CLI patterns:
- Use `withErrorHandling()` + `withBootstrap()` wrapper
- Use `printTable()` / `printJson()` for output
- Use `confirm()` for destructive operations
- Validate args with yargs `.positional()` / `.option()`
