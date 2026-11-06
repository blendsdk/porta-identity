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
| P4-01 | 4 | CRITICAL | packed evidence assembled after consumer cleanup | fixed in batch; entrypoints captured pre-cleanup; scoped re-review pending |
| P4-02 | 4 | MAJOR | feature journey changed ST-69–73 selector semantics | fixed; journey gated to compatibility, legacy evidence restored |
| P4-03 | 4 | MAJOR | duplicate parser diagnostic/stack in human mode | fixed; executable suppresses repeated YError diagnostic |
| P4-04 | 4 | MAJOR | replay probe mapped non-HTTP errors to401 | fixed; explicit failure markers and execution failure |
| P4-05 | 4 | MAJOR | no pre-revocation control; replay target already pending | fixed; control201/409 and replay denial required |
| P4-06 | 4 | MAJOR | evidence facts hardcoded | fixed; observed client/account/policy/retirement/token/count/user/cleanup |
| P4-07 | 4 | MINOR | cleanup asserted, invitation retained | fixed; delete status checked, invitation removed/verified |
| P4-08 | 4 | MINOR | digest truncation/ignored pending | fixed; exact tab projection incl used_at |
| P4-09 | 4 | MINOR | SDK guards not closed; revoke any2xx | fixed; closed keys/bounds and204 requirement |
| P4-10 | 4 | MINOR | client-id/email local validation gaps | fixed; UUID/dot checks and255 bound |
| P4-11 | 4 | MINOR | parent help omits service-account | fixed |
| P4-12 | 4 | MINOR | formatting churn | fixed |
| SA-4-001 | 4 | CRITICAL | false denial on probe failure | same fix as P4-04 |
| SA-4-002 | 4 | MAJOR | hardcoded security evidence | same fix as P4-06 |
| SA-4-003 | 4 | MAJOR | cleanup claims false/unverified | same fix as P4-07 |
| SA-4-004 | 4 | MAJOR | secrets in child argv/stdout | fixed;0600 files and minimal environment |
| SA-4-005 | 4 | MAJOR | broad TLS exception | fixed; owned endpoint host + owned certificate for probes |
| SA-4-006 | 4 | MAJOR | selector cannot pass after cleanup | same fix as P4-01 |
| SA-4-007 | 4 | MINOR | SQL/fixture/pending observation gaps | fixed; UUID guards, exact projection |
| SA-4-008 | 4 | MINOR | SDK/CLI response extras and revoke status | same fix as P4-09 |
| SA-4-009 | 4 | MINOR | JSON C1/bidi not escaped | pending assessment |
| SA-4-010 | 4 | MINOR | local validation/exit gaps | same fix as P4-10 |
| SA-4-011 | 4 | MINOR | absolute evidence paths | fixed; basenames |
