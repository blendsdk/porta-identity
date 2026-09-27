# Task T-02: Make the tampered-tag signing-key crypto test deterministic

> **Type**: Task (lightweight) · **Feature**: _maintenance · **CodeOps Artifact Schema**: 1
> **Progress**: 5/5 tasks (100%)
> **Phase baseline tree**: `ebaaa441bb8370b2b4761e0fc2ebbe234ddebb3b` · scope: strict · expected
> path: `packages/server/tests/unit/lib/signing-key-crypto.test.ts`
> **Evidence**: CI run
> [#36347788339](https://github.com/blendsdk/porta-identity/actions/runs/36347788339) failed
> `tests/unit/lib/signing-key-crypto.test.ts:119` with "expected function to throw an error, but it
> didn't"; the same suite passes locally and on later runs, which marks it as flaky.

## Objective

Remove the intermittent failure in the tampered-auth-tag unit test without weakening what it
proves: a GCM authentication tag that differs from the original must make `decryptPrivateKey`
throw `SigningKeyCryptoError`.

## Root cause (verified)

- `encryptPrivateKey` returns the 16-byte GCM tag as 32 hex characters
  (`packages/server/src/lib/signing-key-crypto.ts:22-23,70-75`).
- The test builds the "tampered" tag as `tag.slice(0, -2) + 'ff'`
  (`packages/server/tests/unit/lib/signing-key-crypto.test.ts:118`), which replaces the final byte
  with `0xff`. When the random tag already ends in `ff` (probability 1/256), the value is
  unchanged, decryption succeeds, and the assertion fails.
- The neighbouring ciphertext test avoids this by guaranteeing a different digit
  (`(original + 1) % 16`, `:107-109`), as does the CSRF token test
  (`packages/server/tests/unit/auth/csrf.test.ts:75`).

## Scope

**In scope:** the tamper construction in `signing-key-crypto.test.ts`, a `tamperedTag !== tag`
guard assertion, repeated-run stability evidence, and full verification.

**Out of scope:** any production change in `signing-key-crypto.ts`; other tests; refactoring the
crypto module; new test helpers or a shared tamper utility.

## Confirmed decisions

| #   | Decision                                                                           | Source                                   |
| --- | ---------------------------------------------------------------------------------- | ---------------------------------------- |
| D-1 | Fix the test only; the production cryptography is correct                          | Root-cause analysis above                |
| D-2 | Mirror the existing ciphertext-tamper pattern (`(digit + 1) % 16`) for consistency | `signing-key-crypto.test.ts:107-109`     |
| D-3 | Add `expect(tamperedTag).not.toBe(tag)` so the tamper invariant is explicit        | This plan                                |
| D-4 | Prove stability with 100 repeated runs of the file, then full `yarn verify`        | Project verification rules (`AGENTS.md`) |

## Smallest viable design

Change one construction in one test file: read the last hex digit, replace it with
`(digit + 1) % 16`, rebuild the string, and assert the result differs from the original tag. No
helper, no production change, no new dependency.

## Tasks

- [x] T-02.1 **Confirm the mechanism.** With a synthetic 32-hex tag ending in `ff`, show
      `tag.slice(0, -2) + 'ff' === tag` (recorded evidence; no committed code).
- [x] T-02.2 **Fix.** Replace the tamper construction at
      `packages/server/tests/unit/lib/signing-key-crypto.test.ts:118` with the four lines in the
      [replacement snippet](#replacement-snippet-for-t-022) below; the guard assertion makes the
      tamper invariant explicit.

- [x] T-02.3 **Stability evidence.** Run the file once, then 100 times with
      `for i in $(seq 1 100); do yarn workspace @portaidentity/server test:unit tests/unit/lib/signing-key-crypto.test.ts || { echo "FAILED at run $i"; exit 1; }; done`.
      Any nonzero exit aborts and is reported; record the pass count.
- [x] T-02.4 **Full verification.** `yarn docker:up` then `yarn verify`; all must pass.
- [x] T-02.5 **Deliver.** On branch `fix/signing-key-crypto-flake`: commit the CodeOps plan and
      roadmap artifacts first (`docs(codeops): plan the signing-key crypto flake fix`), then commit
      the test fix (`test(server): make the tampered-tag crypto assertion deterministic`), push,
      and open a pull request to `develop`.

### Replacement snippet for T-02.2

```ts
// Corrupt the final hex digit of the auth tag (guaranteed different value)
const lastIndex = tag.length - 1;
const tagDigit = parseInt(tag[lastIndex], 16);
const tamperedTag = tag.slice(0, lastIndex) + ((tagDigit + 1) % 16).toString(16);
expect(tamperedTag).not.toBe(tag);
```

**Verify**: the 100× targeted run plus `yarn docker:up && yarn verify`.

## References

- `packages/server/tests/unit/lib/signing-key-crypto.test.ts:113-121` — the flaky test.
- `packages/server/src/lib/signing-key-crypto.ts:22-23,70-75` — tag length and hex encoding.
- `packages/server/tests/unit/auth/csrf.test.ts:75` — safe tamper precedent.
- CI failure: <https://github.com/blendsdk/porta-identity/actions/runs/36347788339>
