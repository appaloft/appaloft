# certificates.import Spec-Driven Test Matrix

## Normative Contract

Tests for `certificates.import` must prove the manual certificate path without collapsing it into
provider-driven issuance:

```text
domain-bindings.create
  -> domain-bindings.confirm-ownership
  -> certificates.import
  -> certificate-imported
  -> domain-ready, when route readiness is already satisfied or later becomes satisfied
```

The matrix must prove:

- `certificates.import` stays separate from `certificates.issue-or-renew`;
- secret-bearing inputs are validated and stored through secret-safe handling;
- imported certificate success publishes `certificate-imported`, never `certificate-issued`;
- safe metadata and secret references become durable state;
- `domain-ready` evaluation happens only when ownership and route gates are also satisfied.

## Global References

This test matrix inherits:

- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-008: Renewal Trigger Model](../decisions/ADR-008-renewal-trigger-model.md)
- [ADR-009: Certificates Import Command](../decisions/ADR-009-certificates-import-command.md)
- [certificates.import Command Spec](../commands/certificates.import.md)
- [certificate-imported Event Spec](../events/certificate-imported.md)
- [domain-ready Event Spec](../events/domain-ready.md)
- [Routing, Domain Binding, And TLS Workflow Spec](../workflows/routing-domain-and-tls.md)
- [Routing, Domain Binding, And TLS Error Spec](../errors/routing-domain-tls.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)

## Test Layers

| Layer | certificates.import focus |
| --- | --- |
| Command schema | Required binding id and secret-bearing inputs are present and shaped correctly. |
| Validator/domain service | Domain match, key match, not-before, expiry, algorithm, and malformed-chain checks. |
| Use case/handler | Secret-store write, durable state write, event publication, idempotency, and structured error mapping. |
| Event/process manager | `certificate-imported` dedupe and `domain-ready` follow-up behavior. |
| Read model | `certificates.list`, `domain-bindings.list`, and resource access summaries expose only safe metadata/state. |
| Entry workflow | CLI, HTTP/oRPC, and Web resource-scoped surfaces collect secrets safely and converge on one command contract. |

## Command Matrix

| Test ID | Preferred automation | Case | Input | Expected result | Expected error | Expected event | Expected state | Retriable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CERT-IMPORT-CMD-001 | integration | Import valid manual certificate | Bound or ready binding with `certificatePolicy = manual`; valid chain/key/passphrase combination | `ok({ certificateId, attemptId })` | None | `certificate-imported` | Certificate active with `source = imported`; secret refs and safe metadata persisted | No |
| CERT-IMPORT-CMD-002 | integration | Missing required secret-bearing input | Missing chain or private key input | `err` | `validation_error`, phase `command-validation` | None | No certificate import state recorded | No |
| CERT-IMPORT-CMD-003 | integration | Missing binding | Unknown `domainBindingId` | `err` | `not_found`, phase `certificate-context-resolution` | None | No certificate mutation | No |
| CERT-IMPORT-CMD-004 | integration | Binding not manual eligible | Binding `certificatePolicy = auto` or `disabled`, or binding not in a durably owned state | `err` | `certificate_import_not_allowed`, phase `certificate-admission` | None | No imported certificate attached | No |
| CERT-IMPORT-CMD-005 | integration | Certificate domain mismatch | Leaf certificate does not cover bound hostname | `err` | `certificate_import_domain_mismatch`, phase `certificate-import-validation` | None | No imported certificate attached | No |
| CERT-IMPORT-CMD-006 | integration | Private key mismatch | Certificate and key do not match | `err` | `certificate_import_key_mismatch`, phase `certificate-import-validation` | None | No imported certificate attached | No |
| CERT-IMPORT-CMD-007 | integration | Certificate expired | `expiresAt < now` | `err` | `certificate_import_expired`, phase `certificate-import-validation` | None | No imported certificate attached | No |
| CERT-IMPORT-CMD-008 | integration | Certificate not yet valid | `notBefore > now` | `err` | `certificate_import_not_yet_valid`, phase `certificate-import-validation` | None | No imported certificate attached | No |
| CERT-IMPORT-CMD-009 | integration | Unsupported algorithm | Chain/key use disallowed algorithm | `err` | `certificate_import_unsupported_algorithm`, phase `certificate-import-validation` | None | No imported certificate attached | No |
| CERT-IMPORT-CMD-010 | integration | Malformed chain | Chain cannot be parsed into valid leaf/intermediate order | `err` | `certificate_import_malformed_chain`, phase `certificate-import-validation` | None | No imported certificate attached | No |
| CERT-IMPORT-CMD-011 | integration | Idempotent same import | Same binding, same normalized material, same idempotency key | idempotent `ok({ certificateId, attemptId })` | None | No duplicate `certificate-imported` | Same certificate and attempt identity are reused | No |
| CERT-IMPORT-CMD-012 | integration | Conflicting idempotency reuse | Same idempotency key but different binding or different material | `err` | `conflict`, phase `certificate-admission` | None | No conflicting import succeeds | No |
| CERT-IMPORT-CMD-013 | integration | Secret-store failure before success | Secret store rejects chain/key/passphrase write | `err` | `certificate_import_storage_failed`, phase `certificate-import-storage` | None | No success event; no secret-bearing state attached | Yes |
| CERT-IMPORT-CMD-014 | integration | Import never publishes provider-issued success | Valid manual import | `ok({ certificateId, attemptId })` | None | `certificate-imported` only | No `certificate-issued` for the import attempt | No |

## Event Matrix

| Test ID | Preferred automation | Case | Given event | Existing state | Expected result | Expected follow-up event | Expected state | Retriable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CERT-IMPORT-EVT-001 | integration | Imported certificate makes bound route ready | `certificate-imported` | Binding is `bound`, manual policy, route readiness already satisfied | `ok` | `domain-ready` | Binding moves to `ready` | No |
| CERT-IMPORT-EVT-002 | integration | Imported certificate waits for route readiness | `certificate-imported` | Binding is `bound`, manual policy, route readiness not yet satisfied | `ok` | None | Certificate active imported; binding remains `bound` or `not_ready` until route gate later succeeds | No |
| CERT-IMPORT-EVT-003 | integration | Duplicate imported event | Same `certificate-imported` repeated | Certificate already active imported | `ok` | No duplicate `domain-ready` | State remains unchanged | No |

## Read Model Matrix

| Test ID | Preferred automation | Case | Input | Expected result |
| --- | --- | --- | --- | --- |
| CERT-IMPORT-READMODEL-001 | integration | Imported certificate list projection | Successful manual import | `certificates.list` returns `source = imported`, safe metadata, latest import attempt id, and no raw PEM/passphrase/private key material |
| CERT-IMPORT-READMODEL-002 | integration | Imported certificate drives ready route projection | Manual import succeeded and binding later becomes ready | `resources.list` exposes `accessSummary.latestDurableDomainRoute` as HTTPS for the manual domain while preserving generated access visibility when present |
| CERT-IMPORT-READMODEL-003 | integration | Manual import does not fake provider issuance | Successful manual import | `certificates.list` and related projections do not classify the certificate as provider-issued and do not require a `providerKey` or `challengeType` payload to render state |

## Entry Surface Matrix

| Test ID | Preferred automation | Case | Input | Expected result | Expected error | Expected event | Expected state |
| --- | --- | --- | --- | --- | --- | --- | --- |
| CERT-IMPORT-ENTRY-001 | e2e-preferred | CLI imports manual certificate | CLI targets a bound manual-policy binding and supplies chain/key/passphrase through secret-safe input | `ok({ certificateId, attemptId })` is printed without secret echo | Per command error contract | `certificate-imported` | `certificate list` shows imported safe metadata only |
| CERT-IMPORT-ENTRY-002 | e2e-preferred | API imports manual certificate | HTTP/oRPC posts the same command schema through secure transport handling | `ok({ certificateId, attemptId })` response | Per command error contract | `certificate-imported` | `GET /api/certificates` shows imported safe metadata only |
| CERT-IMPORT-ENTRY-003 | e2e-preferred | Resource-scoped Web imports manual certificate | User opens a manual-policy bound binding from the resource-scoped surface and pastes or uploads chain/key/passphrase | Accepted success is shown without secret echo | Per command error contract | `certificate-imported` | Resource/domain status surfaces show imported state and later ready state when gates pass |
| CERT-IMPORT-ENTRY-004 | integration | Web does not offer import for ineligible binding | Binding is `auto`, `disabled`, or not yet owned | No submit path is offered, or submit is rejected by the same command contract | `certificate_import_not_allowed` if a forced submit occurs | None | No imported certificate state is created |

## Boundary Matrix

| Test ID | Preferred automation | Case | Input | Expected result |
| --- | --- | --- | --- | --- |
| CERT-IMPORT-BOUNDARY-001 | integration | Import does not trigger provider request flow | Successful manual import | No `certificate-requested` is published; provider worker is not called |
| CERT-IMPORT-BOUNDARY-002 | integration | Provider issue command does not accept raw import material | `certificates.issue-or-renew` receives raw chain/key/passphrase fields | Command schema rejects or ignores unsupported fields according to the operation contract; no manual import side path exists |

## Assertions

Tests must assert:

- `Result` shape and structured error fields;
- `error.code`, `phase`, and `retriable`;
- `certificateId` and `attemptId` on success;
- no secret-bearing material in events, errors, CLI output, HTTP responses, or read models;
- `certificate-imported` publication on success;
- absence of `certificate-issued` for import success.

## Current Implementation Notes And Migration Gaps

Application-level command/event coverage, CLI/API e2e coverage, resource-scoped Web Bun.WebView
coverage, and PG/PGlite-backed durable secret persistence coverage now exist for the implemented
manual import path.

The current matrix has no contract-blocking migration gaps for `certificates.import`.

Provider-driven certificate tests continue to live under
[Routing, Domain Binding, And TLS Spec-Driven Test Matrix](./routing-domain-and-tls-test-matrix.md).

## Open Questions

- None for the current `certificates.import` test baseline. Command separation is governed by
  ADR-009 and readiness timing is governed by the routing/domain/TLS workflow spec.
