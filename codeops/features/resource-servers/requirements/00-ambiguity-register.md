# Ambiguity Register: Resource-Server Admin Surface

> **Status**: ✅ GATE PASSED — all 10 items resolved
> **Last Updated**: 2026-11-09 00:12

| # | Category | Ambiguity / Gap | Options Presented | User Decision | Status |
|---|----------|-----------------|-------------------|---------------|--------|
| AR-1 | Scope | Which feature owns the new admin requirements? | Existing `resource-servers` / new `resource-server-admin` feature | Existing `resource-servers` feature | ✅ Resolved |
| AR-2 | Security & compliance | Which Admin permissions protect the resource-server surface? | Reuse `admin:app:read` / `admin:app:update` / dedicated `admin:resource-server:*` permissions | Reuse `admin:app:read` for reads and `admin:app:update` for create, update, and delete | ✅ Resolved |
| AR-3 | Data & state | How are custom scopes mutated after creation? | Replace-all on update / add-remove endpoints / both | Replace-all on update: `PUT` carries the complete scope array and replaces it atomically | ✅ Resolved |
| AR-4 | Scope | Which delivery slices belong in the first implementation plan? | API + SDK + CLI + docs / API + SDK first / Admin API only | API + SDK + CLI + docs in one plan | ✅ Resolved |
| AR-5 | UX & presentation | How does the list endpoint behave? | Bounded simple list / cursor pagination | Bounded simple list for one application, ordered by name; no pagination | ✅ Resolved |
| AR-6 | Naming & terminology | Where do the CLI commands live? | `porta app resource-server ...` / top-level `porta resource-server ...` / defer CLI | `porta app resource-server ...` | ✅ Resolved |
| AR-7 | Behavioral | What happens when an update omits `audience`? | Reset to identifier / preserve existing audience | Reset to identifier, matching create behavior and the database default | ✅ Resolved |
| AR-8 | Behavioral | May the custom scope registry contain standard OIDC scopes? | Reject standard scopes / allow and deduplicate | Reject standard OIDC scopes with a fixed `400`; the registry is custom-only | ✅ Resolved |
| AR-9 | Data & state | What happens when a resource server with live grants or tokens is deleted? | Hard delete and document impact / block while referenced | Hard delete; cascade scopes and namespace; new requests receive `invalid_target`; already-issued tokens remain valid until expiry | ✅ Resolved |
| AR-10 | Scope | Which optional surfaces belong in this feature? | None / export-import / target-specific audit / ETag-If-Match | None of these; keep scope to API, SDK, CLI, and docs | ✅ Resolved |

## Resolution Notes

**AR-1:** The existing `resource-servers` feature already owns the provider model and records the
admin surface as a deferred follow-up. Reopening it keeps the model and its management surface in
one feature rather than creating a parallel feature folder.

**AR-2:** Reusing `admin:app:read` and `admin:app:update` preserves the existing App Admin role and
avoids a permission seed migration for installed deployments. Create, update, and delete are
application mutations, so `admin:app:update` is the write permission.

**AR-3:** Replace-all keeps the registry consistent in one transaction. The request body carries the
complete scope list; omitted or empty means no custom scopes. Add/remove endpoints are excluded.

**AR-4:** The capability is not operator-usable without the SDK, CLI, and documentation. Delivering
them together avoids a second integration cycle and a temporarily inconsistent public contract.

**AR-5:** Resource servers are application-owned and expected to be few. A bounded list avoids a
pagination contract that the first surface does not need. Ordering is by name, then identifier, for
stable output.

**AR-6:** `porta app resource-server ...` follows the existing `app module`, `app role`, and
`app claim` command families. A top-level command would duplicate the application context.

**AR-7:** `PUT` is a full replacement. An omitted audience therefore becomes the identifier, which
matches create behavior and the database trigger. Callers that need a distinct audience must send
it explicitly.

**AR-8:** Standard OIDC scopes are protocol-owned and already added by the resolver. Accepting them
in the custom registry would create redundant rows and ambiguous validation. The API rejects them
with a fixed `400` response.

**AR-9:** There is no foreign key from provider grants or tokens to resource-server rows, and
blocking would require new reference queries. Hard delete follows the existing cascade design.
Operators must understand that already-issued tokens remain valid until their normal expiry; new
requests for the deleted identifier or audience fail with `invalid_target`.

**AR-10:** Export/import, target-specific audit events, and ETag/If-Match are separate concerns. The
existing generic `admin.mutation.committed` audit still records each successful Admin mutation; this
feature does not add a domain-specific event.

## Final Confirmation

The user selected the recorded options for AR-1 through AR-10 in the requirements interview. The
complete register is presented for final confirmation before the RD is authored.
