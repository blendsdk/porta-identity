# Documentation Boundary: Porta Monorepo Migration

> **Document**: 03-03-documentation.md
> **Parent**: [Index](00-index.md)

## Overview

This component enforces MR-07: public product/API/SDK documentation stays in the GitHub Pages VitePress site, while Porta developer and architecture documentation moves to an unpublished Markdown tree.

## Public Documentation

`docs/` remains the sole VitePress source. Navigation and sidebars cover system administration, end users, public HTTP APIs, and SDK/CLI consumers. Paths and install examples are updated for `@portaidentity/server`, `@portaidentity/sdk`, and `@portaidentity/cli`. Existing `porta gui` documentation remains unless the command blocks migrated CLI parity; no future TUI behavior is invented. (AR-06, AR-13, AR-34)

## Technical Documentation

Move `docs/implementation-details/` to top-level `techdocs/`, preserving its Markdown/diagram assets. Convert internal links from public absolute `/implementation-details/...` URLs to relative links appropriate for repository browsing. Remove the section from VitePress navigation and ensure the public build output contains no technical-doc pages. Do not introduce a second generator, deployment, or Pages target. (AR-14)

Technical content that describes removed GUI architecture must be corrected or clearly marked historical; it cannot remain as current architecture. Other architecture content receives path-only updates needed by the monorepo. This is documentation parity, not design work. (AR-01, AR-11, AR-14)

## Error Handling

| Error case | Handling strategy | AR ref |
|---|---|---|
| Public docs link to moved techdocs | link/boundary test fails with source path | AR-13, AR-14 |
| VitePress emits implementation-details pages | output inspection fails | AR-14 |
| CLI docs promise behavior beyond the retained command | documentation parity check fails | AR-13, AR-34 |
| Technical docs describe a nonexistent current path | technical-doc link/path scan fails | AR-14, AR-30 |

## Testing Requirements

Implement ST-13 through ST-16 first. Build VitePress and inspect links/output; validate technical Markdown links independently without publishing it.
