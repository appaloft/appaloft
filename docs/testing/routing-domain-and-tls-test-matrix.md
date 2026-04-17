# Routing, Domain Binding, And TLS Spec-Driven Test Matrix

## Normative Contract

Tests for routing/domain/TLS must follow the command, event, workflow, error, and async lifecycle specs for:

```text
domain-bindings.create
  -> domain-binding-requested
  -> domain-bindings.confirm-ownership
  -> domain-bound
  -> certificate-requested
  -> certificate-issued | certificate-issuance-failed
  -> domain-ready
```

Tests must distinguish deployment runtime plan access-route snapshots from durable domain binding and certificate lifecycle state.

Workflow-level tests must prove the cross-operation path, not only isolated command success. The
minimal v1 workflow path is:

```text
resource/deployment context exists
  -> domain-bindings.create
  -> domain-bindings.list exposes DNS observation while public DNS is pending or matched
  -> domain-bindings.confirm-ownership
  -> domain-ready when gates pass
  -> deployments.create or redeploy realizes the durable route
  -> resources.list exposes latestDurableDomainRoute
  -> optional proxy e2e reaches the service with Host-header domain routing
```

## Global References

This test matrix inherits:

- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-005: Domain Binding Owner Scope](../decisions/ADR-005-domain-binding-owner-scope.md)
- [ADR-006: Domain Verification Strategy](../decisions/ADR-006-domain-verification-strategy.md)
- [ADR-007: Certificate Provider And Challenge Default](../decisions/ADR-007-certificate-provider-and-challenge-default.md)
- [ADR-008: Renewal Trigger Model](../decisions/ADR-008-renewal-trigger-model.md)
- [ADR-009: Certificates Import Command](../decisions/ADR-009-certificates-import-command.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)

## Test Layers

| Layer | Routing/domain/TLS focus |
| --- | --- |
| Command schema | `domain-bindings.create`, `domain-bindings.confirm-ownership`, and `certificates.issue-or-renew` input validation. |
| Aggregate/state-machine | Domain binding, certificate, and attempt status transitions. |
| Use case/handler | Handler delegates; use case persists state and returns typed `Result`. |
| Event/process manager | Event ordering, idempotency, retry, and async failure state. |
| Provider adapter | DNS/domain verification and certificate provider failure mapping. |
| Runtime adapter | Deployment access-route snapshots remain runtime-plan behavior, not durable binding creation. |
| HTTP adapter | HTTP-01 challenge tokens are served from the injected store and never from Web/static fallback. |
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

| Test ID | Preferred automation | Case | Input | Expected result | Expected error | Expected event | Expected state | Retriable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ROUTE-TLS-CMD-001 | integration | Create binding with TLS auto | Valid context, `domainName`, proxy-capable target, `tlsMode = auto` | `ok({ id })` | None | `domain-binding-requested` | Binding requested/pending verification | No |
| ROUTE-TLS-CMD-002 | integration | Create binding with TLS disabled | Valid context, `tlsMode = disabled` | `ok({ id })` | None | `domain-binding-requested` | Binding requested/pending verification | No |
| ROUTE-TLS-CMD-003 | integration | Create binding with invalid domain | Domain includes scheme, path, or port | `err` | `validation_error`, phase `command-validation` | None | No binding created | No |
| ROUTE-TLS-CMD-004 | integration | Create binding without proxy-capable target | Durable binding requested without an eligible edge proxy provider | `err` | `domain_binding_proxy_required`, phase `domain-binding-admission` | None | No binding created | No |
| ROUTE-TLS-CMD-005 | integration | Duplicate binding | Same normalized domain/path/scope already active | `err` | `conflict`, phase `domain-binding-admission` | None | No duplicate binding | No |
| ROUTE-TLS-CMD-006 | integration | Context mismatch | Resource/server/destination/environment/project mismatch | `err` | `domain_binding_context_mismatch`, phase `context-resolution` | None | No binding created | No |
| ROUTE-TLS-CMD-007 | integration | Confirm manual ownership override | Pending verification attempt with `verificationMode = manual` | `ok({ id, verificationAttemptId })` | None | `domain-bound` | Binding `bound`; attempt `verified`; DNS verifier not called | No |
| ROUTE-TLS-CMD-008 | integration | Confirm missing binding | Unknown `domainBindingId` | `err` | `not_found`, phase `domain-verification` | None | No binding mutation | No |
| ROUTE-TLS-CMD-009 | integration | Confirm with no pending attempt | Binding already failed, ready, or has no pending verification attempt | `err` | `domain_verification_not_pending`, phase `domain-verification` | None | Binding unchanged | No |
| ROUTE-TLS-CMD-010 | integration | Confirm already bound attempt | Same `verificationAttemptId` after previous confirmation | idempotent `ok({ id, verificationAttemptId })` | None | No duplicate `domain-bound` | Binding remains `bound` | No |
| ROUTE-TLS-CMD-016 | integration | Confirm DNS ownership match | Pending verification attempt with default `verificationMode = dns`; verifier observes expected target | `ok({ id, verificationAttemptId })` | None | `domain-bound` | Binding `bound`; attempt `verified`; `dnsObservation.status = matched` with safe observed targets | No |
| ROUTE-TLS-CMD-017 | integration | Confirm DNS ownership mismatch | Pending verification attempt with default `verificationMode = dns`; verifier observes a wrong target | `err` | `domain_ownership_unverified`, phase `domain-verification` | None | Binding remains `pending_verification`; attempt remains `pending`; `dnsObservation.status = mismatch` | No until DNS/config changes |
| ROUTE-TLS-CMD-018 | integration | Confirm DNS lookup failure | Pending verification attempt with default `verificationMode = dns`; verifier cannot complete lookup | `err` | `dns_lookup_failed`, phase `domain-verification` | None | Binding remains `pending_verification`; attempt remains `pending`; `dnsObservation.status = lookup_failed` | Yes |
| ROUTE-TLS-CMD-011 | integration | Issue certificate | Bound domain with TLS auto | `ok({ certificateId, attemptId })` | None | `certificate-requested` | Certificate attempt requested | No |
| ROUTE-TLS-CMD-012 | integration | Issue with injected default certificate provider/challenge | Bound domain with route supporting the injected default; provider omitted | `ok({ certificateId, attemptId })` | None | `certificate-requested` with selected `providerKey = acme`, `challengeType = http-01` | Certificate attempt requested | No |
| ROUTE-TLS-CMD-013 | integration | Issue certificate for missing binding | Unknown `domainBindingId` | `err` | `not_found`, phase `certificate-context-resolution` | None | No certificate attempt | No |
| ROUTE-TLS-CMD-014 | integration | Issue certificate when TLS disabled | Binding TLS disabled | `err` | `certificate_not_allowed`, phase `certificate-admission` | None | No certificate attempt | No |
| ROUTE-TLS-CMD-015 | integration | Duplicate in-flight certificate attempt | Same binding/certificate/reason already issuing | `err` or idempotent `ok` per idempotency key | `certificate_attempt_conflict` when rejected | No duplicate event | No duplicate attempt | No |

## Event Matrix

| Test ID | Preferred automation | Case | Given event | Existing state | Expected result | Expected follow-up event | Expected state | Retriable |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ROUTE-TLS-EVT-001 | integration | Binding requested records manual verification | `domain-binding-requested` | Binding pending verification | `ok` | None until `domain-bindings.confirm-ownership` | Binding remains pending verification | No |
| ROUTE-TLS-EVT-013 | integration | Binding requested records DNS observation expectation | `domain-binding-requested` | Binding pending verification with expected edge target | `ok` | None until DNS observation/confirmation progresses | Binding read model exposes DNS observation `pending` with safe expected target | Yes; DNS propagation is waitable |
| ROUTE-TLS-EVT-002 | integration | Binding requested fails verification | `domain-binding-requested` | Ownership evidence missing | `ok` after recording failure | None | Binding not ready; verification failed | No until DNS/config/evidence changes |
| ROUTE-TLS-EVT-003 | integration | Domain bound with TLS auto | `domain-bound` | Certificate required | `ok` | `certificate-requested` | Certificate attempt requested | No |
| ROUTE-TLS-EVT-004 | integration | Domain bound with TLS disabled | `domain-bound` | Route readiness satisfied; no certificate required | `ok` | `domain-ready` | Binding ready | No |
| ROUTE-TLS-EVT-005 | integration | Certificate requested succeeds | `certificate-requested` | Provider issues cert | `ok` | `certificate-issued` | Certificate active | No |
| ROUTE-TLS-EVT-006 | integration | Certificate requested fails | `certificate-requested` | Provider unavailable | `ok` after recording failure | `certificate-issuance-failed` | Certificate attempt retryable; domain not ready | Yes when transient |
| ROUTE-TLS-EVT-007 | integration | Certificate requested fails validation | `certificate-requested` | HTTP-01 validation fails | `ok` after recording failure | `certificate-issuance-failed` | Certificate attempt failed; domain not ready | No until DNS/route/config changes |
| ROUTE-TLS-EVT-008 | integration | Certificate issued | `certificate-issued` | Domain bound | `ok` | `domain-ready` | Binding ready | No |
| ROUTE-TLS-EVT-009 | integration | Certificate imported | `certificate-imported` | Domain bound; manual certificate policy | `ok` | `domain-ready` | Binding ready | No |
| ROUTE-TLS-EVT-010 | integration | Certificate issuance failed duplicate | Same failed attempt | Attempt already failed | `ok` | None | Remains failed | Retry requires new attempt |
| ROUTE-TLS-EVT-011 | integration | Domain ready duplicate | `domain-ready` repeated | Already ready | `ok` | None | Remains ready | No |
| ROUTE-TLS-EVT-012 | integration | Route realization failed for active binding | `deployment.finished(status = failed)` with route failure phase | Binding is `bound`, `certificate_pending`, or `ready` for the failed resource route | `ok` after durable state update | `domain-route-realization-failed` | Binding moves to `not_ready` with route failure metadata | Yes when provider/runtime marks the route failure retriable |

## Read Model Matrix

| Test ID | Preferred automation | Case | Input | Expected result |
| --- | --- | --- | --- | --- |
| ROUTE-TLS-READMODEL-001 | integration | Ready binding list projection | TLS-disabled binding consumed `domain-bound` and published `domain-ready` | `domain-bindings.list` returns the binding with `status = ready` and one verification attempt |
| ROUTE-TLS-READMODEL-002 | integration | Durable route resource projection | Ready binding exists for resource with latest succeeded reverse-proxy deployment | `resources.list` exposes `accessSummary.latestDurableDomainRoute` using the binding hostname/path/TLS policy and preserves generated access route when present |
| ROUTE-TLS-READMODEL-003 | integration | Bound TLS-auto route stays not ready | TLS-auto binding is `bound` but no certificate is active | `resources.list` does not expose the binding as `latestDurableDomainRoute`; `domain-bindings.list` remains `bound` |
| ROUTE-TLS-READMODEL-004 | integration | Certificate request list projection | `certificates.issue-or-renew` accepted a first issue attempt | `certificates.list` returns certificate `pending`, latest attempt `requested`, and the selected provider/challenge values |
| ROUTE-TLS-READMODEL-005 | integration | Certificate terminal list projection | `certificate-requested` handler recorded issued or failed attempt state | `certificates.list` returns certificate `active` with latest attempt `issued`, expiry/fingerprint metadata when issued, or `failed`/`retry_scheduled` with safe failure metadata when issuance failed |
| ROUTE-TLS-READMODEL-006 | integration | Certificate-backed durable HTTPS route projection | TLS-auto binding consumed `certificate-issued`, published `domain-ready`, and a latest succeeded reverse-proxy deployment exists | `resources.list` exposes `accessSummary.latestDurableDomainRoute` as `https://<domain>` while preserving generated access when present |
| ROUTE-TLS-READMODEL-007 | integration | Route failure binding list projection | Active binding consumed route realization failure and published `domain-route-realization-failed` | `domain-bindings.list` returns `status = not_ready` and safe route failure metadata without exposing provider secrets |
| ROUTE-TLS-READMODEL-008 | integration | DNS pending binding list projection | `domain-bindings.create` accepted a binding before public DNS has converged | `domain-bindings.list` returns `dnsObservation.status = pending`, expected target metadata, and no `domain-bound` implication |
| ROUTE-TLS-READMODEL-009 | integration | DNS matched binding list projection | DNS observer records the expected public target for a pending binding | `domain-bindings.list` returns `dnsObservation.status = matched` with observed targets and keeps ownership confirmation as a separate gate |

## Workflow Matrix

| Test ID | Preferred automation | Case | Input | Expected result |
| --- | --- | --- | --- | --- |
| ROUTE-TLS-WORKFLOW-001 | e2e-preferred | CLI durable domain binding realized on redeploy | CLI creates a deployment context, creates and confirms a TLS-disabled durable binding, then redeploys the resource | The redeployment runtime plan contains the durable domain access route, `domain-bindings.list` reports `ready`, and `resources.list` exposes `latestDurableDomainRoute` for the redeployment |
| ROUTE-TLS-WORKFLOW-002 | e2e-preferred, opt-in Docker | Durable domain reaches service through proxy | Docker/proxy e2e creates and confirms a TLS-disabled durable binding, redeploys the resource, then calls the proxy on `127.0.0.1` with `Host: <domain>` | The proxy returns the deployed service health/body for the durable domain without requiring public DNS registration |
| ROUTE-TLS-WORKFLOW-003 | e2e-preferred | DNS propagation pending is waitable | CLI/API creates a domain binding for a domain whose public DNS has not converged | Binding remains accepted and observable as `pending_verification` with `dnsObservation.status = pending`; deployment replacement and previously serving runtime are not failed only because public DNS is pending |
| ROUTE-TLS-WORKFLOW-004 | integration, opt-in public route | Confirmation-file route proof | Binding has generated route-proof token and edge/proxy can serve the requested host/path | A public request or direct edge-address plus `Host` header request returns the exact token body; proof success is route reachability evidence, not a replacement for DNS observation |

## HTTP Challenge Serving Matrix

| Test ID | Preferred automation | Case | Input | Expected result |
| --- | --- | --- | --- | --- |
| ROUTE-TLS-CHALLENGE-001 | adapter integration | Published HTTP-01 token | Challenge token store contains token and key authorization for the requested host | `GET /.well-known/acme-challenge/{token}` returns `200`, `text/plain`, `no-store`, and the exact key authorization body |
| ROUTE-TLS-CHALLENGE-002 | adapter integration | Missing HTTP-01 token | Challenge route receives an unknown token | Response is `404` and does not return Web/static fallback content |
| ROUTE-TLS-CHALLENGE-003 | adapter integration | Host mismatch | Challenge token exists for another domain | Response is `404`; provider adapters must publish host-scoped entries when host scoping is required |
| ROUTE-TLS-CHALLENGE-004 | adapter integration | Appaloft confirmation file token | Confirmation-file token store contains a token for the requested host/path | `GET /.well-known/appaloft-domain-confirmation/{token}` returns `200`, `text/plain`, `no-store`, and the exact token only for the matching host/path |
| ROUTE-TLS-CHALLENGE-005 | adapter integration | Confirmation file host mismatch | Confirmation-file token exists for another domain | Response is `404`; route proof must be host-scoped and must not fall through to Web/static fallback |

## Certificate Provider Adapter Matrix

| Test ID | Preferred automation | Case | Input | Expected result |
| --- | --- | --- | --- | --- |
| ROUTE-TLS-PROVIDER-001 | provider contract | ACME descriptor | Provider package exports descriptor key `acme` | Descriptor is category `infra-service` and advertises ACME HTTP-01 certificate issuance capabilities |
| ROUTE-TLS-PROVIDER-002 | provider contract | ACME HTTP-01 success | Fake ACME client asks provider callbacks to publish and remove an HTTP-01 challenge | Provider returns certificate material in `CertificateProviderIssueResult`, challenge token is published before validation and removed after completion |
| ROUTE-TLS-PROVIDER-003 | provider contract | Unsupported challenge type | Adapter receives `challengeType != http-01` | Provider returns non-retryable `certificate_challenge_preparation_failed` with phase `challenge-preparation` |
| ROUTE-TLS-PROVIDER-004 | composition integration | ACME disabled by default | Shell runs without ACME certificate-provider configuration | `certificates.issue-or-renew` remains accepted but the worker records retryable `certificate_provider_unavailable`; no live CA call is made |

## Certificate Retry Scheduler Matrix

| Test ID | Preferred automation | Case | Input/state | Expected result |
| --- | --- | --- | --- | --- |
| ROUTE-TLS-SCHED-001 | integration | Due retry-scheduled attempt | Latest certificate attempt is `retry_scheduled` and due | Scheduler dispatches `certificates.issue-or-renew` with the same reason/provider/challenge/certificate id and creates a new attempt id |
| ROUTE-TLS-SCHED-002 | integration | Retry not due | Latest retry-scheduled attempt has future `retryAfter` or default-delay window has not elapsed | Scheduler skips the candidate and creates no new attempt |
| ROUTE-TLS-SCHED-003 | integration | Existing newer in-flight attempt | Certificate has a `requested` or `issuing` attempt after a retry-scheduled failure | Scheduler skips the historical failed attempt |
| ROUTE-TLS-SCHED-004 | integration | Repeated scheduler tick | Scheduler is run twice for the same due failed attempt | Stable idempotency key prevents duplicate retry attempts |
| ROUTE-TLS-SCHED-005 | composition integration | Shell retry scheduler wiring | Shell composition starts the scheduler only when configured for a long-running server process | Scheduler uses application ports/use cases; CLI one-shot commands do not start hidden retry loops |

## Async Failure Matrix

| Test ID | Preferred automation | Failure | Phase | Expected error code | Expected state | Expected event | Retriable |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ROUTE-TLS-ASYNC-001 | integration | DNS ownership missing | `domain-verification` | `domain_ownership_unverified` | Binding not ready | No `domain-bound` | No until DNS/config changes |
| ROUTE-TLS-ASYNC-002 | integration | DNS lookup/provider unavailable | `domain-verification` | `dns_lookup_failed` or provider code | Binding not ready or retry scheduled | No `domain-bound` | Yes when transient |
| ROUTE-TLS-ASYNC-003 | integration | Route realization failed | `route-realization` | `route_realization_failed` | Binding not ready | No `domain-ready` | Yes when transient |
| ROUTE-TLS-ASYNC-004 | integration | Certificate provider unavailable | `provider-request` | `certificate_provider_unavailable` | Attempt retryable | `certificate-issuance-failed` if terminal/retry state persisted | Yes |
| ROUTE-TLS-ASYNC-005 | integration | Certificate challenge failed | `domain-validation` | `certificate_challenge_failed` | Attempt failed; domain not ready | `certificate-issuance-failed` | No until DNS/config changes |
| ROUTE-TLS-ASYNC-006 | integration | Certificate rate limited | `provider-request` | `certificate_rate_limited` | Attempt retry scheduled | `certificate-issuance-failed` | Yes with `retryAfter` |
| ROUTE-TLS-ASYNC-007 | integration | Certificate storage failed | `certificate-storage` | `certificate_storage_failed` | Attempt retryable/unknown | No `certificate-issued` | Yes when storage can recover |
| ROUTE-TLS-ASYNC-008 | integration | Certificate import invalid | `certificate-import-validation` | `certificate_import_invalid` | Manual certificate not attached | No `certificate-imported` | No until certificate material changes |
| ROUTE-TLS-ASYNC-009 | integration | Certificate import storage failed | `certificate-import-storage` | `certificate_import_storage_failed` | Import attempt retryable/unknown | No `certificate-imported` | Yes when storage can recover |
| ROUTE-TLS-ASYNC-010 | integration | Invalid state transition | lifecycle transition | `invariant_violation` | Unchanged | No success event | No |
| ROUTE-TLS-ASYNC-011 | integration | Worker crash before final persistence | `event-consumption` | `retryable_error` | Attempt retryable/unknown | No terminal event | Yes |
| ROUTE-TLS-ASYNC-012 | integration | Public DNS propagation pending | `dns-observation` | None; waitable observation state | Binding remains `pending_verification` or `not_ready` with `dnsObservation.status = pending` | No success event | Yes; next observer tick or user recheck |
| ROUTE-TLS-ASYNC-013 | integration | Public DNS resolves to wrong target | `dns-observation` | None; waitable mismatch observation state | Binding remains `pending_verification` or `not_ready` with `dnsObservation.status = mismatch` and safe observed targets | No success event | Yes after DNS/config changes |

## Deployment Boundary Matrix

| Test ID | Preferred automation | Case | Input | Expected result |
| --- | --- | --- | --- | --- |
| ROUTE-TLS-BOUNDARY-001 | integration | `deployments.create` with `domains` | Deployment command carries domain/TLS fields | Command schema rejects the input; no `DomainBinding` is created. |
| ROUTE-TLS-BOUNDARY-002 | integration | `deployments.create` with edge proxy route fields | Deployment command carries proxy route fields | Command schema rejects the input; no durable domain/certificate state is created. |
| ROUTE-TLS-BOUNDARY-003 | integration | `domain-bindings.create` with same domain | Durable binding command creates binding lifecycle state | Domain event chain starts independently of deployment attempt. |
| ROUTE-TLS-BOUNDARY-004 | integration | Generated default access route | Default access policy resolves a generated hostname | No `DomainBinding` is created unless an explicit command is dispatched. |

## Entry Surface Matrix

| Test ID | Preferred automation | Case | Input | Expected result | Expected error | Expected event | Expected state |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ROUTE-TLS-ENTRY-001 | e2e-preferred | Standalone Web creates binding | User selects project, environment, resource, server, destination, domain, proxy, and TLS from `/domain-bindings` | `ok({ id })` is surfaced as accepted feedback | None | `domain-binding-requested` | Binding appears in domain binding list/read model |
| ROUTE-TLS-ENTRY-002 | e2e-preferred | Resource detail Web creates binding | User opens `/resources/:resourceId`; form preloads current project/environment/resource/destination when available | Same `domain-bindings.create` result as standalone page | None | `domain-binding-requested` | Binding appears in resource-scoped list and standalone list |
| ROUTE-TLS-ENTRY-003 | e2e-preferred | Resource detail missing destination | User opens a resource without a persisted destination and no recent deployment destination | Form requires explicit destination before submit | `validation_error` only if submitted without destination | None before valid submit | No binding created until explicit destination is supplied |
| ROUTE-TLS-ENTRY-004 | e2e-preferred | Resource detail duplicate binding | User submits a duplicate active domain/path for the same resource owner scope | `err` from command | `conflict`, phase `domain-binding-admission` | None | Existing binding remains unchanged |
| ROUTE-TLS-ENTRY-005 | e2e-preferred | CLI creates binding | CLI passes explicit command input | Same command semantics as Web/API | Per command error contract | `domain-binding-requested` on success | Binding appears in read model |
| ROUTE-TLS-ENTRY-006 | e2e-preferred | API creates binding | HTTP/oRPC passes strict command input | Same command semantics as Web/CLI | Per command error contract | `domain-binding-requested` on success | Binding appears in read model |
| ROUTE-TLS-ENTRY-007 | e2e-preferred | Resource detail confirms ownership | User confirms a pending binding from `/resources/:resourceId` | Same `domain-bindings.confirm-ownership` result as API/CLI | Per command error contract | `domain-bound` on success | Binding status becomes `bound` in resource-scoped list |
| ROUTE-TLS-ENTRY-008 | e2e-preferred | Standalone page confirms ownership | User confirms a pending binding from `/domain-bindings` | Same command semantics as resource detail | Per command error contract | `domain-bound` on success | Binding status becomes `bound` in standalone list |
| ROUTE-TLS-ENTRY-009 | e2e-preferred | Generated default access is not a binding | Resource has sslip/default generated access but no custom binding | Generated URL appears in access summary; custom domain binding list remains empty | None | No domain binding event | No `DomainBinding` row is created |
| ROUTE-TLS-ENTRY-010 | e2e-preferred | CLI confirms ownership | CLI passes `domain-binding confirm-ownership <domainBindingId>` after creating a pending binding; tests may use explicit `--verification-mode manual` to avoid public DNS dependency | `ok({ id, verificationAttemptId })` is printed | Per command error contract | `domain-bound` on success | `domain-binding list` shows the binding as `bound` |
| ROUTE-TLS-ENTRY-011 | e2e-preferred | API confirms ownership | HTTP/oRPC posts to `/api/domain-bindings/{domainBindingId}/ownership-confirmations` after creating a pending binding; tests may send `verificationMode = manual` to avoid public DNS dependency | `ok({ id, verificationAttemptId })` response | Per command error contract | `domain-bound` on success | `GET /api/domain-bindings` shows the binding as `bound` |
| ROUTE-TLS-ENTRY-012 | e2e-preferred | CLI observes TLS-disabled ready route | CLI creates a TLS-disabled binding, confirms ownership, then lists resources | `ok({ id, verificationAttemptId })` is printed | Per command error contract | `domain-bound` then `domain-ready` | `resource list` shows `accessSummary.latestDurableDomainRoute.url` for the custom domain |
| ROUTE-TLS-ENTRY-013 | e2e-preferred | CLI requests certificate issuance | CLI creates and confirms a TLS-auto binding, then runs `certificate issue-or-renew` | `ok({ certificateId, attemptId })` is printed | Per command error contract | `certificate-requested`, then `certificate-issuance-failed` when no provider is configured | `certificate list` shows the certificate and latest attempt; in the default shell profile this is `failed`/`retry_scheduled` with `certificate_provider_unavailable` |
| ROUTE-TLS-ENTRY-014 | e2e-preferred | API requests certificate issuance | HTTP/oRPC creates and confirms a TLS-auto binding, then posts `/api/certificates/issue-or-renew` | `ok({ certificateId, attemptId })` response | Per command error contract | `certificate-requested`, then `certificate-issuance-failed` when no provider is configured | `GET /api/certificates` shows the certificate and latest attempt; in the default shell profile this is `failed`/`retry_scheduled` with `certificate_provider_unavailable` |

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

Existing tests cover runtime access-route value objects, runtime plan access routes, concrete proxy labels, proxy bootstrap plan generation, and deployment public health URL derivation.

Current tests also cover `domain-bindings.create` admission, first verification attempt persistence, `domain-binding-requested` event payload, idempotency key reuse, duplicate active owner-scope rejection, `proxyKind = none` rejection, context mismatch rejection, domain/path/proxy/TLS value-object validation, and `domain-bindings.list` query-service read-model output. `proxyKind` assertions are now migration coverage; target tests should assert proxy-capable provider eligibility.

Current tests cover `ROUTE-TLS-EVT-013`, `ROUTE-TLS-READMODEL-008`,
`ROUTE-TLS-READMODEL-009`, and `ROUTE-TLS-WORKFLOW-003` for initial DNS observation persistence,
pending DNS observation read-model visibility, matched DNS observation visibility without treating
DNS match as manual ownership confirmation, and CLI-visible pending DNS propagation before manual
ownership confirmation.

Current Web implementation includes both a standalone `/domain-bindings` surface and a resource-scoped `/resources/:resourceId` surface, but resource-scoped browser/e2e coverage is not implemented yet.

Current tests cover ownership confirmation through `domain-bindings.confirm-ownership`, including
DNS-gated confirmation, explicit manual override, DNS mismatch/lookup-failure rejection,
`domain-bound`, idempotent repeated confirmation, no-pending-attempt rejection, and read-model status
projection. Shell e2e coverage also verifies CLI and HTTP confirmation entrypoints through the public
domain binding list read model.

Current tests cover `ROUTE-TLS-EVT-004`, `ROUTE-TLS-READMODEL-001`,
`ROUTE-TLS-READMODEL-002`, `ROUTE-TLS-READMODEL-003`, and `ROUTE-TLS-ENTRY-012`.

Current tests also cover `ROUTE-TLS-CMD-011`, `ROUTE-TLS-CMD-012`,
`ROUTE-TLS-CMD-013`, `ROUTE-TLS-CMD-014`, `ROUTE-TLS-CMD-015`,
`ROUTE-TLS-READMODEL-004`, `ROUTE-TLS-ENTRY-013`, and `ROUTE-TLS-ENTRY-014` for
certificate request acceptance, injected default provider/challenge resolution, missing-binding
and TLS-disabled rejection, idempotency reuse, public read-model visibility, and CLI/HTTP
entrypoint chains. The shell e2e certificate entrypoint assertions observe the default shell
profile's post-acceptance `certificate_provider_unavailable` state because no real certificate
provider adapter is configured.

Current tests cover `ROUTE-TLS-EVT-005`, `ROUTE-TLS-EVT-006`, and
`ROUTE-TLS-READMODEL-005` for direct `certificate-requested` event handling through injected fake
provider and secret-store ports, including issued state, retryable provider failure state, terminal
events, and public certificate read-model projection.

Current tests also cover `ROUTE-TLS-EVT-008` and `ROUTE-TLS-READMODEL-006` for
`certificate-issued` driven domain readiness and certificate-backed durable HTTPS route projection.

Current route failure tests cover `ROUTE-TLS-EVT-012`, `ROUTE-TLS-READMODEL-007`, and
`ROUTE-TLS-ASYNC-003` for route failure process-manager handling, durable binding `not_ready`
state, and safe read-model projection.

Current workflow tests cover `ROUTE-TLS-WORKFLOW-001` through the default CLI e2e chain. The
`ROUTE-TLS-WORKFLOW-002` proxy reachability test is opt-in through `APPALOFT_E2E_PROXY_DOCKER=true`
because it needs Docker and host ports; it proves routing with a local Host header rather than a
public DNS purchase.

Current tests cover `ROUTE-TLS-CHALLENGE-001`, `ROUTE-TLS-CHALLENGE-002`, and
`ROUTE-TLS-CHALLENGE-003` for HTTP-01 challenge token serving through the HTTP adapter and injected
challenge token store.

Current tests cover `ROUTE-TLS-PROVIDER-001`, `ROUTE-TLS-PROVIDER-002`, and
`ROUTE-TLS-PROVIDER-003` with a fake ACME client boundary, plus existing shell e2e coverage for
`ROUTE-TLS-PROVIDER-004`.

Current edge-proxy provider/runtime tests cover provider-owned proxy reload plans for automatic
Docker-label providers and command-based reload execution/failure through
`EDGE-PROXY-PROVIDER-009` and `EDGE-PROXY-RELOAD-001..003`.

Current certificate retry scheduler tests cover `ROUTE-TLS-SCHED-001..004` for due retry
dispatch, future retry skip, in-flight skip, and repeated-tick idempotency. Shell wiring keeps
long-running timer execution out of CLI one-shot commands.

Current tests do not yet cover live DNS lookup/recheck, DNS-provider verification workflow,
confirmation-file route proof serving, certificate validation failure branches, event replay
handling beyond the create/confirm/domain-ready/certificate-issued baseline, resource-scoped
browser/e2e behavior, renewal-window scheduling, or live CA behavior.

Generated default access routing tests are governed by [Default Access Domain And Proxy Routing Test Matrix](./default-access-domain-and-proxy-routing-test-matrix.md) and must remain separate from durable domain binding readiness tests.

## Open Questions

- None for the current routing/domain/TLS test baseline. DNS verification tests begin with a manual verification fake according to ADR-006, and certificate contract tests assume the injected ADR-007 selection policy returns `acme` with `http-01` in the default shell/test composition. Core and application use cases must not contain ACME-specific default selection.
