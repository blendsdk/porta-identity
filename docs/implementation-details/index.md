---
techdocs: true
---

# Porta — Implementation Details

> **Project**: Porta
> **Type**: Multi-tenant OIDC Provider (API / SaaS)
> **Tech Stack**: TypeScript, Koa, node-oidc-provider, PostgreSQL, Redis
> **Last Updated**: 2026-04-24

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

## Quick Navigation

| Section | What You'll Find |
|---------|-----------------|
| [System Overview](/implementation-details/architecture/system-overview) | High-level architecture, component diagram, request flow |
| [Data Model](/implementation-details/architecture/data-model) | Domain entities, relationships, database schema |
| [API Design](/implementation-details/architecture/api-design) | REST conventions, authentication, pagination, error handling |
| [Infrastructure](/implementation-details/architecture/infrastructure) | Docker, deployment, CI/CD, monitoring |
| [Security](/implementation-details/architecture/security) | Threat model, crypto standards, multi-tenant isolation |
| [Decision Log](/implementation-details/decisions/) | Architecture Decision Records (ADRs) |
| [Getting Started](/implementation-details/guides/getting-started) | Developer setup, prerequisites, first run |
| [Development Workflow](/implementation-details/guides/development) | Coding patterns, testing, module conventions |
| [Deployment](/implementation-details/guides/deployment) | Production deployment, Docker, environment config |
| [Configuration Reference](/implementation-details/reference/configuration) | All environment variables, config options, defaults |
| [Integrations](/implementation-details/reference/integrations) | PostgreSQL, Redis, SMTP, node-oidc-provider |
