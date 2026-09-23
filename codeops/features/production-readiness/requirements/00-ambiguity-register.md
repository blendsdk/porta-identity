# Ambiguity Register: Porta Production Readiness

> **Status**: ✅ GATE PASSED — all 19 items resolved
> **Last Updated**: 2026-09-12 20:22
> **CodeOps Artifact Schema**: 1

| # | Category | Ambiguity / Gap | Options Presented | User Decision | Status |
|---|---|---|---|---|---|
| AR-1 | Scope | Which product boundary owns the work? | Keep it in Admin UI / create `production-readiness` across server, database, SDK, CLI, deployment guidance, and Admin UI | Create the separate `production-readiness` feature-set. | ✅ Resolved |
| AR-2 | Scope | How should the work be ordered? | Portability first / security first, then portability, then configuration / one combined delivery | Security corrections first, selective portability second, global configuration third. | ✅ Resolved |
| AR-3 | Security | What is the minimum signing-key correction? | Encrypt only new Admin API keys / encrypt new keys, rotate atomically, and refresh the existing JWKS cache / introduce a key-management subsystem | Reuse existing encryption, one PostgreSQL rotation transaction, and existing cache invalidation; add no subsystem. | ✅ Resolved |
| AR-4 | Data & state | What happens to plaintext legacy signing keys? | Convert them / continue reading them / reject them and reset unused development databases | Reject plaintext rows and provide no conversion because Porta has no production users. | ✅ Resolved |
| AR-5 | Security | How is TOTP replay prevented? | No replay state / Redis marker / durable last-accepted time step in PostgreSQL | Atomically consume a greater time step in PostgreSQL for setup and authentication; concurrent reuse permits one success. | ✅ Resolved |
| AR-6 | Scope | Is application portability also backup and disaster recovery? | Combine them / keep PostgreSQL backup and restore at the operating-system layer | Keep database backup, restore, standby, and disaster recovery outside this feature. | ✅ Resolved |
| AR-7 | Feature | Which export scopes and selections are required? | Fixed full export / numbered entity files / one selective manifest | One manifest supports a selected organization or complete environment, explicit application/category selection, and OIDC clients unchecked by default. | ✅ Resolved |
| AR-8 | Data & state | How is a portable artifact represented and versioned? | Numbered JSON files / ZIP or directory / one versioned JSON document | Use one JSON document, accept only the supported manifest version, and add no splitting, ZIP, placeholder, or large-data machinery. | ✅ Resolved |
| AR-9 | Data & state | Which records and relationships are portable? | Independent flat entity dumps / dependency-aware configuration and identity graph | Include organizations; global applications and modules; roles, permissions, mappings, and claims; users, role assignments, and claim values; optional OIDC clients. Use slugs for relationships and remove the incorrect organization ownership from applications. | ✅ Resolved |
| AR-10 | Security | Does portable identity data retain authentication credentials? | Preserve internal hashes/encrypted material / reset authentication material | Preserve user profile, active/inactive state, and email verification. Exclude passwords, TOTP enrollment, recovery codes, failed-login and lockout state. Generate confidential-client secrets once during import. | ✅ Resolved |
| AR-11 | Integration | How are OIDC clients identified across installations? | Generate every Client ID / preserve the public Client ID / use database UUIDs | Preserve a collision-free Client ID; a collision with another client rejects the complete import. Generate new secrets. | ✅ Resolved |
| AR-12 | Behavioral | How are existing and missing destination records handled? | Per-record interaction / partial file application / atomic keep-or-update modes | Preview first; `Keep existing` is the default and `Update existing` updates portable fields. Create missing records, reuse existing parents, reject missing or incompatible dependencies, preserve absent destination records, never delete, and commit all or nothing. | ✅ Resolved |
| AR-13 | Data & state | What belongs in PostgreSQL global configuration? | Arbitrary administrator keys / closed code-defined catalog with database values / environment-only configuration | Use a closed typed catalog for token/authentication lifetimes, authentication rate limits, lockout policy, audit retention, and default locale, with values stored in PostgreSQL. | ✅ Resolved |
| AR-14 | Technical | Which configuration remains outside the database, and when do changes apply? | Put every setting in PostgreSQL / separate runtime policy from bootstrap and root secrets | Keep connection details, TLS, SMTP credentials, cookie/encryption keys, and other bootstrap secrets in environment/secret management. Invalidate runtime caches after save and label provider-startup settings as restart-required. Hide internal keys and remove unused or misleading entries. | ✅ Resolved |
| AR-15 | UX & security | What is the smallest Admin UI and audit surface? | Raw endpoints only / focused menu workspaces using existing Admin permissions and one content-free audit result per operation / generalized operations framework | Add focused Import/Export and System Configuration workspaces using existing Admin permissions, Layout DSL, file dialogs, dry-run feedback, and content-free audit summaries; add no operations framework. | ✅ Resolved |
| AR-16 | Integration | Should the incorrect, unused manifest contract be preserved? | Add a parallel v2 contract / correct v1 in place before adoption / retain its false application ownership | Correct v1 in place because Porta has no production users; add missing module/claim relationships and process dependencies in their valid order, with no compatibility layer. | ✅ Resolved |
| AR-17 | Behavioral | How are environment-specific OIDC redirect and origin values handled? | Placeholder/substitution engine / copy explicitly selected client configuration as shown in preview / exclude clients permanently | Clients remain explicit and default-off; when selected, copy their URLs exactly after preview and add no substitution engine. | ✅ Resolved |
| AR-18 | Security | Which TOTP parameters and public failure behavior are supported? | Generalize stored algorithm/digits/period / fix the existing SHA1, six-digit, 30-second contract | Retain the fixed contract, consume its matched step, return the same invalid-code result for mismatch/expiry/replay, and never automatically retry a consumed code. | ✅ Resolved |
| AR-19 | Technical | What is the smallest multi-process consistency boundary? | Add distributed coordination/pub-sub / use PostgreSQL only for first-key serialization and existing bounded config caches | Serialize empty-database key bootstrap with one PostgreSQL transaction lock; dynamic configuration converges within the existing 60-second cache bound, provider-startup values require all instances to restart, and no pub-sub is added. | ✅ Resolved |

## Resolution Notes

**AR-1–AR-2:** The user authorized a separate feature branch and confirmed the priority sequence.

**AR-3–AR-5:** These are deliberately narrow production-security corrections. Existing
PostgreSQL transactions, AES-256-GCM signing-key encryption, and normal test suites are sufficient;
no service, worker, queue, cache protocol, or compatibility migration is proposed.

**AR-6–AR-12:** The user confirmed selective single-manifest portability, strict versioning,
credential reset, explicit application selection, global application ownership, stable Client IDs,
and atomic keep/update behavior without deletion.

**AR-13–AR-14:** The user confirmed PostgreSQL authority for a closed runtime-policy catalog while
bootstrap dependencies and root secrets remain externally supplied.

**AR-15:** Existing granular permissions and audit facilities are reused. The proposed UI adds only
the direct workspaces needed to invoke and understand the accepted operations.

**AR-16:** The current v1 import shape assigns an organization to a global application and omits
some relationships needed for a faithful round trip. With no adopted production artifact, direct
correction is smaller than a parallel parser and compatibility policy.

**AR-17:** Copying optional client URLs is intentionally explicit. The preview is the operator's
opportunity to verify destination-specific values; automatic environment substitution is excluded.

**AR-18:** Porta stores TOTP algorithm, digit, and period columns but implements only SHA1, six
digits, and 30-second steps. This feature makes that existing supported contract explicit rather
than adding unused algorithm flexibility.

**AR-19:** One database lock prevents ambiguous first-key creation across replicas. Existing local
cache expiry provides bounded configuration convergence without introducing messaging or polling.
