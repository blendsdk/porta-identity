# Findings: Admin Service-Account Invitations

| Finding  | Phase | Severity | Area      | Ruling |
| -------- | ----- | -------- | --------- | ------ |
| SA-1-001 | 1     | MAJOR    | migration | fixed  |
| RV-2-001 | 2 | MAJOR | existing client HTTP routes | independently closed by ses_e53995e40ffeaPe64fTdRaQj87 in the single scoped re-review |
| RV-2-002 | 2 | MINOR | HTTP authorization error mapping | independently closed by ses_e53995e40ffeaPe64fTdRaQj87; sanitized403 and rollback preserved |
| SA-2-001 | 2 | MAJOR | canonical reserved role definition mutations | independently closed by ses_e5398af8cffeUhY28SndLfViJH in the single scoped re-review |
| SA-2-002 | 2 | MINOR | invitation pre-assignment bypass | independently closed by ses_e5398af8cffeUhY28SndLfViJH; admission and old-artifact persistence protected |
