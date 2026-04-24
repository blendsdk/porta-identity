# Documentation Maintenance Rule

**Rule ID:** `docs-maintenance`
**Category:** Project-Specific Workflow
**Scope:** Porta project — applies to ALL implementation work (plans and ad-hoc tasks)

---

## Purpose

Every implementation task **must** include a documentation review and update step as a **mandatory final action**. This ensures that the `docs/` folder stays accurate and complete as the codebase evolves.

---

## 🚨 MANDATORY: Two Enforcement Contexts

This rule applies in **two** contexts — formal plans and ad-hoc tasks. Both are non-negotiable.

---

### Context 1: Formal Plans (`make_plan` / `exec_plan`)

**Every execution plan (`99-execution-plan.md`) MUST include a final phase (or final task in the last phase) titled "Documentation Review & Update".**

The agent **must** add this phase when generating the plan — it is not optional and must not be omitted regardless of perceived scope.

#### What the Documentation Phase Must Do

1. **Review the entire implementation** — Re-read all completed phases and the technical specs to build a full picture of what changed
2. **Scan existing `docs/` for coverage gaps** — Check each relevant documentation file against the implementation
3. **Write or update documentation** — Create new pages or update existing ones to reflect the implementation
4. **Update `docs/index.md`** — If new pages were added, ensure they are linked from the index
5. **Update `.clinerules/project.md`** — If the implementation changed the project structure, added modules, changed architecture, or introduced new conventions, update the relevant sections (Project Structure, Special Rules, etc.)

#### Execution Plan Template Addition

When generating `99-execution-plan.md`, the **last phase** must include:

```markdown
## Phase N: Documentation Review & Update

### Session N.1: Documentation Review & Update

**Reference**: All plan documents + completed implementation
**Objective**: Ensure all documentation reflects the implemented changes

**Tasks**:

| #     | Task                                                    | File                     |
| ----- | ------------------------------------------------------- | ------------------------ |
| N.1.1 | Review implementation against docs/ coverage checklist  | `docs/**/*.md`           |
| N.1.2 | Add/update documentation for new or changed features    | `docs/**/*.md`           |
| N.1.3 | Update docs/index.md if new pages were added            | `docs/index.md`          |
| N.1.4 | Update .clinerules/project.md if structure/rules changed| `.clinerules/project.md` |

**Deliverables**:
- [ ] All new/changed features are documented
- [ ] No stale or inaccurate documentation remains
- [ ] docs/index.md is up to date
- [ ] .clinerules/project.md reflects current project state
```

> **Note:** The phase number `N` is the last phase in the plan. If the plan has 4 implementation phases, this becomes Phase 5.

---

### Context 2: Ad-hoc Implementation Tasks (Non-Plan Act Mode Work)

**Before calling `attempt_completion`, the agent MUST perform a documentation review.**

#### Protocol

1. **Review what was implemented** — Summarize the changes made during the task
2. **Run the Documentation Coverage Checklist** (see below) — Determine if any docs need updating
3. **If documentation updates are needed** — Write/update the relevant docs **before** calling `attempt_completion`
4. **If NO documentation updates are needed** — The agent **must explicitly state why** in the `attempt_completion` result (e.g., "No documentation changes needed: internal refactor with no public API, CLI, or configuration changes")

#### Proportionality Guideline

Documentation effort should be proportional to the change:

| Change Scope | Documentation Expectation |
|---|---|
| Bug fix (no behavior change) | Usually none — state why in completion |
| Internal refactor | Usually none — state why in completion |
| New feature / endpoint / command | Full documentation required |
| Changed behavior of existing feature | Update existing docs |
| New configuration / environment vars | Update `docs/guide/environment.md` |
| Database schema change | Update `docs/database/*.md` |
| Architecture change | Update `docs/concepts/architecture.md` + `docs/guide/architecture.md` |

---

## Documentation Coverage Checklist

**Run this checklist against every implementation to determine what needs documenting.**

| Change Type | Check | Documentation Target |
|---|---|---|
| New or changed API endpoints | Were any routes added, removed, or modified? | `docs/api/*.md` |
| New or changed CLI commands | Were any CLI commands or flags added or modified? | `docs/cli/*.md` |
| New concepts or architecture changes | Was a new module, pattern, or architectural decision introduced? | `docs/concepts/*.md` |
| Database schema or migration changes | Were migrations added or schema altered? | `docs/database/schema.md`, `docs/database/migrations.md` |
| Configuration or environment changes | Were new env vars, config keys, or defaults added? | `docs/guide/environment.md` |
| Deployment or infrastructure changes | Were Docker, deployment, or infrastructure files changed? | `docs/guide/deployment.md` |
| Setup or quickstart changes | Did the getting-started flow change? | `docs/guide/quickstart.md` |
| Authentication or security changes | Were auth flows, 2FA, or security behavior modified? | `docs/concepts/authentication-modes.md`, `docs/concepts/two-factor.md` |
| RBAC or permissions changes | Were roles, permissions, or authorization logic modified? | `docs/concepts/rbac.md`, `docs/api/rbac.md` |
| Custom claims changes | Were claim definitions or value handling modified? | `docs/concepts/custom-claims.md`, `docs/api/custom-claims.md` |
| Multi-tenancy changes | Was tenant resolution, org handling, or scoping modified? | `docs/concepts/multi-tenancy.md` |
| UI template or custom UI changes | Were login/interaction templates modified? | `docs/guide/custom-ui.md` |
| Project structure changes | Were new modules, directories, or significant files added? | `.clinerules/project.md` (Project Structure + Special Rules) |

---

## Documentation Quality Standards

When writing or updating documentation:

1. **Accuracy** — Documentation must match the actual implementation, not the plan or intent
2. **Completeness** — Cover all public-facing aspects: endpoints, parameters, responses, errors, examples
3. **Consistency** — Follow the existing documentation style and structure in `docs/`
4. **Examples** — Include practical code/CLI examples wherever possible
5. **Cross-references** — Link to related docs (e.g., API docs linking to concept docs)
6. **Cross-document consistency** — When the same information appears in multiple documents, ALL instances must be updated together (see Cross-Document Consistency section below)
7. **Source-of-truth verification** — Documentation claims must be verified against the actual source code, not just against other documentation or the plan

---

## 🔴 Cross-Document Consistency

**Problem this solves:** The same information (environment variables, config options, setup steps, architecture details) is often documented in multiple places. When code changes, updating one doc but not others creates dangerous inconsistencies — users following different docs get different (wrong) instructions.

### Duplication Map

The following information appears in **multiple documents** and must be kept in sync:

| Information | Source of Truth | Also Appears In |
|---|---|---|
| **Environment variables** | `src/config/schema.ts` + `src/config/index.ts` | `docs/guide/environment.md`, `docs/guide/quickstart.md` (3 .env blocks), `docker/DOCKERHUB.md` (.env block + table), `.env.example`, `.env.docker` |
| **Production safety checks** | `src/config/schema.ts` (superRefine) | `docs/guide/environment.md` (safety checks table) |
| **CLI commands & flags** | `src/cli/commands/*.ts` | `docs/cli/*.md`, `docker/DOCKERHUB.md` |
| **API endpoints** | `src/routes/*.ts` | `docs/api/*.md` |
| **Docker Compose services** | `docker/docker-compose.prod.yml` | `docs/guide/quickstart.md`, `docker/DOCKERHUB.md` |
| **Prerequisites & versions** | `package.json` (engines) | `docs/guide/quickstart.md`, `docker/DOCKERHUB.md`, `docker/Dockerfile` |

### Mandatory Cross-Document Checks

When the Documentation Coverage Checklist identifies a change, the agent **MUST also check all locations in the Duplication Map** for that information type:

1. **New/changed env var** → Update `src/config/schema.ts` (code), then update ALL of:
   - `docs/guide/environment.md`
   - `docs/guide/quickstart.md` (all `.env` blocks — Docker Hub path, Clone path, Source path)
   - `docker/DOCKERHUB.md` (`.env` block AND environment variables reference table)
   - `.env.example`
   - `.env.docker`

2. **Changed production safety rules** → Update `docs/guide/environment.md` Production Safety Checks table to match the actual `superRefine` rules in `src/config/schema.ts`

3. **New/changed CLI command** → Update `docs/cli/*.md` AND `docker/DOCKERHUB.md` if the command is mentioned there

4. **Changed Docker setup** → Update `docs/guide/quickstart.md` AND `docker/DOCKERHUB.md`

### Source-of-Truth Verification

During the documentation phase, the agent **MUST verify documentation against the actual code**, not just against other docs or the plan:

| Documentation | Verify Against |
|---|---|
| Environment variable tables | `src/config/schema.ts` field definitions (required vs optional, defaults, validation) |
| Production safety checks table | `src/config/schema.ts` `superRefine()` rules |
| API endpoint docs | `src/routes/*.ts` route handlers |
| CLI command docs | `src/cli/commands/*.ts` yargs definitions |
| Docker setup instructions | `docker/docker-compose.prod.yml`, `docker/entrypoint.sh` |

---

## Integration with Existing Rules

This rule **extends** the following existing protocols:

- **`agents.md` Rule 6 (Final Verification)** — Adds documentation review as an additional mandatory check before `attempt_completion`
- **`make_plan.md` Phase 2 (Create Plan Documents)** — Adds documentation phase to every execution plan template
- **`make_plan.md` Success Criteria** — "Documentation updated" is already listed; this rule makes it concrete and enforceable
- **`make_plan.md` Post-Completion** — Complements the existing `.clinerules/project.md` re-analysis step

---

## Violation Detection

**Signs this rule is being violated:**

- ❌ A plan's `99-execution-plan.md` has no documentation phase
- ❌ `attempt_completion` is called without mentioning documentation status
- ❌ New API endpoints exist without corresponding `docs/api/` entries
- ❌ New CLI commands exist without corresponding `docs/cli/` entries
- ❌ Environment variables are added without updating `docs/guide/environment.md`
- ❌ Database migrations are added without updating `docs/database/` docs
- ❌ `.clinerules/project.md` is stale after structural changes

---

## Summary

| Context | When | What |
|---|---|---|
| **Formal plans** | During `make_plan` | Add a final "Documentation Review & Update" phase to `99-execution-plan.md` |
| **Formal plans** | During `exec_plan` | Execute the documentation phase like any other phase |
| **Ad-hoc tasks** | Before `attempt_completion` | Run the coverage checklist, update docs or state why none are needed |
| **Both contexts** | Always | Follow the Documentation Coverage Checklist and Quality Standards |
