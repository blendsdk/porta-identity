# Repeatable Codex Security scans

Run these commands from the repository root. The wrapper requires Node.js 22.22.2+
on Linux, Git, Python 3.10+, an installed `cs` CLI (tested with 0.8.3), and Codex
Security access with a native ChatGPT sign-in. It always selects `gpt-6.1-sol`.
It never substitutes another model or disables the scanner's sandbox.

Progress is visible throughout: wrapper stage messages, source-copy counts every
250 files, and the native Codex Security live dashboard in an interactive terminal.
Scanner output is passed through directly, not buffered until completion. When
output is redirected or no terminal is available, `cs` uses its plain-text
progress output instead. The wrapper does not force `--headless` or claim a scan
percentage that the scanner itself has not reported.

```bash
# Check local inputs without inference charges or baseline changes.
node scripts/security-scan.js --plan-only

# Full scan initially; committed changes since the last completed scan afterward.
node scripts/security-scan.js

# Force a fresh whole-source scan, even when HEAD has not changed.
node scripts/security-scan.js full

# Require a compatible baseline rather than falling back to a full scan.
node scripts/security-scan.js diff

# Show the last completed revision and results location without calling cs.
node scripts/security-scan.js --status
```

Sign in separately with `cs login` if necessary. A preflight does **not** verify
authentication, model availability, or that the sandbox can start. Porta,
PostgreSQL, Redis, and MailHog do not need to be running: this is a source review,
not a live penetration test. A full scan means Standard mode over the whole
eligible source tree, not Codex Security's optional Deep mode.

## Choosing full or incremental scans

The default `auto` mode runs a full scan if no completed baseline exists, then
uses `cs --diff` against the latest completed revision. Deleted files are included
in that diff. With no new commits, it skips inference. It automatically starts a
new full scan after the wrapper's policy/code, model, or scanner version changes,
or when the old revision is unavailable or not an ancestor of HEAD. Explicit
`diff` mode instead refuses those cases. `--force-full` is an alias for `full`.

Use another full scan for a release or significant authentication, authorization,
architecture, or dependency change. Incremental review is useful between full
scans, but does not establish that unchanged code is safe, resolve old findings,
or provide the same coverage as a fresh full review. Results can vary between
scans. There is no automatic calendar-based schedule.

## Source and credential boundaries

- Only committed regular source files are copied. Commit tracked changes before
  scanning. Untracked files are not enumerated or scanned; there is deliberately
  no `--allow-dirty` option or uncommitted baseline.
- The wrapper excludes environment files, known credential stores, key and
  certificate files, symlinks, submodules, unknown hidden files, and the local
  invitation SQL file. GitHub workflow/action sources are the hidden-directory
  exception. These exclusions are limitations, not evidence of safety.
- Each scan receives a temporary, sanitized Git repository containing just the
  selected current tree and, for a diff, its sanitized baseline. No original
  history, repository configuration, or operator filesystem links are copied.
  Native findings refer to synthetic revisions: `provenance.json` maps them to
  the original commit IDs and blob identities.
- The scanner receives a minimal environment, native ChatGPT authentication,
  report-only instructions, and `approval_policy="never"`. No API/cloud tokens
  from unrelated environment variables are forwarded. Its native authentication
  remains the scanner's responsibility; the wrapper never reads credentials.
- Snapshot exclusion limits the files supplied to the scan. It is **not** an
  additional operating-system filesystem sandbox. Codex's own sandbox and host
  security policy must still work. The wrapper does not change either.
- No dependencies, services, patches, commits, GitHub issues, or releases are
  created by a scan. Findings must be reviewed before publication or remediation.

## Results and baseline state

The default private state is
`~/.local/state/porta-codex-security/<repository-path-hash>/`. Each checkout path
has its own baseline. To choose a different private directory, pass the **same**
`--state-dir` on subsequent invocations:

```bash
node scripts/security-scan.js --state-dir "$HOME/porta-security-results"
```

The directory must be outside a Git worktree, have private ancestry, and be owned
by the operator with mode `0700`. Shared ancestors without a sticky bit and
symlinks are rejected; existing permissions are never changed. Consequently
group-writable shared temporary roots such as `/tmp/opencode` may be unsuitable.

Each run preserves its report, exported `findings.json`, source provenance,
instructions, and `outcome.json`. Scanner history is stored in `scanner-state/`.
These artifacts can contain source excerpts and vulnerability details. Keep
them private and retain them until findings are triaged. Only temporary source
copies, indexes, runtime scratch, and the wrapper lock are removed automatically.

The baseline advances only after scanning completes, the native exporter
validates the completed result, and a nonempty report and findings document are
present. Findings do **not** prevent baseline advancement: completion is not a
clean-security claim. Failures, cancellations, invalid results, and preflight-only
runs leave the previous baseline unchanged. The wrapper exits `0` for a completed
run, preflight, status, or unchanged revision; operational failures exit `2`.

A lock prevents simultaneous wrapper runs against the same state. After a hard
kill or power loss, it can remain at `<state-dir>/lock`. Confirm that no scan is
running before manually removing that **empty** directory with `rmdir`; do not
remove scanner state or results to clear a lock.

The previous standalone command's results do not automatically establish a wrapper
baseline. Keep them as separate evidence and let the first wrapper run establish
its own baseline. The wrapper never claims that a scan elsewhere covered its
current sanitized source policy.

## Sandbox failures

An error such as `bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`
means the scan did not start. A separate terminal does not necessarily avoid a
host AppArmor restriction. Follow the supported Codex/Bubblewrap setup with your
administrator; do not disable AppArmor globally, use elevated scanning, or bypass
the sandbox. Failed attempts do not become successful baselines.

## Local verification

```bash
node --test repo-tests/monorepo/security-scan*.test.mjs
```

These tests use real disposable Git repositories and a fake **external scanner**.
They make no inference calls, require no services, and do not claim that the
real sandbox, authentication, or model access works on the current machine.
