# RD-04: Functional Contracts and Live Compatibility

> **Document**: RD-04-functional-contracts-and-compatibility.md
> **Status**: Complete
> **Created**: 2026-08-09
> **Project**: Porta Test Assurance
> **Depends On**: RD-01, RD-02
> **CodeOps Artifact Schema**: 1

---

## Feature Overview

This requirement audits externally observable functional behavior and closes the current gap where
SDK and ordinary CLI tests use mocked transports. It adds focused live journeys through the same
harness and tests packed/compiled public artifacts rather than workspace source (AR #20).

## Functional Requirements

### Must Have

- [ ] **R4.1 (L)** Decompose supported external behavior into requirement-owned contract claims for
      OIDC, administration, SDK, CLI, email, configuration, and lifecycle surfaces.
- [ ] **R4.2 (M)** Review existing tests against those claims and classify each as accepted sentinel,
      corroborating implementation test, weak/rework candidate, duplicated evidence, or gap.
- [ ] **R4.3 (M)** New specification tests shall use `*.spec.test.ts`; internal tests written after
      implementation shall use `*.impl.test.ts`. Existing files are renamed only when audited and
      ownership is clear.
- [ ] **R4.4 (L)** Build the current SDK and CLI, create local package archives, install them into an
      isolated consumer directory, and exercise only declared SDK exports and the compiled `porta`
      executable.
- [ ] **R4.5 (M)** The compatibility project shall import every documented SDK export entry and fail
      on missing build output, invalid export maps, undeclared runtime dependencies, or ESM loading
      errors.
- [ ] **R4.6 (L)** The packed SDK shall execute representative authenticated read, write, list,
      pagination, validation-error, authorization-error, and cross-tenant-denial flows against the
      harness server.
- [ ] **R4.7 (L)** The packed CLI shall execute health, login, identity, read, structured-output,
      authorization-error, and a reversible write lifecycle against the harness server.
- [ ] **R4.8 (M)** Browser-assisted CLI login shall use an isolated temporary credential location;
      credentials shall be removed on success and failure.
- [ ] **R4.9 (M)** SDK/CLI effects shall be independently verified through raw HTTP or fixture state,
      not solely by the client under test.
- [ ] **R4.10 (M)** The mandatory compatibility gate is current server × current packed SDK/CLI;
      N/N-1 or released-version compatibility is not promised without a separate product policy.
- [ ] **R4.11 (M)** Functional negative tests shall assert exact stable status/error codes, response
      schema, exit code, stdout/stderr discipline, and absence of forbidden state changes.

### Should Have

- [ ] **R4.12 (M)** High-value import/export/bulk workflows should gain live public-boundary cases
      after their contracts and cleanup behavior are specified.
- [ ] **R4.13 (S)** A report should identify public commands or SDK operations with mock-only evidence.

### Won't Have (Out of Scope)

- A backward-compatibility promise for prior released SDK, CLI, or server versions.
- Replacement of SDK/CLI unit tests.
- New public commands, SDK operations, or Porta product behavior.

## Technical Requirements

### Compatibility Artifact Identity

Every run shall record package name, version, archive digest, Node version, executable path, export
entry, server image digest, and source commit. Mutable registry tags such as `latest` are prohibited.

### Functional Audit Outcomes

| Outcome                 | Required action                                                           |
| ----------------------- | ------------------------------------------------------------------------- |
| Exact existing sentinel | Link to claim and preserve                                                |
| Weak assertion          | Add independent specification case before changing it                     |
| Duplicate               | Retain unless deletion is separately authorized and equivalence is proven |
| Requirement conflict    | Reopen the owning requirement; do not edit the test to match code         |
| Product defect          | Reproduce and route per RD-01                                             |
| Missing contract        | Keep the claim incomplete until requirement authority resolves it         |

### Client Isolation

Each packed-client run shall use a newly created temporary consumer directory and credential store.
It shall not resolve workspace packages through symlinks, undeclared hoisting, or source aliases.

## Integration Points

- RD-01 owns claim and defect state.
- RD-02 supplies server, fixtures, browser, and cleanup.
- RD-05 owns security-specific contracts reused by client negative tests.
- RD-07 determines when the compatibility project becomes required.

## Scope Decisions

| Decision             | Options Considered                   | Chosen                          | Rationale                                               | AR Ref        |
| -------------------- | ------------------------------------ | ------------------------------- | ------------------------------------------------------- | ------------- |
| Client evidence      | Mock / workspace live / packed live  | Packed live plus existing units | Tests publishable artifacts and preserves fast feedback | AR #20        |
| Compatibility matrix | Current only / N-1 / broad           | Current triplet only            | No unsupported compatibility promise                    | AR #20        |
| Effect verification  | Client output / external observation | External observation            | Avoid client validating itself                          | AR #7, AR #20 |

## Security Considerations

- **Data sensitivity**: Use synthetic users and temporary credentials; redact tokens and secrets.
- **Input validation**: Validate archive paths, export names, CLI arguments, callback URLs, JSON
  output, and temporary paths.
- **Authentication and authorization**: Include permitted, forbidden, unauthenticated, and
  cross-tenant cases.
- **Injection risks**: Pass CLI arguments without shell concatenation and validate output before
  parsing.
- **Encryption**: OIDC/browser traffic uses harness TLS; temporary credential stores use restrictive
  permissions.
- **Rate limiting**: Client journeys shall not bypass product rate limits; fixture reset isolates
  intentional limit tests.
- **Infrastructure**: Package installation occurs in a disposable directory without publishing.

## Acceptance Criteria

1. [ ] A clean compatibility run installs SDK and CLI package archives into a directory outside all
       workspaces and resolves no package through a workspace symlink.
2. [ ] Every documented SDK export entry imports successfully from the packed package under Node 22.
3. [ ] The packed SDK completes one authenticated read, one reversible write, one list/pagination
       flow, one validation failure, one authorization failure, and one cross-tenant denial.
4. [ ] The compiled CLI completes health, browser-assisted login, identity, one read, JSON output,
       one reversible write, and one forbidden operation with exact exit/stdout/stderr assertions.
5. [ ] At least one SDK and one CLI state change is independently confirmed without using that
       client's returned success value as the oracle.
6. [ ] Removing a required `dist` export or runtime dependency makes compatibility fail before any
       product assertion and identifies the packaging defect.
7. [ ] Successful and failed runs remove temporary credentials and do not change package versions,
       publish artifacts, or modify registry state.
8. [ ] The compatibility documentation explicitly states that only current server × current clients
       is assured by this feature.
