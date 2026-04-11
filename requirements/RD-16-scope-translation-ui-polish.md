# RD-16: Scope Translation & UI Polish

> **Document**: RD-16-scope-translation-ui-polish.md
> **Status**: Draft
> **Created**: 2026-04-11
> **Project**: Porta v5
> **Depends On**: RD-07 (Auth Workflows & Login UI)

---

## Feature Overview

This requirement addresses a discovered bug in the OIDC consent page and establishes a
proper scope translation system. Currently, the consent page displays raw OIDC scope
names (e.g., `openid`, `profile`, `email`) to end users — these are cryptic technical
identifiers that mean nothing to a regular person. The translation strings already exist
in the locale files (`consent.json`) but are not wired up to the template.

Additionally, this RD covers any UI template polish discovered during playground testing,
ensuring all Handlebars templates render correctly with proper i18n, branding, and
user-friendly content.

---

## Functional Requirements

### Must Have

- [ ] **Fix consent scope display** — The consent page (`consent.hbs`) must display
  human-readable, translated scope descriptions instead of raw scope identifiers.

  **Current (broken):**
  ```
  This application would like to:
  • openid
  • profile
  • email
  ```

  **Expected (fixed):**
  ```
  This application would like to:
  • Verify your identity
  • Access your profile information
  • Access your email address
  ```

- [ ] **Scope translation lookup** — Implement a scope translation mechanism using the
  existing i18n infrastructure. For each scope, look up `consent:scope_{scopeName}` in
  the locale files, falling back to the raw scope name if no translation exists.

  **Approach options (choose during implementation):**

  **Option A: Handlebars helper** — Register a `{{scopeLabel}}` helper that looks up
  `consent:scope_{scope}` via the translation function:
  ```hbs
  {{#each scopes}}
    <li>{{scopeLabel this @root.locale @root.orgSlug}}</li>
  {{/each}}
  ```

  **Option B: Server-side pre-translation** — In the consent route handler, map raw
  scopes to translated labels before passing to the template:
  ```typescript
  const scopeLabels = requestedScopes.map(scope => ({
    id: scope,
    label: t(`consent.scope_${scope}`) ?? scope,
  }));
  ```
  ```hbs
  {{#each scopes}}
    <li>{{this.label}}</li>
  {{/each}}
  ```

  **Recommended: Option B** — Keeps template logic minimal, translation happens in
  server code where the `t()` function is readily available, and follows the existing
  pattern of preparing context data in route handlers.

- [ ] **Scope translation locale entries** — Ensure all standard OIDC scopes have
  translations in every supported locale:

  | Scope | English Translation | Locale Key |
  |-------|-------------------|------------|
  | `openid` | Verify your identity | `consent:scope_openid` |
  | `profile` | Access your profile information | `consent:scope_profile` |
  | `email` | Access your email address | `consent:scope_email` |
  | `phone` | Access your phone number | `consent:scope_phone` |
  | `address` | Access your address | `consent:scope_address` |
  | `offline_access` | Maintain access while you're away | `consent:scope_offline_access` |

  **Note:** The first 5 already exist in `locales/default/en/consent.json`.
  Only `offline_access` needs to be added.

- [ ] **Unknown scope fallback** — If a scope has no translation key (e.g., a custom
  scope), display the raw scope name. Never show an empty label or crash.

- [ ] **Scope description accessibility** — Each scope item in the consent list should
  include the raw scope name as a `title` attribute for developers who want to see
  the technical identifier:
  ```html
  <li title="openid">Verify your identity</li>
  ```

### Should Have

- [ ] **Scope icons** — Add simple icons/emojis next to each scope for visual clarity:
  | Scope | Icon |
  |-------|------|
  | `openid` | 🔐 |
  | `profile` | 👤 |
  | `email` | ✉️ |
  | `phone` | 📱 |
  | `address` | 📍 |
  | `offline_access` | 🔄 |

- [ ] **Consent page scope grouping** — Group scopes into "Required" (openid) and
  "Optional" (profile, email, etc.) sections if the provider supports granular consent
  in the future.

- [ ] **Template audit** — Review all 15 Handlebars templates for:
  - Missing or incorrect i18n keys
  - Hardcoded English strings that should be translated
  - Broken layout or CSS issues
  - Accessibility issues (missing labels, ARIA attributes)

### Won't Have (Out of Scope)

- Custom scope management UI (scopes are configured in OIDC provider config)
- Per-client scope descriptions (all clients see the same translations)
- Consent granularity (per-scope approval/deny checkboxes) — that's a separate feature
- Adding non-English language translations (the i18n system supports it, but content
  creation is a separate task)

---

## Technical Requirements

### Current Consent Route Handler

In `src/routes/interactions.ts`, the consent handler currently passes raw scope strings:

```typescript
// Line 827-828 (current — broken)
const requestedScopes = ((params.scope as string) ?? '').split(' ').filter(Boolean);
// ...
scopes: requestedScopes,  // ['openid', 'profile', 'email'] — raw strings
```

### Proposed Fix (Option B — Server-Side Pre-Translation)

```typescript
// Replace the raw scope array with translated scope objects
const requestedScopes = ((params.scope as string) ?? '').split(' ').filter(Boolean);
const scopeLabels = requestedScopes.map(scope => {
  const translationKey = `consent:scope_${scope}`;
  const translated = t(translationKey);
  // If translation returns the key itself, it means no translation exists — fall back to raw
  const label = (translated === translationKey) ? scope : translated;
  return { id: scope, label };
});

// Pass scopeLabels instead of raw scopes
const context: TemplateContext = {
  ...buildBaseContext(ctx, locale, csrfToken, org.slug),
  t,
  interaction: { ... },
  scopes: scopeLabels,  // [{ id: 'openid', label: 'Verify your identity' }, ...]
  clientName: ...,
};
```

### Updated Consent Template

```hbs
{{#if scopes.length}}
  <p style="font-weight: 500;">{{t "consent.scopes_heading"}}</p>
  <ul class="scope-list">
    {{#each scopes}}
      <li title="{{this.id}}">{{this.label}}</li>
    {{/each}}
  </ul>
{{/if}}
```

### Locale File Update

Add `offline_access` to `locales/default/en/consent.json`:

```json
{
  "scope_offline_access": "Maintain access while you're away"
}
```

### Testing Impact

The following test files may need updates:
- `tests/unit/routes/interactions.test.ts` — Consent handler tests (scope format change)
- `tests/ui/specs/consent.spec.ts` — Playwright UI tests (scope display assertions)
- `tests/ui/specs/consent-edge-cases.spec.ts` — Edge case tests
- `tests/e2e/auth/consent.test.ts` — E2E consent tests

---

## Integration Points

### With RD-07 (Auth Workflows & Login UI)
- Modifies the consent route handler in `src/routes/interactions.ts`
- Updates the consent template in `templates/default/pages/consent.hbs`
- Extends locale files in `locales/default/en/consent.json`

### With RD-14 (Playground Application)
- The playground's "Third-Party Consent" scenario exercises the fixed consent page
- Users should see translated scope labels instead of raw identifiers

---

## Scope Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| Translation approach | Handlebars helper, server-side pre-translation | Server-side pre-translation | Simpler, keeps template logic-free, follows existing patterns |
| Fallback behavior | Show empty, show key, show raw scope | Show raw scope name | Graceful degradation — always shows something meaningful |
| Scope icon format | SVG icons, emoji, CSS icons | Emoji | Zero dependencies, works everywhere, dev-tool audience |

---

## Acceptance Criteria

1. [ ] Consent page shows translated scope labels, not raw identifiers
2. [ ] All 6 standard OIDC scopes have English translations
3. [ ] Unknown scopes fall back to displaying the raw scope name
4. [ ] Raw scope name appears as `title` attribute on each scope item
5. [ ] `offline_access` scope has a translation entry
6. [ ] All existing consent-related tests pass after the change
7. [ ] New unit tests verify scope translation logic (normal, unknown, empty)
8. [ ] The fix works with per-org locale overrides (org-specific consent.json)
