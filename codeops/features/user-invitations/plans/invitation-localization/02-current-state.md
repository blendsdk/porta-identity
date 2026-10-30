# Current State: Invitation Localization

> **Parent**: [Index](00-index.md)
> **Observed baseline**: `develop` at `6c2c6aa0`, 2026-10-27; clean before planning
> **Preflight rechecked**: `cc57de14e5f4a7a1f68538191bdb1484da006ac5` (v1.14.2), 2026-10-28
> **CodeOps Artifact Schema**: 1

## Existing Implementation

Paths are repository-relative. These are observed facts, not prospective specification copies.

| Evidence                                                                                          | Current behavior                                                                                                 | Governing change document                                                   |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `packages/server/src/users/invite-service.ts:318–325,362–371`                                     | Stores explicit locale or null and passes input/organization locale to email after commit.                       | [Email](03-02-email.md)                                                     |
| `packages/server/src/auth/token-repository.ts:213–227`                                            | Already maps the invitation's stored locale.                                                                     | [Acceptance](03-03-acceptance.md)                                           |
| `packages/server/src/users/invitation-service.ts:81`                                              | Copies the invitation locale into the accepted account.                                                          | [Locales](03-01-locales.md)                                                 |
| `packages/server/src/auth/i18n.ts:46–58,76–98`                                                    | Loads eleven namespaces, preloading the catalog allowlist. English contains 146 string leaves before new copy.   | [Locales](03-01-locales.md)                                                 |
| `packages/server/src/auth/i18n.ts:180–245`                                                        | Selects OIDC/browser/organization/global/English; no invitation fallback slot.                                   | [Locales](03-01-locales.md)                                                 |
| `packages/server/src/auth/i18n.ts:257–268,289–318`                                                | Browser quality parsing is permissive; tenant overrides start without being awaited.                             | [Locales](03-01-locales.md)                                                 |
| `packages/server/src/auth/email-service.ts:285–336,411–420`                                       | Lifetime units and subjects are English; send and preview already share context construction.                    | [Email](03-02-email.md)                                                     |
| `packages/server/src/auth/email-renderer.ts:96–135`                                               | Independently selects HTML/text overrides and renders a plain context.                                           | [Email](03-02-email.md)                                                     |
| `packages/server/templates/default/emails/invitation.hbs:19–34` and `invitation.txt.hbs:1–16`     | Invitation text is English. Plaintext double braces HTML-escape ordinary text values.                            | [Email](03-02-email.md)                                                     |
| `packages/server/src/routes/invitation.ts:176–190,247–316`                                        | Ignores stored locale. GET checks email conflict; POST reaches the acceptance service after password validation. | [Acceptance](03-03-acceptance.md)                                           |
| `packages/server/src/routes/invitation.ts:287,347`                                                | Uses two invitation keys absent from the English bundle.                                                         | [Acceptance](03-03-acceptance.md)                                           |
| `packages/server/src/users/password.ts:61–76`                                                     | Returns English length errors without a stable failure reason.                                                   | [Acceptance](03-03-acceptance.md)                                           |
| `packages/server/src/auth/template-engine.ts:305,318–337`                                         | Defaults document titles from filenames; already has a safe per-render page translator.                          | [Acceptance](03-03-acceptance.md)                                           |
| `packages/server/src/lib/system-config-catalog.ts:4`; unit catalog/API specifications             | The public locale contract is explicitly English-only.                                                           | [AR #12](00-ambiguity-register.md#bounded-specification-supersession-ar-12) |
| `packages/server/src/lib/system-config.ts:97–109`; `packages/server/src/routes/config.ts:189–197` | Runtime policy can fall back; authoritative reads can reject content unsupported by an older binary.             | [Locales](03-01-locales.md)                                                 |
| `docs/guide/custom-ui.md:659`                                                                     | Suggests mounting a locale directory without the required source allowlist/rebuild.                              | [Testing/documentation](07-testing-strategy.md)                             |

## Existing Test and Packaging Boundaries

- Vitest has unit, integration, E2E and pentest projects in
  `packages/server/vitest.config.ts`. Real UI fixtures and invitation journeys already exist in
  `packages/server/tests/ui/flows/invitation.spec.ts`; there is no need for another harness.
- The email service tests cover shared expiry formatting and post-commit delivery; retain them.
  `tests/unit/security/invitation-enumeration.spec.test.ts` owns identical rejection contexts.
- `repo-tests/monorepo/server-package.spec.test.mjs:410–446` protects exact physical test counts.
  Count changes must correspond to actual feature tests, not guessed totals.
- `packages/server/package.json:10–17` packages locales/templates. Existing Docker and package
  structure contracts copy those assets; no packaging mechanism change is indicated.
- SDK invitation input already accepts `locale`; CLI invitation parsing forwards `--locale`.
  There is no missing consumer field to add.
- The runtime specification at `tests/unit/lib/system-config-runtime.spec.test.ts:83–94` also
  treats native `nl` as invalid. Its bounded supersession is recorded separately in the
  preflight supplement to AR #12.
- `tests/integration/services/email.service.test.ts:33–59,100–111` calls the real invitation
  sender without initializing i18n. Its existing regression fixture needs file-local awaited
  initialization when sending gains the translation dependency.
- Browser inventory currently matches only `.spec.ts` at
  `repo-tests/monorepo/server-package.spec.test.mjs:422`; the preflight supplement names the
  precise matcher update for the new `.spec.test.ts` file.
- Assurance source provenance requires a clean committed tree throughout collection, including
  `production-exposure/evidence.ts:156` calling `scripts/source-provenance.ts:59–93` under
  `test-harness/assurance/`. The execution checkpoint and exact-path approvals are defined in 07.

## Dependencies and Risks

| Risk                                              | Consequence                                            | Owning decision/specification |
| ------------------------------------------------- | ------------------------------------------------------ | ----------------------------- |
| Invitation-derived language on a rejection        | Reveals token/account state                            | AR #8; 03-03                  |
| Fire-and-forget override reads                    | First render loses tenant copy or differs from preview | AR #7; 03-01                  |
| Translated HTML or renderer-wide escaping changes | Injection or unrelated email regressions               | AR #6, #8; 03-02              |
| Stored `nl` read by an older configuration API    | Operational errors during rollback                     | AR #9; 03-01                  |
| Mock-only tests                                   | Missing actual bundle/Handlebars/browser failures      | AR #5; 07                     |
| Treating old roadmap counters as authoritative    | Reopens unrelated work or misstates completion         | AR #3; 99                     |

The separate tenant-management plan records a production-security recovery assertion failure.
That is historical context, not proof of the current outcome or a waiver. Execution must record
its own harness result and stop on a failed assertion under the confirmed verification policy.
The previously accepted incomplete-observer baseline must not be described as a full pass.

No tests, services, protected files, product implementation or deployment were executed as part
of this analysis. Future runner configuration references the repository root `.env`; that does
not grant permission to read it. Follow the exact-path approval precondition in 07.
