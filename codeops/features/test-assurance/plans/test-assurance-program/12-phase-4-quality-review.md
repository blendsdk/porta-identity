# Phase 4 Quality Review: Attributed Server-Process Coverage

> **Status**: Remediation in progress
> **Phase baseline**: `f3bd7aa8d31ea4a9ae5b3bc38bfba2372b90270d`
> **Pre-review implementation roll-up**: `c58fe466`
> **Correction authority**: `--auto-design`; AR-53 records the delegated correction design

## Finding Disposition

No finding is waived or dismissed. Overlapping correctness and security findings are grouped by
root cause. Phase 4 remains open until every Major correction is verified and the single bounded
re-review is clean.

| Finding | Severity | Required correction | Status |
| ------- | -------- | ------------------- | ------ |
| P4-QA-01 | Major | Bind clean source, lock, and source-tree identities to immutable image labels and revalidate them before conversion | In progress |
| P4-QA-02 | Major | Authorize capture and termination only for the exact Porta container recorded by the durable lifecycle lease | In progress |
| P4-QA-03 | Major | Prevent a losing concurrent startup from invoking unscoped cleanup against another run | In progress |
| P4-QA-04 | Major | Run conversion under a managed deadline so signals and timeouts enter exact stack cleanup promptly | In progress |
| P4-QA-05 | Major | Emit observation evidence only after complete success and emit a distinct sanitized failure artifact otherwise | In progress |
| P4-QA-06 | Major | Prove dependency exclusions, defer unproven pathless scripts, and retain exact classification/conversion failures | In progress |
| P4-QA-07 | Major | Exercise the real graceful-flush boundary for nonzero, OOM, forced, and incomplete outcomes | In progress |
| P4-QA-08 | Minor | Remove stale bind-mount terminology after the named-volume redesign | In progress |

## Evidence

Verification evidence and the bounded re-review result will be recorded after remediation.
