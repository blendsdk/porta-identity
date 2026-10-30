# Locale Resolution and Prepared Translations

> **Parent**: [Index](00-index.md)
> **Authority**: AR #1, #2, #4, #7, #9–13
> **CodeOps Artifact Schema**: 1

## Resources and Configuration

`packages/server/locales/default/nl/` contains a faithful formal-`u/uw` translation of every
namespace/key in `en/`, including new invitation copy. Keep interpolation identifiers identical;
add explicit singular/plural keys for invitation durations. Do not fill Dutch resources with
English text merely to pass key-parity tests. Shared names such as product/protocol identifiers
need not be translated (AR #1, #10).

Add `nl` to `SUPPORTED_LOCALES` only after its full bundle exists. Keep the canonical catalog
choices exactly `en`, `nl`; the global default remains `en`. Retain all eighteen settings and all
unrelated validation/cache semantics. The exact superseded tests are in AR #12. Consumers use
existing metadata; no shared catalog package or generated consumer API is introduced (AR #4).

The shipped pack is complete. A deployment missing a requested bundle or translation key still
uses the existing English fallback; never dynamically discover/install locales. Document that
future languages need a complete source bundle, allowlist change, tests and rebuild/deployment
(AR #4, #7).

## Selection API

Extend the existing `resolveLocale` with one optional fourth parameter, named
`invitationLocale?: string | null`. Three-argument callers retain their existing priority order.
The fourth candidate is tried after browser preferences and before the organization default;
it is not an OIDC `ui_locales` value (AR #2, #11).

| Caller                   | Arguments and authority                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| Existing auth/OIDC       | Existing three arguments; no invitation authority                                                 |
| Invitation email/preview | No OIDC/browser argument, organization default, then the explicit supplied locale in the new slot |
| Acceptance baseline      | No OIDC argument, request browser preferences, organization default, no invitation slot           |
| Valid acceptance         | Same request data, plus the validated non-conflicting row's stored locale                         |

An unsupported or absent candidate is skipped, not allowed to replace the remainder of the
chain. Do not substitute invitation locale for the organization argument: that would lose the
organization fallback when the invitation value is unsupported. No inherited-language snapshot
is written to storage (AR #9, #11).

Before resource/override lookup, normalize a well-formed language tag to its lowercase base
language, retaining the existing hyphen/underscore regional convention. Discard path-shaped,
empty or malformed candidates. A selected rendering locale must be in `SUPPORTED_LOCALES` and
have its `common` resource bundle loaded. Only this canonical value reaches filesystem lookup;
configuration writes remain exact and do not normalize (AR #8, #11).

Browser quality handling uses positive valid quality values within 0..1, at most three decimal
places, default 1 when absent, stable request order for ties. Exclude zero, malformed or duplicate
quality parameters; ignore wildcard/non-specific ranges and continue the approved fallback
chain rather than adding a new 406 response. Existing OIDC priority is unchanged. Concrete cases
are ST-03–ST-08 (AR #11).

## Prepared Tenant Translation API

Add a small async companion in `packages/server/src/auth/i18n.ts`:

```typescript
/**
 * Prepare a render-local translator after existing tenant overrides finish loading.
 * @param locale - Canonical allowlisted locale selected by the request resolver.
 * @param orgSlug - Resolved organization slug for tenant overrides.
 * @returns Prepared synchronous translation function, isolated to this render.
 * @throws Error for an unsafe or unselected internal locale.
 */
export async function prepareTranslationFunction(
  locale: string,
  orgSlug?: string,
): Promise<(key: string, options?: Record<string, unknown>) => string>;
```

This is an internal server-module API, not a new SDK or package export. It validates canonical
selected locale authority before any override path is constructed. Reuse the existing namespace
loader and lookup implementation; factor their render-local closure only as needed to expose an
awaitable preparation promise. Keep synchronous `getTranslationFunction` compatibility for other
callers. Do not duplicate its lookup engine or add shared cache state (AR #7, #13).

Invitation email and page callers await preparation before evaluating any copy. Missing,
unreadable or malformed tenant overrides retain the existing default-resource fallback. Tenant
overrides apply only to the resolved organization and selected locale. Interpolate supplied
values literally, including replacement characters such as `$&`; no translated string becomes
HTML or a Handlebars program. Do not call global `changeLanguage` (AR #6–8).

## Compatibility and Operations

The existing stored explicit/null locale continues to be copied into the accepted account.
No migration/backfill, token update, expiry rewrite, retry or extra metadata is introduced.
Null/unsupported invitation locale uses the then-current organization/global defaults (AR #9).

The user accepted language-only differences while old/new instances coexist. Upgrade all
instances and their shipped assets before setting global `default_locale=nl`. Before downgrading,
restore `en` through the existing authenticated configuration surface and confirm convergence on
all healthy peers under the existing read-driven cache policy. Older authoritative API reads can
fail for stored `nl`; a runtime English fallback is not proof of safe rollback. These are operator
instructions, not automated deployment work (AR #9).

## Failure and Test References

| Failure                             | Required handling                                                                             | Reference               |
| ----------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------- |
| Unsupported/missing language or key | Continue the approved candidate/key fallback; never expose a key as successful localized copy | AR #7, #11; ST-01 fallback subcases, ST-02–ST-08 |
| Missing/malformed tenant override   | Preserve default-resource fallback and tenant isolation                                       | AR #7; ST-09–ST-10      |
| Unprepared/direct unsafe locale     | No locale-path access from that value; fail the internal misuse rather than reading a path    | AR #8; ST-08            |
| Translation-pack omission           | Feature specifications fail before activation/merge                                           | AR #1, #12; ST-01       |

ST-01 distinguishes resource-loss behavior from pack completeness: unavailable Dutch `common`
skips Dutch during selection; a missing Dutch invitation namespace or key retains selected `nl`
and uses the English key text. Use isolated real-resource fixtures, not edits to shipped packs.
ST-08's resolver cases belong to Phase 1; its direct preparation guard belongs to Phase 2,
before that companion is implemented. Both remain mandatory (PF-001, PF-005).

Per-render isolation is tested with delayed, overlapping reads, not sleeps that assume a warm
cache. Other distributed interleavings are existing invitation/transaction authority, not a new
campaign; retain the existing baseline tests (AR #8, #13).
