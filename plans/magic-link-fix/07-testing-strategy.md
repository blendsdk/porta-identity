# Testing Strategy: Magic Link Cross-Browser Fix

> **Document**: 07-testing-strategy.md
> **Parent**: [Index](00-index.md)

## Test Scenarios

### Unit Tests (new)
| Test | Description |
|------|-------------|
| `_ml_session` cookie signing | Verify cookie is HMAC-signed, can't be forged |
| `_ml_session` single-use | Verify cookie is consumed after first use |
| `_ml_session` TTL | Verify expired session is rejected |
| Success page guard | Verify success page rejects requests without `_ml_session` |

### UI Tests (fix existing + new)
| Test | Description | Status |
|------|-------------|--------|
| Same-browser magic link | Full flow completion | Fix existing fixme |
| Different-browser magic link | Success page shown | New test |
| Success page without session | Error/redirect, not success | New test (security) |
| Expired interaction | Graceful message | New test |

### Pentest (security)
| Test | Description |
|------|-------------|
| Crafted URL without `_ml_session` | Must NOT show success page |
| Forged `_ml_session` cookie | Must reject (invalid signature) |
| Replayed `_ml_session` cookie | Must reject (single-use) |

## Verification Checklist

- [ ] 2 previously-fixme magic link tests pass
- [ ] New unit tests for `_ml_session` lifecycle
- [ ] New UI tests for cross-browser scenario
- [ ] Security tests: URL crafting, cookie forging, replay
- [ ] All existing UI tests still pass
- [ ] `yarn verify` passes
