# Findings: Admin Service-Account Invitations

| Finding  | Phase | Severity | Area      | Ruling |
| -------- | ----- | -------- | --------- | ------ |
| SA-1-001 | 1     | MAJOR    | migration | fixed  |
| RV-2-001 | 2 | MAJOR | existing client HTTP routes | independently closed by ses_e53995e40ffeaPe64fTdRaQj87 in the single scoped re-review |
| RV-2-002 | 2 | MINOR | HTTP authorization error mapping | independently closed by ses_e53995e40ffeaPe64fTdRaQj87; sanitized403 and rollback preserved |
| SA-2-001 | 2 | MAJOR | canonical reserved role definition mutations | independently closed by ses_e5398af8cffeUhY28SndLfViJH in the single scoped re-review |
| SA-2-002 | 2 | MINOR | invitation pre-assignment bypass | independently closed by ses_e5398af8cffeUhY28SndLfViJH; admission and old-artifact persistence protected |
| RV-3-001 | 3 | MAJOR | native credential expiry after parent-lock wait | CLOSED by ses_e5193bf83ffeGo3EUvuuetIOfQ on corrected bytes; AR-37 clock_timestamp after independent4-case red; no fix-introduced defect |
| SA-3-001 | 3 | MAJOR | native credential expiry after parent-lock wait | CLOSED by ses_e5193bf82ffekOs3gM1isyENOK; same AR-37 root as RV-3-001; no fix-introduced defect |
| SA-3-002 | 3 | MAJOR | native token expiry after blocked authentication/dispatch | CLOSED by ses_e5193bf82ffekOs3gM1isyENOK; AR-38 trusted-expiry post-wait/final-admission checks after independent2-case red; no fix-introduced defect |
