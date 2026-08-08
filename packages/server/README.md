# @portaidentity/server

Porta's multi-tenant OpenID Connect server and infrastructure command-line interface.

The package contains the compiled server, the `porta-server` executable, database migrations,
authentication templates, and translations. Runtime assets resolve from the installed package, so
the server and its CLI can be started from any working directory.

## Repository commands

Run these commands from the monorepo root:

```bash
yarn build:server
yarn test:server
yarn verify:server
yarn start
yarn porta --help
```

The root commands preserve the repository-root `.env` behavior used by existing development and
operations documentation.

## Package entry points

- `node dist/index.js` starts the compiled OIDC server from the package directory.
- `porta-server` invokes the compiled infrastructure CLI at `dist/cli/index.js`.

The public administration CLI remains a separate package: `@portaidentity/cli`.

## License

MIT © TrueSoftware B.V.
