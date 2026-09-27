# Phase Reviews: T-03

> **CodeOps Artifact Schema**: 1
> **Scope**: strict
> **Last Updated**: 2026-09-28

## Task review — correctness + release-integrity security (whole-task diff)

**Reviewed diff:** `/tmp/opencode/t03-review.diff` (baseline tree
`9fbaaaccd7446735dffa77d67bb34bcda93911ea`; commits `ca6841d7`, `74570ed1`, `5a95cf73`)
**Reviewers:** correctness-reviewer (`RV-*`); security-auditor (`SA-*`, custom release
supply-chain focus — no standard security profile matches release provenance)
**Verify evidence:** `yarn test:structure` 138 passed; workflow YAML parses; extracted verify
script passes `bash -n`; live provenance identity returns
`https://github.com/blendsdk/porta-identity|<sha512->|<pkg name>` for server/sdk/cli and empty for
a missing package; the script survives under `bash -e -o pipefail` when the lookup fails.

| ID     | Severity | Area                | Problem                                                                                                                                                                    | Resolution                                                                                                                                                               | Decision   |
| ------ | -------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| RV-001 | 🟡 MINOR | test precision      | The new pins were independent substrings; flipping the repository comparison to `!=` kept all pins green, and the same-run integrity equality had no oracle.               | Exact-expression pins for both comparisons plus digest, subject-name, and timeout pins.                                                                                  | ✅ Applied |
| RV-002 | 🔵       | docs intent         | The comment implied acceptance only via provenance, while same-run integrity equality also accepts (safely).                                                               | Comment reworded to "same-run integrity equality or … provenance-bound".                                                                                                 | ✅ Applied |
| RV-003 | 🔵       | robustness          | The attestation `curl` had no timeouts, so a stalled connection could block past the retry budget.                                                                         | `--connect-timeout 5 --max-time 20`.                                                                                                                                     | ✅ Applied |
| RV-004 | 🔵       | scope               | An unrelated prettier reformat of the T-01 review artifact was in the diff.                                                                                                | Reverted.                                                                                                                                                                | ✅ Applied |
| SA-001 | 🟡 MINOR | supply chain        | The already-published path proved only "some this-repo SLSA attestation exists"; it did not bind the attestation subject tarball digest to the published `dist.integrity`. | The helper now requires the subject sha512 (hex→base64) to equal `published_integrity` and the subject name to match the package version, in addition to the repository. | ✅ Applied |
| SA-002 | 🔵       | availability        | Same as RV-003.                                                                                                                                                            | Applied with RV-003.                                                                                                                                                     | ✅ Applied |
| SA-003 | 🔵       | operational clarity | A comment over-promised partial-publish recovery; a partial state still republishes and aborts on existing versions (fail-closed).                                         | Comment corrected; partial recovery remains out of scope.                                                                                                                | ✅ Applied |

### Security verdicts (recorded)

- The repository binding is real under npm trusted publishing: provenance is registry-generated from
  validated OIDC identity and `GITHUB_REPOSITORY` is a protected default variable.
- Fail-closed behavior is verified: missing version, missing/malformed SLSA statement, API failure,
  or non-`https` repository all leave the package unaccepted and the loop retries to failure.
- The publishing run retains its full same-run integrity + provenance guarantee; the alternative
  path activates only when this run published nothing.
- External precondition for the maintainer: the npm package settings must pin trusted publishing to
  `.github/workflows/release.yml` and disallow token publishing. Not a code change.

**No critical or major findings. T-03 closes reviewed after the applied hardening.**
