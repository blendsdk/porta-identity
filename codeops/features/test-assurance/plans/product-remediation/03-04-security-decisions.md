# Security Decisions: Assurance Product Remediation

> **Document**: 03-04-security-decisions.md
> **Parent**: [Index](00-index.md)

## Event contract

AR-4 defines one authoritative `security.decision.v1` terminal event for every covered malformed
request and administrative authentication/authorization decision.

| Field | Contract |
| --- | --- |
| `schemaVersion` / `eventName` | Literal `1` / `security.decision.v1` |
| `occurredAt` / `requestId` | Server-created timestamp and UUID; caller correlation is never trusted |
| `surface` / `method` / `routeTemplate` | Closed surface/method and normalized registered route; never raw path/query |
| `statusCode` / `outcome` | Final public status and `allow`, `deny`, or `error` |
| `decisionPoint` / `reasonCode` | Closed validation/authentication/authorization/handler stage and reason |
| Protected references | Optional domain-separated keyed digests for actor, tenant, resource, and network source |
| Closed detail | Optional resource type, permission slugs, validation schema ID, and issue count |

Raw paths, queries, bodies, headers, rejected values, authorization material, cookies, tokens,
emails, raw IDs, stack traces, SQL/infrastructure errors, IP addresses, and user agents are forbidden.
Per AR-8, HMAC-SHA-256 keys are derived with HKDF-SHA-256 from the rotating `COOKIE_KEYS` ring and
fixed `porta/security-decision/v1/<domain>` labels. The active key creates references; retained
older cookie keys verify only. Events carry a non-secret derived key ID and may verify only while
the source key remains in the configured ring.

## Middleware lifecycle

1. Correlation creates the request ID before body parsing and records only server-owned context.
2. A terminal-decision context accepts typed facts from validation, admin authentication,
   membership, permission, resource guard, and handler boundaries.
3. Error handling converts known validation/parser/size failures into minimal public responses and
   closed decision facts; it never serializes the raw thrown error.
4. A finalizer runs in `finally`, derives the final outcome/status, validates the strict schema,
   and emits exactly once.
5. Node HTTP `clientError` handling emits the transport form with a fresh correlation ID and closed
   parse reason when the request cannot enter Koa. It never reads/logs the raw packet.

Ordinary request logs and business audit rows remain useful but are not joined to manufacture the
terminal event.

## Audit durability

Denied and malformed outcomes remain denied even if their local event sink fails. The process
increments one bounded emergency counter and emits no sensitive fallback text.

Authorized state-changing administrative actions write their business audit/outbox intent inside
the same PostgreSQL transaction as the mutation. Failure rolls back the mutation. A dispatcher may
publish operational copies after commit, but the durable audit row is the authority. Read-only
allowed decisions and all denials use the terminal event and do not synchronously depend on a
remote sink.

## Testing requirements

- Strict schema and redaction tests for every field and unknown-key rejection.
- One-event-only tests for allowed, unauthenticated, membership-denied, permission-denied,
  resource-denied, malformed JSON, oversized body, Zod rejection, thrown handler, and Node
  `clientError` outcomes.
- Exact route-template tests proving raw paths/queries never appear.
- Durable mutation/audit atomicity tests and denial-sink failure tests.
- Black-box log capture that binds one request ID to one complete event without substring joins.
