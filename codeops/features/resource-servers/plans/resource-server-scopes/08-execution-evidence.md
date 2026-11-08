# Execution Evidence: Per-Application Resource Servers

> **Plan**: `resource-servers/plans/resource-server-scopes`
> **PR**: #222
> **Last Updated**: 2026-11-07

## Delivered behavior

- Migration 038 adds application-owned `resource_servers`, explicit `resource_server_scopes`, and a
  `resource_server_namespace` primary key. The namespace makes identifier/audience collisions
  concurrency-safe; the default-audience trigger uses the identifier when an audience is omitted.
- The OIDC callback resolves only an exact application/identifier pair from the requesting client's
  internal application metadata. Unknown or wrong-owner resources return `invalid_target`; custom
  scopes outside the registry return `invalid_scope`.
- Allowed scopes combine protocol-owned OIDC scopes with the registry; issued tokens contain only the
  requested/granted subset. Resource-bound tokens are audience-bearing and intended for their
  resource server; userinfo requires a no-resource authorization.
- No-resource requests preserve the existing unrestricted behavior.
- No Admin management surface, connected-apps work (#155), JWT access tokens, per-client allowlist,
  consent change or new dependency is included.

## Verification

| Gate | Result |
| --- | --- |
| Resolver/config focused | 13 passed |
| 038 schema suite | 6 passed including two-connection namespace collision |
| Resource integration | 4 passed |
| E2E resource file | 5 passed |
| Pentest resource file | 2 passed |
| Server unit | 4,445 passed |
| Server integration | 1,105 passed; one 68-test file hit a local Redis timeout and passes 68/68 alone |
| Server E2E | 139 passed |
| Server penetration | 336 passed |
| Structure / docs build | 158 / passed |
| Server lint / typecheck / build | Passed |
| PR CI | All six jobs passed |
| Production-security assurance | Exit 0: 7 human-auth, 4 second-factor, 17 tenant/admin and 5 validation/security cases; 11 exposure passes, 0 product/incomplete/execution failures; artifact `test-harness/.assurance-results/164568b5-f014-4cd1-a4b7-82587cddce1b/production-exposure/production-security/observation.json` |

## Review closure

| Reviewer | Findings | Disposition |
| -------- | -------- | ----------- |
| Correctness reviewer | F1–F6, new namespace concurrency | All Critical/Major closed; SA-2 residual verification recorded |
| Security auditor | SA-1–SA-3 | SA-1/SA-3 closed; SA-2 headline boundary covered, auth-code/refresh/`/me` residual |

No Critical/Major finding remains. The SA-2 residual is MINOR verification for interactive
authorization-code, refresh resource-switch and `/me`, which belongs to the browser harness rather
than this server task; the shared resolver and provider grant filtering protect the same boundary.

## Evidence notes

- Tests were run against owned scratch PostgreSQL, Redis and MailHog containers; all containers were
  removed after the runs.
- The assurance run uses a clean detached worktree at the reviewed commit; a later docs-only commit
  does not change executable source.
- No merge to `main`, release, issue-state change for unrelated issues, or unrelated runtime cleanup
  was performed.
