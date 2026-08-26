# Retired v5 playgrounds

The v5 repository contained two development demonstrations:

- `playground/`: a static browser application exercising public-client OIDC flows.
- `playground-bff/`: a Koa backend-for-frontend demonstration using server-side sessions.

Both applications and their playground-only scripts were removed from the active monorepo. They
were unsupported experiments, were not part of the production build or verification graph, and
their documented root commands had already been retired. The maintained `test-harness/` continues
to provide SPA and BFF black-box OIDC coverage.

## Recovering an implementation

Git retains every removed file. Locate the retirement commit and inspect its parent:

```bash
git log --all -- playground/ playground-bff/
git show <retirement-commit>^:playground/README.md
git show <retirement-commit>^:playground-bff/README.md
```

Recover only the implementation selected for active maintenance. A recovered example should receive
current dependencies, documentation, tests, and CI coverage before it becomes part of the monorepo
workspace graph.
