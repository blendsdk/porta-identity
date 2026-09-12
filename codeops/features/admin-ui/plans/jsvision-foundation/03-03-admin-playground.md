# Admin Playground: JSVision Admin Foundation

> **Document**: 03-03-admin-playground.md
> **Parent**: [Index](00-index.md)

## Overview

The playground is a dedicated, non-production Docker Compose environment for exploring `porta admin` and later email-driven administration journeys. One lifecycle entry point owns preflight, startup, initialization, health, persistence, stop, status, and exact reset behavior. It does not reuse or modify the retained OIDC harness lifecycle. (AR-5, AR-8–AR-15, AR-23)

## Asset Boundary

```text
docker/admin-playground/
  compose.yml
  nginx.conf
  scripts/admin-env.mjs
  scripts/check-prerequisites.mjs
  .gitignore
  runtime/                 # generated, ignored, owner-only
    secrets.env
    lifecycle.lock         # persistent file; kernel lock is process-owned
    tls/                   # exact-host certificate/key; retained across reset
```

Script splitting may follow existing repository conventions, but all destructive targets and Compose project identity remain constants owned by this directory. Generated runtime files are never committed. (AR-13–AR-15)

## Service Topology

```text
127.0.0.1:3543 -> nginx TLS -> internal Porta HTTP
127.0.0.1:8026 -> MailHog web UI
Porta -> internal PostgreSQL
Porta -> internal Redis
Porta -> internal MailHog SMTP
```

Only nginx HTTPS and MailHog UI publish host ports, both explicitly bound to `127.0.0.1`. PostgreSQL, Redis, Porta HTTP, and SMTP have no host port. Services use health checks and a dedicated network. Containers retain existing non-root/security conventions where images support them, and nginx trusts forwarded HTTPS only through the isolated topology. (AR-10, AR-11, AR-26)

## Configuration

| Value                  | Contract                                                |
| ---------------------- | ------------------------------------------------------- |
| Hostname               | `porta-admin-playground.ci.portaidentity.com`           |
| HTTPS                  | `127.0.0.1:${PORTA_ADMIN_HTTPS_PORT:-3543}`             |
| MailHog UI             | `127.0.0.1:${PORTA_ADMIN_MAILHOG_PORT:-8026}`           |
| Issuer base URL        | Exact selected HTTPS origin                             |
| Bootstrap organization | Slug `porta-admin`, display name `Porta Admin`          |
| Bootstrap email        | `admin@playground.porta.test`                           |
| Bootstrap name         | Given `Playground`, family `Administrator`              |
| SMTP                   | Internal MailHog service/port                           |
| Compose project        | Fixed playground-specific name, never inferred from cwd |

Port overrides are validated numeric unprivileged ports and checked for availability before containers start. The CI hostname is not configurable because DNS/certificate/issuer consistency and bounded reset ownership depend on one exact identity. (AR-9–AR-15, AR-18)

## Lifecycle Operations

`up`, `stop`, and `reset` acquire the same bounded exclusive kernel lock on the persistent lifecycle lock file before mutation and hold it through final health/cleanup. Timeout or cancellation fails without mutation. `status` remains read-only and does not acquire the mutation lock. The root lifecycle tool uses the same `fs-ext-extra-prebuilt@2.2.13` adapter semantics as credential locking, without introducing a shared source package. (AR-35, AR-39)

### `up`

1. Verify required tools and Docker availability.
2. Resolve the hostname and require the complete A set to be exactly `127.0.0.1` and the AAAA set to be empty.
3. Validate configured ports and prove loopback bind availability unless already owned by the healthy playground.
4. Ensure mkcert is installed and its local CA is trusted; generate/validate an exact-host certificate without weakening TLS checks.
5. Create the runtime directory as 0700 and generate stable required infrastructure values into a 0600 file only when absent.
6. Render/validate Compose configuration and start services in dependency order.
7. Run Porta migrations through the playground service.
8. Detect whether initialization is required. On first run only, invoke existing initialization with email `admin@playground.porta.test`, given name `Playground`, family name `Administrator`, and the interactively entered hidden password; initialize the existing `porta-admin` organization/public PKCE client without persisting the password.
9. Verify HTTPS health, issuer discovery, and MailHog reachability; print only non-secret URLs and next commands.

If initialized data exists, `up` skips bootstrap and never asks for or changes the password. Partial failure reports one safe recovery command and preserves enough owned state for diagnosis without printing secrets. (AR-12, AR-13, AR-23, AR-26)

### `stop`

Stop/remove only this Compose project's containers/network while preserving named data volumes, runtime secrets, certificate material, and MailHog only as allowed by Compose's disposable service configuration. It is idempotent. (AR-8, AR-15)

### `status`

Report bounded service health and non-secret endpoint URLs. Missing/stopped/partial/healthy states are distinct. Status performs no mutation and never displays environment secrets or raw container configuration. (AR-15, AR-26)

### `reset`

Before confirmation or mutation, prove stdin/stdout can support the existing hidden-password bootstrap interaction. `--yes` skips only destructive confirmation; it never skips bootstrap capability or password entry. Failure leaves containers, volumes, secrets, and mail unchanged. Then resolve the fixed volume allowlist and require the exact typed phrase `reset porta-admin-playground` unless `--yes` is supplied. Under the lifecycle lock, stop the exact project, request removal of every allowlisted volume, and independently prove every target absent. Only then rotate the generated infrastructure secret file, clear disposable mail, retain mkcert CA/certificates and the shared CLI credential file, and run complete bootstrap. Partial/failed deletion preserves the old secret file, skips bootstrap, reports bounded partial state, and requires reset to be rerun. The warning explains that retained credentials for the same URL are stale and `porta admin` repairs them through authentication. (AR-8, AR-13, AR-14, AR-23, AR-39, AR-40)

No recursive broad deletion, Docker system prune, wildcard project selection, or shared credential deletion is permitted.

## Secrets and Persistence

Stable generated secrets include the values Porta requires to decrypt/sign data or authenticate internal infrastructure. Generation uses cryptographically secure randomness. The ignored secrets file is loaded by Compose without copying values into source, logs, command arguments, or images. Database/cache data and the values required to read it share the same reset lifetime. TLS material has a separate retained lifetime because it is local trust infrastructure, not protected application data. (AR-11, AR-13, AR-14)

MailHog is intentionally present from the start. Bootstrap is already verified by `porta init`; later invitation, recovery, OTP, and notification messages are delivered to MailHog and are disposable on reset. (AR-12)

## Error Handling

| Error case                                          | Handling strategy                                                        | AR ref       |
| --------------------------------------------------- | ------------------------------------------------------------------------ | ------------ |
| A record differs or has additional address          | Fail before Compose with expected/observed sanitized values              | AR-9         |
| Any AAAA record exists                              | Fail before Compose; do not rely on IPv4-only host binding               | AR-9         |
| Port occupied by unrelated process                  | Fail with port/override guidance; do not terminate process               | AR-10, AR-15 |
| mkcert missing/untrusted                            | Fail with maintainer setup guidance; do not suggest routine `--insecure` | AR-11        |
| Runtime secret permissions unsafe                   | Refuse startup and provide exact permission repair                       | AR-13        |
| Bootstrap interrupted                               | Preserve infrastructure, report rerunnable `up`; do not store password   | AR-12, AR-23 |
| Reset bootstrap input unavailable                   | Fail before lock/mutation; `--yes` does not override                     | AR-40        |
| Reset not confirmed                                 | Perform no mutation                                                      | AR-14        |
| Lifecycle lock unavailable                          | Fail after bounded wait without mutation                                 | AR-35, AR-39 |
| One or more reset volumes remain                    | Preserve old secrets, skip bootstrap, report bounded partial state       | AR-39        |
| Resolved destructive target not exactly allowlisted | Abort reset                                                              | AR-14        |
| Service health failure                              | Report service/category and safe logs command without secret values      | AR-23, AR-26 |

## Testing Requirements

- Static structure specifications for service exposure, fixed Compose project, ignored runtime assets, no hardcoded secrets, MailHog routing, named volumes, and root command surface.
- Unit specifications for A/AAAA preflight, port validation, lifecycle ordering/serialization, first-run/idempotent bootstrap, status mapping, confirmation, non-TTY `reset --yes`, exact reset allowlist, and partial deletion.
- `docker compose config` validation and nginx configuration check in its image/container.
- Isolated integration smoke for clean `up`, HTTPS discovery/health, MailHog delivery, stop/start persistence, competing lifecycle operations, reset rotation/data loss, and unrelated Docker volume survival.
- Live tests run the fixed Compose project identity inside a disposable isolated Docker context/daemon, with port overrides and exact cleanup. No public project-name override is introduced. (AR-31)
