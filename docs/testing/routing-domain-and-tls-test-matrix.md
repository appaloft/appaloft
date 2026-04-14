# Routing, Domain Binding, And TLS Spec-Driven Test Matrix

## Normative Contract

Tests for routing/domain/TLS must follow the command, event, workflow, error, and async lifecycle specs for:

```text
domain-bindings.create
  -> domain-binding-requested
  -> domain-bound
  -> certificate-requested
  -> certificate-issued | certificate-issuance-failed
  -> domain-ready
```

Tests must distinguish deployment runtime plan access-route snapshots from durable domain binding and certificate lifecycle state.

## Global References

This test matrix inherits:

- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-005: Domain Binding Owner Scope](../decisions/ADR-005-domain-binding-owner-scope.md)
- [ADR-006: Domain Verification Strategy](../decisions/ADR-006-domain-verification-strategy.md)
- [ADR-007: Certificate Provider And Challenge Default](../decisions/ADR-007-certificate-provider-and-challenge-default.md)
- [ADR-008: Renewal Trigger Model](../decisions/ADR-008-renewal-trigger-model.md)
- [ADR-009: Certificates Import Command](../decisions/ADR-009-certificates-import-command.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)

## Test Layers

| Layer | Routing/domain/TLS focus |
| --- | --- |
| Command schema | `domain-bindings.create` and `certificates.issue-or-renew` input validation. |
| Aggregate/state-machine | Domain binding, certificate, and attempt status transitions. |
| Use case/handler | Handler delegates; use case persists state and returns typed `Result`. |
| Event/process manager | Event ordering, idempotency, retry, and async failure state. |
| Provider adapter | DNS/domain verification and certificate provider failure mapping. |
| Runtime adapter | Deployment access-route snapshots remain runtime-plan behavior, not durable binding creation. |
| Read model | Domain/certificate readiness exposed to UI/CLI/API. |
| Entry workflow | Web/CLI/API differences converge on command semantics; Web covers both standalone and resource-scoped surfaces. |

## Given / When / Then Template

```md
Given:
- Domain binding repository state:
- Certificate repository/attempt state:
- Project/environment/resource/server/destination state:
- DNS verification behavior:
- Certificate provider behavior:
- Existing event/attempt state:

When:
- Dispatch the command or consume the event:

Then:
- Result:
- Error:
- Events:
- Domain binding state:
- Certificate state:
- Retry/idempotency behavior:
```

## Command Matrix

| Case | Input | Expected result | Expected error | Expected event | Expected state | Retriable |
| --- | --- | --- | --- | --- | --- | --- |
| Create binding with TLS auto | Valid context, `domainName`, `proxyKind = traefik`, `tlsMode = auto` | `ok({ id })` | None | `domain-binding-requested` | Binding requested/pending verification | No |
| Create binding with TLS disabled | Valid context, `tlsMode = disabled` | `ok({ id })` | None | `domain-binding-requested` | Binding requested/pending verification | No |
| Create binding with invalid domain | Domain includes scheme, path, or port | `err` | `validation_error`, phase `command-validation` | None | No binding created | No |
| Create binding with `proxyKind = none` | Durable binding requested without proxy | `err` | `domain_binding_proxy_required`, phase `domain-binding-admission` | None | No binding created | No |
| Duplicate binding | Same normalized domain/path/scope already active | `err` | `conflict`, phase `domain-binding-admission` | None | No duplicate binding | No |
| Context mismatch | Resource/server/destination/environment/project mismatch | `err` | `domain_binding_context_mismatch`, phase `context-resolution` | None | No binding created | No |
| Issue certificate | Bound domain with TLS auto | `ok({ certificateId, attemptId })` | None | `certificate-requested` | Certificate attempt requested | No |
| Issue default ACME HTTP-01 certificate | Bound domain with route supporting HTTP-01; provider omitted | `ok({ certificateId, attemptId })` | None | `certificate-requested` with `providerKey = acme`, `challengeType = http-01` | Certificate attempt requested | No |
| Issue certificate for missing binding | Unknown `domainBindingId` | `err` | `not_found`, phase `certificate-context-resolution` | None | No certificate attempt | No |
| Issue certificate when TLS disabled | Binding TLS disabled | `err` | `certificate_not_allowed`, phase `certificate-admission` | None | No certificate attempt | No |
| Duplicate in-flight certificate attempt | Same binding/certificate/reason already issuing | `err` or idempotent `ok` per idempotency key | `conflict` when rejected | No duplicate event | No duplicate attempt | No |

## Event Matrix

| Case | Given event | Existing state | Expected result | Expected follow-up event | Expected state | Retriable |
| --- | --- | --- | --- | --- | --- | --- |
| Binding requested verifies | `domain-binding-requested` | Binding pending verification; DNS ok | `ok` | `domain-bound` | Binding bound | No |
| Binding requested fails verification | `domain-binding-requested` | Ownership evidence missing | `ok` after recording failure | None | Binding not ready; verification failed | No until DNS/config/evidence changes |
| Domain bound with TLS auto | `domain-bound` | Certificate required | `ok` | `certificate-requested` | Certificate attempt requested | No |
| Domain bound with TLS disabled | `domain-bound` | No certificate required | `ok` | `domain-ready` | Binding ready | No |
| Certificate requested succeeds | `certificate-requested` | Provider issues cert | `ok` | `certificate-issued` | Certificate active | No |
| Certificate requested fails | `certificate-requested` | Provider unavailable | `ok` after recording failure | `certificate-issuance-failed` | Certificate attempt retryable; domain not ready | Yes when transient |
| Certificate requested fails validation | `certificate-requested` | HTTP-01 validation fails | `ok` after recording failure | `certificate-issuance-failed` | Certificate attempt failed; domain not ready | No until DNS/route/config changes |
| Certificate issued | `certificate-issued` | Domain bound | `ok` | `domain-ready` | Binding ready | No |
| Certificate imported | `certificate-imported` | Domain bound; manual certificate policy | `ok` | `domain-ready` | Binding ready | No |
| Certificate issuance failed duplicate | Same failed attempt | `ok` | None | Remains failed | Retry requires new attempt |
| Domain ready duplicate | `domain-ready` repeated | Already ready | `ok` | None | Remains ready | No |

## Async Failure Matrix

| Failure | Phase | Expected error code | Expected state | Expected event | Retriable |
| --- | --- | --- | --- | --- | --- |
| DNS ownership missing | `domain-verification` | `domain_ownership_unverified` | Binding not ready | No `domain-bound` | No until DNS/config changes |
| DNS lookup/provider unavailable | `domain-verification` | `dns_lookup_failed` or provider code | Binding not ready or retry scheduled | No `domain-bound` | Yes when transient |
| Route realization failed | `route-realization` | `route_realization_failed` | Binding not ready | No `domain-ready` | Yes when transient |
| Certificate provider unavailable | `provider-request` | `certificate_provider_unavailable` | Attempt retryable | `certificate-issuance-failed` if terminal/retry state persisted | Yes |
| Certificate challenge failed | `domain-validation` | `certificate_challenge_failed` | Attempt failed; domain not ready | `certificate-issuance-failed` | No until DNS/config changes |
| Certificate rate limited | `provider-request` | `certificate_rate_limited` | Attempt retry scheduled | `certificate-issuance-failed` | Yes with `retryAfter` |
| Certificate storage failed | `certificate-storage` | `certificate_storage_failed` | Attempt retryable/unknown | No `certificate-issued` | Yes when storage can recover |
| Certificate import invalid | `certificate-import-validation` | `certificate_import_invalid` | Manual certificate not attached | No `certificate-imported` | No until certificate material changes |
| Certificate import storage failed | `certificate-import-storage` | `certificate_import_storage_failed` | Import attempt retryable/unknown | No `certificate-imported` | Yes when storage can recover |
| Invalid state transition | lifecycle transition | `invariant_violation` | Unchanged | No success event | No |
| Worker crash before final persistence | `event-consumption` | `retryable_error` | Attempt retryable/unknown | No terminal event | Yes |

## Deployment Boundary Matrix

| Case | Input | Expected result |
| --- | --- | --- |
| `deployments.create` with `domains` | Deployment command carries domain/TLS fields | Command schema rejects the input; no `DomainBinding` is created. |
| `deployments.create` with `proxyKind = none` | Deployment command carries proxy route fields | Command schema rejects the input; no durable domain/certificate state is created. |
| `domain-bindings.create` with same domain | Durable binding command creates binding lifecycle state | Domain event chain starts independently of deployment attempt. |

## Entry Surface Matrix

| Case | Input | Expected result | Expected error | Expected event | Expected state |
| --- | --- | --- | --- | --- | --- |
| Standalone Web creates binding | User selects project, environment, resource, server, destination, domain, proxy, and TLS from `/domain-bindings` | `ok({ id })` is surfaced as accepted feedback | None | `domain-binding-requested` | Binding appears in domain binding list/read model |
| Resource detail Web creates binding | User opens `/resources/:resourceId`; form preloads current project/environment/resource/destination when available | Same `domain-bindings.create` result as standalone page | None | `domain-binding-requested` | Binding appears in resource-scoped list and standalone list |
| Resource detail missing destination | User opens a resource without a persisted destination and no recent deployment destination | Form requires explicit destination before submit | `validation_error` only if submitted without destination | None before valid submit | No binding created until explicit destination is supplied |
| Resource detail duplicate binding | User submits a duplicate active domain/path for the same resource owner scope | `err` from command | `conflict`, phase `domain-binding-admission` | None | Existing binding remains unchanged |
| CLI creates binding | CLI passes explicit command input | Same command semantics as Web/API | Per command error contract | `domain-binding-requested` on success | Binding appears in read model |
| API creates binding | HTTP/oRPC passes strict command input | Same command semantics as Web/CLI | Per command error contract | `domain-binding-requested` on success | Binding appears in read model |

## Idempotency Assertions

Tests must prove:

- duplicate domain binding create does not create duplicate active bindings;
- duplicate `domain-binding-requested` does not duplicate verification attempts for the same attempt id;
- duplicate `domain-bound` does not request duplicate certificates for the same binding policy;
- duplicate `certificate-requested` does not create duplicate provider orders for the same attempt;
- duplicate `certificate-issued` does not duplicate `domain-ready`;
- duplicate `certificate-issuance-failed` does not duplicate retry scheduling;
- retry creates a new verification/certificate attempt id.

## Current Implementation Notes And Migration Gaps

Existing tests cover runtime access-route value objects, runtime plan access routes, Traefik/Caddy labels, proxy bootstrap plan generation, and deployment public health URL derivation.

Current tests also cover `domain-bindings.create` admission, first verification attempt persistence, `domain-binding-requested` event payload, idempotency key reuse, duplicate active owner-scope rejection, `proxyKind = none` rejection, context mismatch rejection, domain/path/proxy/TLS value-object validation, and `domain-bindings.list` query-service read-model output.

Current Web implementation includes both a standalone `/domain-bindings` surface and a resource-scoped `/resources/:resourceId` surface, but resource-scoped browser/e2e coverage is not implemented yet.

Current tests do not yet cover the DNS verification workflow, `domain-bound`, certificate issuance, `domain-ready`, event replay handling beyond the create event, resource-scoped browser/e2e behavior, or certificate/domain readiness read-model projection.

## Open Questions

- None for the current routing/domain/TLS test baseline. DNS verification tests begin with a manual verification fake according to ADR-006, and certificate contract tests assume ACME with HTTP-01 according to ADR-007.
