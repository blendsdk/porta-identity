# RD-01: Assurance Governance and Traceability

> **Document**: RD-01-assurance-governance-and-traceability.md
> **Status**: Complete
> **Created**: 2026-08-09
> **Project**: Porta Test Assurance
> **Depends On**: —
> **CodeOps Artifact Schema**: 1

---

## Feature Overview

Porta needs an auditable way to distinguish test quantity from trustworthy assurance. This
requirement establishes the claims, oracle hierarchy, traceability, evidence, gap handling, and
defect-routing rules used by every later risk slice. It does not change Porta product behavior.

## Functional Requirements

### Must Have

- [ ] **R1.1 (M)** Every audited behavior shall have a stable assurance-claim identifier, owner,
      risk priority, authoritative source, threat or failure statement, public observation boundary,
      exact expected result, sentinel tests, evidence status, and named gaps (AR #8).
- [ ] **R1.2 (M)** Expected behavior shall be derived from approved requirements, Porta security
      invariants, public contracts, and applicable standards; production helpers and current output
      shall not calculate specification expectations (AR #7).
- [ ] **R1.3 (M)** Every security-critical claim shall include at least one negative or adversarial
      case and shall confirm prohibited side effects did not occur where state could be mutated.
- [ ] **R1.4 (M)** Sentinel tests shall reject vacuous evidence: conditional early exits, swallowed
      setup failures, broad success/failure status allowlists, and “not 500” as the only oracle are
      prohibited unless availability smoke is the complete requirement (AR #17).
- [ ] **R1.5 (M)** Evidence shall bind results to the source commit, built image or package artifact,
      dependency versions, fixture manifest, command, timestamps, and redacted logs (AR #25).
- [ ] **R1.6 (M)** Every reviewed surface lacking sufficient evidence shall be recorded as a named
      gap; absence of a failing test or scanner finding shall never be represented as proof of safety.
- [ ] **R1.7 (M)** A confirmed product defect shall record reproduction, affected claim, severity,
      observed versus required behavior, and routing destination; implementation fixes remain
      outside this feature (AR #19).
- [ ] **R1.8 (M)** A risk slice shall remain incomplete while any Must criterion is violated or any
      verified security invariant is unresolved (AR #25, AR #26).
- [ ] **R1.9 (M)** Existing tests may become sentinel evidence only after their oracle, prerequisites,
      assertions, and failure behavior have been reviewed; no bulk trust is inferred from passing.
- [ ] **R1.10 (M)** Traceability validation shall fail on duplicate claim IDs, missing authoritative
      sources, nonexistent test references, invalid evidence statuses, or critical claims without
      negative cases.

### Should Have

- [ ] **R1.11 (M)** The evidence catalog should be machine-readable while keeping durable rationale
      readable in Markdown.
- [ ] **R1.12 (S)** Reports should summarize complete, incomplete, and blocked claims by risk slice
      without copying requirement text into a parallel specification.

### Won't Have (Out of Scope)

- Certification or an absolute “no exploit paths” statement — finite evidence cannot prove it
  (AR #6, AR #24).
- Retrofitting metadata onto all 4,307 tests — only audited sentinel evidence is mapped (AR #4).
- Product defect remediation — separately authorized tasks own fixes (AR #19).

## Technical Requirements

### Claim State Model

| State        | Meaning                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------- |
| `unreviewed` | Surface is known but has not passed oracle and assertion review                          |
| `incomplete` | Review ran and one or more required evidence elements are absent                         |
| `blocked`    | A confirmed defect or infrastructure failure prevents completion                         |
| `assured`    | All slice completion evidence exists and verifies against the current revision           |
| `stale`      | Governing requirement, implementation boundary, dependency, or fixture changed afterward |

An `assured` claim shall become `stale` when a reopen trigger in its owning ambiguity decision or
requirement fires. State transitions shall be deterministic and validated (AR #8, AR #25).

### Oracle Hierarchy

1. Normative identity/security requirement and independently decoded protocol data.
2. Public black-box state transition or non-transition across HTTP, browser, cookie, email, tenant,
   or supported client boundaries.
3. Independent client-library interpretation.
4. Raw HTTP or JOSE probe when a client library normalizes the behavior under test.
5. Existing implementation-level tests as corroboration only.

### Evidence Privacy

Evidence shall exclude passwords, raw tokens, client secrets, signing material, recovery codes,
TOTP secrets, cookies, email-link tokens, connection strings, and sensitive user data. Identifiers
needed for correlation shall use synthetic values or irreversible redaction (AR #22).

## Integration Points

- RD-02 supplies deterministic fixture and execution identities.
- RD-03 supplies attributed coverage evidence.
- RD-04 and RD-05 supply functional and security sentinel tests.
- RD-06 supplies curated fault and mutation results.
- RD-07 validates continuous state and retention.

## Scope Decisions

| Decision            | Options Considered                  | Chosen              | Rationale                                                             | AR Ref |
| ------------------- | ----------------------------------- | ------------------- | --------------------------------------------------------------------- | ------ |
| Assurance authority | Code, tests, or independent sources | Independent sources | Prevent self-validation                                               | AR #7  |
| Traceability        | Notes, coverage, or claim ledger    | Claim ledger        | Names evidence and gaps without conflating execution with correctness | AR #8  |
| Defect handling     | Inline fix, ignore, or route        | Reproduce and route | Preserves migration/product-work boundary                             | AR #19 |

## Security Considerations

- **Data sensitivity**: Evidence can contain exploit paths and security failures; redact secrets and
  keep generated evidence out of committed public artifacts unless explicitly sanitized.
- **Input validation**: Validate claim IDs, source references, test paths, statuses, artifact paths,
  and evidence metadata against allowlisted formats.
- **Authentication and authorization**: CI artifacts containing vulnerability details shall use the
  repository's restricted artifact access; this feature creates no public reporting endpoint.
- **Injection risks**: Treat file paths, commands, JSON, and report text as untrusted; prohibit path
  traversal and shell interpolation.
- **Encryption**: Existing repository and CI transport/storage controls apply; no secret is persisted.
- **Rate limiting**: Not applicable to the offline catalog; tested product rate limits are owned by
  RD-05.
- **Infrastructure**: Evidence generation must not require production credentials or network access.

## Acceptance Criteria

1. [ ] A schema validation command accepts one complete sample claim and rejects samples missing
       `id`, `risk`, `source`, `oracle`, `tests`, `evidenceStatus`, or `gaps`.
2. [ ] Two claims cannot use the same identifier; validation exits non-zero and names the duplicate.
3. [ ] A critical security claim with no negative sentinel case is rejected by validation.
4. [ ] A claim cannot enter `assured` unless its referenced tests exist, applicable verification is
       green, fault-sensitivity evidence exists, and its gap list is empty.
5. [ ] A seeded report containing representative token, password, cookie, and client-secret values
       emits none of those values after redaction.
6. [ ] A confirmed defect changes the affected claim to `blocked` and records a separate routing
       reference without modifying production source.
7. [ ] Existing tests remain untrusted/unreviewed until explicitly selected and reviewed; importing
       the current inventory alone marks zero claims `assured`.
8. [ ] The catalog states that coverage and passing tests are supporting evidence, not proof that no
       exploitable path exists.
