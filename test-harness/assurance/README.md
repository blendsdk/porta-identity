# Assurance commands and evidence

The assurance tooling belongs to the repository root dependency graph. Playwright continues to
own external browser journeys, while Node's test runner and `tsx` own internal assurance tests.
Generated output belongs below the ignored
`test-harness/.assurance-results/<run-id>/` directory and must be sanitized before it is written.

## Root command contract

Every alias routes through one allowlisted TypeScript dispatcher. Until a command's owning phase
installs its handler, a normal invocation fails closed with exit `30` (`setup-failure`). Use
`--help` to inspect a registered alias without starting services or creating artifacts.
Running `assurance:test` without a selector executes the complete registered governance suite.
`assurance:validate` prints its generated run UUID, which can be passed unchanged to
`assurance:report --run <run-uuid>`.

| Alias                 | Selector                                                                                               |                                                    Timeout | Artifact subdirectory               |
| --------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------: | ----------------------------------- |
| `assurance:test`      | `--select <registered-suite\|ST-ID\|internal-test-path>`                                               |                                                      120 s | `test/`                             |
| `assurance:red`       | `--case <ST-ID> --signature <signature-id>`                                                            |                                                      120 s | `red/`                              |
| `assurance:baseline`  | `--case <ST-ID>`                                                                                       |                                                      120 s | `baseline/`                         |
| `assurance:validate`  | none                                                                                                   |                                                      120 s | `validation/`                       |
| `assurance:harness`   | `--project <spa\|bff\|protocol\|security\|compatibility> --profile <operational\|production-security>` |                                                    1,800 s | `harness/<project>/<profile>/`      |
| `assurance:coverage`  | `--project <project-enum> --profile <profile-enum> --seed <registered-seed>`                           |                                                    2,400 s | `coverage/<project>/<profile>/`     |
| `assurance:fault`     | `--fault <fault-id> --claim <claim-id> --sentinel <sentinel-id>`                                       |                                                    3,600 s | `fault/<fault>/<claim>/<sentinel>/` |
| `assurance:compat`    | `--select <ST-69\|ST-70\|ST-71\|ST-72\|ST-73\|compatibility>`                                          |                                                    1,800 s | `compat/<selector>/`                |
| `assurance:report`    | `--run <run-uuid>`                                                                                     |                                                      120 s | `summary/`                          |
| `assurance:stability` | `--command <test\|harness\|coverage\|fault\|compat> --seed-set <registered-set>`                       | per attempt: child + 300 s; campaign: at most 125 attempts | `stability/<command>/<seed-set>/`   |
| `assurance:all`       | none                                                                                                   |                                                    7,200 s | `all/`                              |

The machine-readable source in `commands.ts` also records each command's prerequisites, signal
handling, cleanup/recovery behavior, aggregate composition, and the stable exit taxonomy. When
outcomes overlap, cleanup failure wins, followed by signal, timeout, fault invalidity, incomplete
coverage, setup, product, and test failure.

## Stable exits

| Exit | Class                 |
| ---: | --------------------- |
|    0 | `success`             |
|   20 | `product-failure`     |
|   21 | `test-failure`        |
|   30 | `setup-failure`       |
|   40 | `coverage-incomplete` |
|   50 | `fault-invalid`       |
|   60 | `cleanup-failure`     |
|   70 | `timeout`             |
|  130 | `interrupted-sigint`  |
|  143 | `interrupted-sigterm` |

Exit `50` is valid only after a clean baseline and a validated disposable fault patch. A baseline
build, startup, health, fixture, or dependency failure is exit `30`. Commands that own resources
must either clean them after success, failure, timeout, SIGINT, and SIGTERM or print their exact
owned identifiers and a bounded recovery command.
