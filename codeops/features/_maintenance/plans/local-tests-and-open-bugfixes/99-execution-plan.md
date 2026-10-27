# Task T-06: Narrow local tests and resolve five open bugs

> **Type**: Task (maintenance closeout) · **Feature**: _maintenance
> **Implements**: _maintenance/T-06
> **CodeOps Artifact Schema**: 1
> **Status**: Done — merged into `develop`
> **Last Updated**: 2026-10-27

## Objective

Use affected tests and relevant categories during local development, retain full CI verification,
and close the five confirmed bug reports. Do not promote `main` or publish a release.

This is a retrospective delivery record. It records merged work and observed CI, not a claim that
this repository-local plan, a preflight, or an independent review existed before implementation.

## Delivered work

- [x] **T-06.1** Add local changed-test and category commands, unit-only watch, and the narrow-local-testing
      prime directive in `AGENTS.md` — [PR #203](https://github.com/blendsdk/porta-identity/pull/203).
- [x] **T-06.2** Protect canonical `porta-admin` application and module mutations while preserving reads —
      [issue #166](https://github.com/blendsdk/porta-identity/issues/166),
      [PR #204](https://github.com/blendsdk/porta-identity/pull/204).
- [x] **T-06.3** Render the configured invitation lifetime in send and preview templates —
      [issue #178](https://github.com/blendsdk/porta-identity/issues/178),
      [PR #206](https://github.com/blendsdk/porta-identity/pull/206).
- [x] **T-06.4** Expose invitation email delivery outcomes across server, SDK, CLI, and Admin UI —
      [issue #185](https://github.com/blendsdk/porta-identity/issues/185),
      [PR #206](https://github.com/blendsdk/porta-identity/pull/206).
- [x] **T-06.5** Accept SDK cursor envelopes without `total` and preserve navigation cursors —
      [issue #167](https://github.com/blendsdk/porta-identity/issues/167),
      [PR #205](https://github.com/blendsdk/porta-identity/pull/205).
- [x] **T-06.6** Restore application/client history, align SDK/CLI envelopes, and add migration 035 indexes —
      [issue #163](https://github.com/blendsdk/porta-identity/issues/163),
      [PR #202](https://github.com/blendsdk/porta-identity/pull/202).

## Verification and delivery

The integrated `develop` revision `5119ae749a439894e92075d9c44d2d0b9c53a158` passed all six
[Build and Test jobs](https://github.com/blendsdk/porta-identity/actions/runs/40491372981):
Verify Monorepo, UI Tests, OIDC Harness, Public Documentation, Production Docker Build, and
Production Dependency Audit. Local work used relevant test categories; the test-infrastructure
change also received full local verification under its explicit exception.

All five issues were closed as completed on 2026-10-27 with their implementing PR and integrated
CI evidence linked. The five remote delivery branches were deleted. `main` and releases were not
changed. This record does not clear unrelated roadmap blockers or certify assurance profiles that
were not run.
