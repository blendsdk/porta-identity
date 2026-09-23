# Release Notes — v1.8.0

**Released**: 2026-09-23

## Security

- The OIDC token and introspection endpoints are now rate limited on their real
  paths (`/{orgSlug}/token` and `/{orgSlug}/token/introspection`). Each applies
  a per-client budget plus an aggregate per-peer counter, and a rejection
  carries CORS headers so browser clients can read it.
- The client address used for rate limiting and audit logging resolves to the
  trusted proxy hop (`TRUST_PROXY_HOPS`), so a spoofed `X-Forwarded-For` value
  can no longer rotate a client's rate-limit identity.

## Assurance

- Forwarding-context observers are complete: the configured public origin and
  the public cookie policy are observed through attack-driven probes. The
  production-security and operational assurance runs report no incomplete
  cases.
- The P1 live-boundary adapter provides independently observed evidence for
  administrative permission denials.
- Ingress-answered rejections are modeled explicitly in the raw oracle.

## Documentation

- `TRUST_PROXY` documentation now matches the code default (`true`) and states
  the direct-exposure precondition (`TRUST_PROXY=false`).

## Verification

- `main` Build and Test passes: monorepo verification, UI tests, OIDC harness,
  public documentation, production Docker build, and production dependency
  audit.
- `yarn verify` passes for the server, SDK, and CLI workspaces.
