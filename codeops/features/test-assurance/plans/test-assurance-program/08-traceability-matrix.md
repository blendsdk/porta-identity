# Exact Must Traceability: Porta Test Assurance Program

> **Parent**: [Plan Index](00-index.md)
> **Authority**: Seed for `test-harness/assurance/traceability.json`
> **Rule**: Every row is one exact `requirement → specification → task → claim` edge set

The claim IDs below are stable catalog records, not wildcards. A requirement may have several
specification cases or tasks. Closed ranges are inclusive shorthand expanded to individual IDs by
the Phase 1 validator; alphanumeric endpoints use the testing-strategy order. The validator loads
the owning RDs, this seed, test registry, execution plan, and claim catalog, then rejects a missing
Must, source mismatch, dangling ID, or unregistered extra edge.

| Requirement | Specification cases        | Execution tasks                          | Claim ID    |
| ----------- | -------------------------- | ---------------------------------------- | ----------- |
| R1.1        | ST-01                      | 1.1, 1.5, 1.7                            | CLAIM-R1-01 |
| R1.2        | ST-08A                     | 1.5, 1.7                                 | CLAIM-R1-02 |
| R1.3        | ST-03                      | 1.1, 1.5, 1.7                            | CLAIM-R1-03 |
| R1.4        | ST-08B                     | 1.5, 1.7                                 | CLAIM-R1-04 |
| R1.5        | ST-07                      | 1.6–1.8                                  | CLAIM-R1-05 |
| R1.6        | ST-08C                     | 1.5, 1.7                                 | CLAIM-R1-06 |
| R1.7        | ST-08                      | 1.5, 1.7                                 | CLAIM-R1-07 |
| R1.8        | ST-05                      | 1.5, 1.7                                 | CLAIM-R1-08 |
| R1.9        | ST-06                      | 1.5, 1.7                                 | CLAIM-R1-09 |
| R1.10       | ST-02, ST-04               | 1.5, 1.7, 11.1                           | CLAIM-R1-10 |
| R2.1        | ST-18C                     | 3.2, 3.6, 3.8                            | CLAIM-R2-01 |
| R2.2        | ST-17                      | 3.2, 3.6, 3.8                            | CLAIM-R2-02 |
| R2.3        | ST-12, ST-18A              | 2.1, 2.4–2.5, 2.8                        | CLAIM-R2-03 |
| R2.4        | ST-09, ST-10, ST-18B       | 2.2, 2.6–2.8                             | CLAIM-R2-04 |
| R2.5        | ST-09–ST-11                | 2.1–2.3, 2.8                             | CLAIM-R2-05 |
| R2.6        | ST-13, ST-14               | 3.1, 3.4–3.5, 3.8                        | CLAIM-R2-06 |
| R2.7        | ST-13                      | 3.1, 3.4–3.5, 3.8                        | CLAIM-R2-07 |
| R2.8        | ST-13A, ST-45              | 3.1, 3.4–3.5, 3.7–3.8, 8.7               | CLAIM-R2-08 |
| R2.9        | ST-15                      | 3.2, 3.6, 3.8                            | CLAIM-R2-09 |
| R2.10       | ST-14, ST-16               | 3.2, 3.5, 3.8                            | CLAIM-R2-10 |
| R2.11       | ST-18                      | 3.2, 3.8                                 | CLAIM-R2-11 |
| R2.12       | ST-18D                     | 1.6–1.8, 2.8, 10.8                       | CLAIM-R2-12 |
| R3.1        | ST-19                      | 4.1, 4.4–4.8                             | CLAIM-R3-01 |
| R3.2        | ST-20                      | 4.1, 4.4, 4.7–4.8                        | CLAIM-R3-02 |
| R3.3        | ST-21, ST-22               | 4.1, 4.5–4.8                             | CLAIM-R3-03 |
| R3.4        | ST-27                      | 4.1, 4.7–4.8                             | CLAIM-R3-04 |
| R3.5        | ST-22, ST-27               | 4.1, 4.5, 4.7                            | CLAIM-R3-05 |
| R3.6        | ST-19, ST-21               | 4.1, 4.5–4.8                             | CLAIM-R3-06 |
| R3.7        | ST-23, ST-24               | 4.1, 4.8                                 | CLAIM-R3-07 |
| R3.8        | ST-25, ST-26, ST-27A       | 10.7–10.8                                | CLAIM-R3-08 |
| R3.9        | ST-27A                     | 10.7–10.8                                | CLAIM-R3-09 |
| R3.10       | ST-77                      | 4.4, 4.8, 10.8                           | CLAIM-R3-10 |
| R4.1        | ST-08D                     | 1.5, 6.1–6.12, 7.1–9.10                  | CLAIM-R4-01 |
| R4.2        | ST-63A                     | 6.4, 7.4, 8.6, 9.5, 11.1                 | CLAIM-R4-02 |
| R4.3        | ST-08E                     | 1.1, 1.7, 3.2, 3.6                       | CLAIM-R4-03 |
| R4.4        | ST-69, ST-73               | 5.5–5.8, 5.10–5.11                       | CLAIM-R4-04 |
| R4.5        | ST-69, ST-73               | 5.5–5.8, 5.10–5.11                       | CLAIM-R4-05 |
| R4.6        | ST-70                      | 5.10, 6.6–6.7, 7.5, 9.6                  | CLAIM-R4-06 |
| R4.7        | ST-71                      | 5.10, 6.6–6.7, 7.5, 9.6                  | CLAIM-R4-07 |
| R4.8        | ST-72                      | 5.5–5.10                                 | CLAIM-R4-08 |
| R4.9        | ST-70, ST-71               | 5.10, 6.6–6.7, 7.5, 9.6                  | CLAIM-R4-09 |
| R4.10       | ST-69–ST-73                | 5.5–5.11, 11.1                           | CLAIM-R4-10 |
| R4.11       | ST-70, ST-71               | 5.10, 6.6–6.7, 7.5, 9.6                  | CLAIM-R4-11 |
| R5.1        | ST-63C                     | 6.1–6.12, 7.1–9.10                       | CLAIM-R5-01 |
| R5.2        | ST-56, ST-58, ST-60, ST-63 | 6.1–6.12, 7.1–9.10                       | CLAIM-R5-02 |
| R5.3        | ST-28–ST-32, ST-40         | 6.1–6.12, 7.2, 7.9                       | CLAIM-R5-03 |
| R5.4        | ST-33–ST-35, ST-41         | 7.1–7.9                                  | CLAIM-R5-04 |
| R5.5        | ST-36–ST-41                | 7.1–7.9                                  | CLAIM-R5-05 |
| R5.6        | ST-42–ST-45                | 8.1–8.9                                  | CLAIM-R5-06 |
| R5.7        | ST-46–ST-51                | 8.2–8.9                                  | CLAIM-R5-07 |
| R5.8        | ST-52–ST-56                | 9.2, 9.5–9.10                            | CLAIM-R5-08 |
| R5.9        | ST-57–ST-62                | 9.1, 9.3–9.10                            | CLAIM-R5-09 |
| R5.10       | ST-63                      | 1.5, 6.1, 7.1, 8.2, 9.2–9.3              | CLAIM-R5-10 |
| R5.11       | ST-52–ST-54                | 9.2, 9.6–9.10                            | CLAIM-R5-11 |
| R5.12       | ST-34, ST-39, ST-48–ST-51  | 7.2–7.9, 8.3–8.9                         | CLAIM-R5-12 |
| R5.13       | ST-63A                     | 6.4, 6.12, 7.4, 7.9, 8.6, 8.9, 9.5, 9.10 | CLAIM-R5-13 |
| R5.14       | ST-63B                     | 1.5, 6.4–6.12, 7.4–7.9, 8.6–8.9, 9.5–9.10 | CLAIM-R5-14 |
| R5.17       | ST-52–ST-54, ST-57–ST-61, ST-63 | 9.1–9.10                             | CLAIM-R5-17 |
| R6.1        | ST-64, ST-66               | 5.1–5.4, 5.10                            | CLAIM-R6-01 |
| R6.2        | ST-68                      | 5.1–5.4, 5.10–5.11                       | CLAIM-R6-02 |
| R6.3        | ST-64–ST-68                | 5.1–5.4, 5.10–5.11                       | CLAIM-R6-03 |
| R6.4        | ST-66                      | 5.1–5.4, 6.9–6.11, 7.8, 8.8, 9.9         | CLAIM-R6-04 |
| R6.5        | ST-66, ST-67               | 6.9–6.11, 7.8, 8.8, 9.9, 10.1            | CLAIM-R6-05 |
| R6.6        | ST-66                      | 6.4, 6.9–6.11, 7.4, 7.8, 8.6, 8.8, 9.5, 9.9 | CLAIM-R6-06 |
| R6.7        | ST-68A                     | 10.1–10.2                                | CLAIM-R6-07 |
| R6.8        | ST-67                      | 5.3–5.4, 10.1–10.2                       | CLAIM-R6-08 |
| R6.9        | ST-66, ST-67               | 5.4, 10.1–10.2                           | CLAIM-R6-09 |
| R6.10       | ST-68                      | 5.3–5.4, 5.10–5.11, 10.1                 | CLAIM-R6-10 |
| R7.1        | ST-79                      | 1.4, 11.1                                | CLAIM-R7-01 |
| R7.2        | ST-79                      | 11.1                                     | CLAIM-R7-02 |
| R7.3        | ST-78                      | 1.1–1.7, 10.8                            | CLAIM-R7-03 |
| R7.4        | ST-66                      | 5.1–5.4, 6.4–6.12, 7.1–9.9               | CLAIM-R7-04 |
| R7.5        | ST-74                      | 10.5–10.6                                | CLAIM-R7-05 |
| R7.6        | ST-79                      | 11.1                                     | CLAIM-R7-06 |
| R7.7        | ST-75                      | 1.4, 10.3–10.4                           | CLAIM-R7-07 |
| R7.8        | ST-77                      | 10.7–10.8, 11.1                          | CLAIM-R7-08 |
| R7.9        | ST-77                      | 1.6–1.8, 10.8, 11.1                      | CLAIM-R7-09 |
| R7.10       | ST-18A, ST-75, ST-76       | 1.4, 2.4–2.8, 10.3–10.4                  | CLAIM-R7-10 |
| R7.11       | ST-78                      | 1.5, 10.7–10.8                           | CLAIM-R7-11 |
| R7.12       | ST-79                      | 11.1                                     | CLAIM-R7-12 |

The mappings above establish ownership, not completion. For Phase 7, ST-35 consent substitution,
ST-40 JWKS-key separation, ST-41 consent/logout/client-context, and the affected R5.2 log/recovery/
side-effect edges are incomplete under DEF-6 and cannot close CLAIM-R5-02/03/04/05.
