# Requirements Delta: Production Security Corrections

> **Source**: [RD-01 Production Security Corrections](../../requirements/RD-01-production-security-corrections.md)
> **Preflight**: [Passed RD-01 report](../../requirements/00-preflight-report-RD-01.md)
> **Decision Register**: [Plan ambiguity register](00-ambiguity-register.md)
> **CodeOps Artifact Schema**: 1

## Plan Interpretation

This document does not restate RD-01. The component specifications translate its accepted criteria
into exact code contracts. The testing strategy owns the immutable acceptance cases.

| Confirmed plan boundary | Interpretation |
|---|---|
| Unsupported stored TOTP state | Existing page, HTTP 503, localized generic contact-admin text |
| Enrollment limit exhausted | Existing enrollment page, HTTP 429, `Retry-After`, stored pending setup reused |
| Signing-row diagnostic | `SigningKeyCryptoError('Signing key record is invalid')`; event `signing-key-record-invalid`; `kid` only |
| TOTP configuration diagnostic | Event `totp-configuration-unsupported`; no configuration values or caught error |
| Provider refresh | Every Porta process is restarted; no live provider mutation |
| Verification | The exact command set approved in AR-4 |

## Traceability

| RD criteria | Owning specification |
|---|---|
| AC-01–AC-05, AC-13, AC-15 | [03-01 Signing Keys](03-01-signing-keys.md) |
| AC-06–AC-11, AC-13 | [03-02 TOTP Replay](03-02-totp-replay.md) |
| AC-12, AC-14 | [03-03 Production Operations](03-03-production-configuration-and-operations.md) |
| All acceptance evidence | [07 Testing Strategy](07-testing-strategy.md) |
