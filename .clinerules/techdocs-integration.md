# Technical Documentation Integration Rule

**Rule ID:** `techdocs-integration`
**Category:** Workflow (Project-Specific Override)
**Scope:** Porta project — overrides the standard CodeOps `make_techdocs` protocol
**Priority:** Project-specific — this rule takes precedence over the generic `techdocs` rule for this project

---

## Purpose

This rule adapts the standard CodeOps `make_techdocs` protocol to integrate technical architecture documentation (implementation details) as a subfolder within the existing VitePress product documentation site, rather than creating a standalone documentation site.

**Key difference from standard `make_techdocs`:** Porta already has a VitePress-powered product documentation site in `docs/`. Technical architecture docs live under `docs/implementation-details/` and are served as part of the same site — one build, one deployment, one URL namespace.

---

## 🔴 Override Declaration

> **This rule OVERRIDES the standard CodeOps `techdocs` rule for this project.**
>
> When `make_techdocs`, `update_techdocs`, or `review_techdocs` is triggered in this project, the agent MUST follow this rule — NOT the generic `techdocs` protocol.

**What is overridden:**
- Phase 2 (Document Structure) — subfolder layout under `docs/implementation-details/`
- Phase 3 (VitePress Setup) — skipped entirely; VitePress is already installed
- Detection mechanism — uses `docs/implementation-details/index.md` instead of `docs/index.md`
- Sidebar/nav config — updates existing config instead of creating a new one

**What is NOT overridden (inherited from standard protocol):**
- Phase 1 (Information Gathering) — same process
- Phase 4 (Document Templates) — same templates, different paths
- Phase 5 (Authoring Guidelines) — same writing standards
- Phase 6 (Incremental Update Protocol) — same triggers and update rules
- `review_techdocs` — same checks, scoped to `docs/implementation-details/`

---

## Trigger Keywords

### `make_techdocs`

When the user types `make_techdocs` (with or without additional context):

1. **If `docs/implementation-details/index.md` does NOT exist** — Run the full creation workflow (Initial Setup + Content Authoring)
2. **If `docs/implementation-details/index.md` EXISTS with `techdocs: true`** — Run a comprehensive update (review all sections against codebase)

### `update_techdocs`

When the user types `update_techdocs`:

1. **If `docs/implementation-details/index.md` does NOT exist** — Ask the user if they want to run `make_techdocs` first
2. **If it EXISTS** — Run an incremental update (scan for changes since last update, update affected sections only)

### `review_techdocs`

When the user types `review_techdocs`:

1. **If `docs/implementation-details/` does NOT exist** — Report that techdocs are not set up
2. **If it EXISTS** — Run the health check protocol (staleness, completeness, accuracy) scoped to `docs/implementation-details/` only. Does NOT audit product docs in `docs/`.

---

## Detection & Opt-In

### Opt-In Marker

The presence of `docs/implementation-details/index.md` with the following frontmatter indicates techdocs are active:

```yaml
---
techdocs: true
---
```

**⚠️ IMPORTANT:** The product homepage at `docs/index.md` is NOT the techdocs marker and MUST NOT be modified by this protocol.

### Auto-Update Triggers

Once techdocs are opted in (the marker exists), the agent MUST update them at these checkpoints:

| Trigger | Update Type | What to Update |
|---------|-------------|----------------|
| **Phase completion** (during `exec_plan`) | Incremental | New ADRs for decisions made, updated sections if architecture changed |
| **Plan completion** (all `exec_plan` tasks done) | Comprehensive | Full review of all sections, ensure consistency, update diagrams |
| **`make_requirements` completion** | Incremental | New design decisions, updated scope, new integration points |
| **Manual `make_techdocs`** | Comprehensive | Full review and regeneration of all sections |
| **Manual `update_techdocs`** | Incremental | Quick pass — add new ADRs, update changed sections only |

---

## Document Structure

### Directory Layout

All technical documentation lives under `docs/implementation-details/`:

```
docs/implementation-details/
├── index.md                     # Landing page & techdocs opt-in marker
├── architecture/
│   ├── system-overview.md       # High-level architecture, component diagram
│   ├── data-model.md            # Domain model, entity relationships, schemas
│   ├── api-design.md            # API contracts, endpoints, protocols
│   ├── infrastructure.md        # Deployment, Docker, CI/CD, networking
│   └── security.md              # Security architecture, threat model
├── decisions/
│   ├── index.md                 # Architecture Decision Record log (chronological)
│   ├── ADR-001-[short-name].md  # Individual decision records
│   └── ...
├── guides/
│   ├── getting-started.md       # Developer setup, prerequisites, first run
│   ├── development.md           # Dev workflow, coding patterns, conventions
│   └── deployment.md            # How to deploy, environments, configuration
└── reference/
    ├── configuration.md         # All config options, env vars, feature flags
    └── integrations.md          # External system connections, protocols, auth
```

### Section Applicability

Not all sections may be needed. Create only sections that are relevant to the current state of the project. Empty placeholder sections add noise, not value.

For Porta (type: API / SaaS), all sections are typically relevant.

---

## VitePress Integration

### What to Do (Initial Setup)

When running `make_techdocs` for the first time, update the existing VitePress configuration:

1. **Add nav entry** — Add an "Implementation Details" item to the `nav` array in `docs/.vitepress/config.ts`
2. **Add sidebar section** — Add an `/implementation-details/` keyed sidebar to the `sidebar` object
3. **Do NOT** create a new `.vitepress/config.ts`
4. **Do NOT** reinstall VitePress or its plugins (already installed)
5. **Do NOT** add `package.json` scripts (already has `docs:dev`, `docs:build`, `docs:preview`)
6. **Do NOT** modify `.gitignore` for VitePress (already configured)

### Nav Entry

Add to the existing `nav` array:

```typescript
{ text: 'Implementation Details', link: '/implementation-details/' }
```

### Sidebar Section

Add to the existing `sidebar` object:

```typescript
'/implementation-details/': [
  {
    text: 'Overview',
    items: [
      { text: 'Introduction', link: '/implementation-details/' },
    ],
  },
  {
    text: 'Architecture',
    items: [
      { text: 'System Overview', link: '/implementation-details/architecture/system-overview' },
      { text: 'Data Model', link: '/implementation-details/architecture/data-model' },
      { text: 'API Design', link: '/implementation-details/architecture/api-design' },
      { text: 'Infrastructure', link: '/implementation-details/architecture/infrastructure' },
      { text: 'Security', link: '/implementation-details/architecture/security' },
    ],
  },
  {
    text: 'Architecture Decisions',
    items: [
      { text: 'Decision Log', link: '/implementation-details/decisions/' },
      // Individual ADRs added here as they are created
    ],
  },
  {
    text: 'Developer Guides',
    items: [
      { text: 'Getting Started', link: '/implementation-details/guides/getting-started' },
      { text: 'Development Workflow', link: '/implementation-details/guides/development' },
      { text: 'Deployment', link: '/implementation-details/guides/deployment' },
    ],
  },
  {
    text: 'Reference',
    items: [
      { text: 'Configuration', link: '/implementation-details/reference/configuration' },
      { text: 'Integrations', link: '/implementation-details/reference/integrations' },
    ],
  },
],
```

**Rule:** The sidebar MUST only include entries for sections that actually exist. Remove entries for sections that were not created.

### Sidebar Maintenance

When new documentation pages are added (new ADRs, new architecture sections), the agent MUST update the sidebar in `docs/.vitepress/config.ts` to include the new pages.

---

## Content Templates

All content templates follow the standard `make_techdocs` protocol (Phase 4), with one change: **all internal links use the `/implementation-details/` prefix.**

### Link Format

| Standard Protocol | This Project |
|---|---|
| `/architecture/system-overview` | `/implementation-details/architecture/system-overview` |
| `/decisions/` | `/implementation-details/decisions/` |
| `/guides/getting-started` | `/implementation-details/guides/getting-started` |
| `/reference/configuration` | `/implementation-details/reference/configuration` |

### Cross-Linking with Product Docs

Implementation details may freely link to product documentation and vice versa:

```markdown
<!-- From implementation-details → product docs -->
See the [Admin API Reference](/api/overview) for endpoint documentation.

<!-- From product docs → implementation-details -->
See the [Architecture Decision Records](/implementation-details/decisions/) for design rationale.
```

### Landing Page Template

`docs/implementation-details/index.md`:

```markdown
---
techdocs: true
---

# Porta — Implementation Details

> **Project**: Porta
> **Type**: Multi-tenant OIDC Provider (API / SaaS)
> **Tech Stack**: TypeScript, Koa, node-oidc-provider, PostgreSQL, Redis
> **Last Updated**: [YYYY-MM-DD]

---

## Purpose

This section contains the technical architecture documentation for Porta —
system design, data models, infrastructure, architecture decisions, and
developer guides. It is written for developers who maintain, extend, or
contribute to the Porta codebase.

For product documentation (how to use, configure, and administer Porta),
see the [main documentation](/).

## Contents

- **[Architecture](/implementation-details/architecture/system-overview)** — System overview, data model, API design, infrastructure, security
- **[Architecture Decisions](/implementation-details/decisions/)** — Record of all significant design choices with rationale
- **[Developer Guides](/implementation-details/guides/getting-started)** — Setup, development workflow, deployment procedures
- **[Reference](/implementation-details/reference/configuration)** — Configuration options, external integrations
```

All other templates (system-overview, data-model, api-design, infrastructure, security, ADRs, guides, reference) follow the standard `make_techdocs` Phase 4 templates with path prefixes adjusted as shown above.

---

## Authoring Guidelines

Inherited from the standard `make_techdocs` protocol Phase 5:

1. **Clear** — Written for a developer who has never seen the project
2. **Concise** — Prefer tables over paragraphs for structured data
3. **Current** — Every document has a "Last Updated" date
4. **Concrete** — Include code examples, Mermaid diagrams, and specific values
5. **Correct** — Every statement must reflect the actual codebase

### Diagrams

Use Mermaid syntax — the existing VitePress setup includes `vitepress-plugin-mermaid`.

### What NOT to Document

- ❌ Secrets, credentials, or API keys
- ❌ Auto-generated code that can be read from the source
- ❌ Temporary decisions unlikely to survive a week
- ❌ Obvious code behavior (document the *why*, not the *what*)

---

## Incremental Update Protocol

### After Phase Completion (Incremental)

When a phase in `exec_plan` completes and `docs/implementation-details/index.md` exists with `techdocs: true`:

1. **Scan for architectural changes** — New components, data entities, API endpoints, integrations, infrastructure changes, design decisions?
2. **If YES** → Update relevant sections under `docs/implementation-details/`, create ADRs for decisions
3. **If NO** → Skip (not every phase changes architecture)
4. **Update "Last Updated"** dates on modified documents
5. **Update sidebar** in `docs/.vitepress/config.ts` if new pages were added

### After Plan Completion (Comprehensive)

1. Review every section under `docs/implementation-details/` against the current codebase
2. Update all Mermaid diagrams to reflect current architecture
3. Verify all internal links are working
4. Check for stale content
5. Update the VitePress sidebar if new pages were added
6. Update "Last Updated" dates
7. Create ADRs for any undocumented decisions

### After `make_requirements` Completion (Incremental)

1. Extract design decisions from requirements documents
2. Create ADRs under `docs/implementation-details/decisions/`
3. Update architecture sections if requirements imply changes
4. Update the decision log

---

## `review_techdocs` Protocol

When `review_techdocs` is triggered:

1. Read all documents under `docs/implementation-details/`
2. Analyze the current codebase structure
3. Run these checks:

| Check | What to Look For |
|-------|-----------------|
| **Staleness** | "Last Updated" dates older than recent code changes |
| **Completeness** | Missing sections for existing components, entities, endpoints |
| **Accuracy** | Documented architecture doesn't match actual code |
| **ADR coverage** | Significant decisions without corresponding ADRs |
| **Link health** | Broken links (internal and cross-links to product docs) |
| **Diagram accuracy** | Mermaid diagrams that don't match actual architecture |
| **Sidebar sync** | Pages exist but aren't in the VitePress sidebar |

4. Produce a diagnostic report following the standard `review_techdocs` format.

**Scope:** Only `docs/implementation-details/` is audited. Product docs in `docs/api/`, `docs/guide/`, etc. are NOT in scope (those are governed by `docs-maintenance.md`).

---

## Session Management

If context window approaches 90% during `make_techdocs`:

1. Save all completed documents to `docs/implementation-details/`
2. Note remaining work in `docs/implementation-details/_draft/techdocs-progress.md`
3. Run `/compact`

Resume with `make_techdocs --continue` — reads progress file and continues.

---

## Forbidden Actions

The agent MUST NOT:

- ❌ Modify `docs/index.md` (the product homepage)
- ❌ Create a separate `docs/.vitepress/config.ts` or override the existing one wholesale
- ❌ Reinstall VitePress or its plugins
- ❌ Add duplicate `package.json` scripts for docs
- ❌ Place techdocs files outside `docs/implementation-details/`
- ❌ Modify existing product documentation content (files in `docs/api/`, `docs/guide/`, `docs/concepts/`, `docs/cli/`, `docs/database/`) as part of the techdocs protocol
- ❌ Remove or reorder existing nav/sidebar entries in the VitePress config

---

## Integration with Existing Rules

| Rule | Relationship |
|---|---|
| **`docs-maintenance.md`** | Product docs maintenance is separate. This rule governs `docs/implementation-details/` only. Both rules may trigger independently. |
| **`security-principal.md`** | Security docs in `docs/implementation-details/architecture/security.md` must comply with the security principal — no secrets, no internal details that aid attackers. |
| **`project.md`** | References this rule in Cross-References. Structure changes to `docs/implementation-details/` should be reflected in project.md. |
| **CodeOps `make_plan`** | Plans should READ existing implementation details as context. After plan completion, implementation details are updated. |
| **CodeOps `requirements`** | After requirements completion, implementation details are updated with design decisions. |

---

## Summary

| Trigger | Action |
|---------|--------|
| `make_techdocs` | Create or comprehensively update `docs/implementation-details/` |
| `make_techdocs --continue` | Resume interrupted authoring session |
| `update_techdocs` | Incremental update of `docs/implementation-details/` |
| `review_techdocs` | Health check scoped to `docs/implementation-details/` |
| *(auto)* Phase complete | Incremental update if techdocs marker exists |
| *(auto)* Plan complete | Comprehensive update if techdocs marker exists |
| *(auto)* Requirements complete | Incremental update with design decisions |

**Output:** `docs/implementation-details/` directory integrated into the existing VitePress site, accessible via the "Implementation Details" nav item.
