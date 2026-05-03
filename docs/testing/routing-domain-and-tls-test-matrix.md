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

Pure CLI/SSH `access.domains[]` server-applied routes are also distinct from durable managed domain
bindings. They are tested primarily through the deployment config and edge proxy matrices unless a
hosted/self-hosted control-plane mode maps the same intent into `domain-bindings.create`.
Canonical redirect aliases in pure CLI/SSH mode are also tested through those matrices; they must
not be inferred as managed domain ownership or certificate lifecycle.

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
- [ADR-024: Pure CLI SSH State And Server-Applied Domains](../decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md)
- [certificates.import Test Matrix](./certificates.import-test-matrix.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Quick Deploy Workflow Spec](../workflows/quick-deploy.md)
- [Repository Deployment Config File Bootstrap](../workflows/deployment-config-file-bootstrap.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)

## Test Layers

| Layer | Routing/domain/TLS focus |
| --- | --- |
| Command schema | `domain-bindings.create`, `domain-bindings.confirm-ownership`, `certificates.issue-or-renew`, and `certificates.import` input validation. |
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
| ROUTE-TLS-CMD-019 | integration | Import manual certificate | Bound or ready binding with `certificatePolicy = manual`; valid chain/key/passphrase | `ok({ certificateId, attemptId })` | None | `certificate-imported` | Certificate active with `source = imported`; no `certificate-issued` | No |
| ROUTE-TLS-CMD-020 | integration | Import certificate not allowed | Binding is not manual-policy eligible or not durably owned | `err` | `certificate_import_not_allowed`, phase `certificate-admission` | None | No imported certificate attached | No |
| ROUTE-TLS-CMD-021 | integration | Configure domain binding route behavior | Active binding and optional served canonical target in the same owner/path scope | `ok({ id })` | None | `domain-binding-route-configured` when changed | Binding route behavior switches between serve and redirect without deployment/certificate side effects | No |
| ROUTE-TLS-CMD-022 | integration | Delete domain binding safely | Binding has no active certificate blockers and exact id confirmation is supplied | `ok({ id })` | None | `domain-binding-deleted` | Binding becomes inactive/deleted; generated access, deployment snapshots, certificate history, and server-applied audit remain | No |
| ROUTE-TLS-CMD-023 | integration | Retry ownership verification | Binding is pending verification or not ready after DNS/evidence changes | `ok({ id, verificationAttemptId })` | None | `domain-binding-verification-retried` | New verification attempt exists; old attempts remain historical; no certificate retry is dispatched | No |
| ROUTE-TLS-CMD-024 | integration | Show certificate | Provider-issued or imported certificate exists | `ok(CertificateSummary)` | None | None | Safe metadata and attempt history are returned without secret material | No |
| ROUTE-TLS-CMD-025 | integration | Retry provider-issued certificate | Managed certificate latest attempt is `retry_scheduled` and retryable | `ok({ certificateId, attemptId })` | None | `certificate-requested` | New attempt exists; previous failed attempt remains historical | No |
| ROUTE-TLS-CMD-026 | integration | Retry imported certificate rejected | Certificate `source = imported` | `err` | `certificate_retry_not_allowed`, phase `certificate-admission` | None | Certificate unchanged; operator must run `certificates.import` with replacement material | No |
| ROUTE-TLS-CMD-027 | integration | Revoke provider-issued certificate | Active managed certificate exists and provider revocation boundary succeeds or is hermetically supported | `ok({ certificateId })` | None | `certificate-revoked` | Certificate status becomes `revoked`; no secret material is exposed | Conditional provider failures are retriable |
| ROUTE-TLS-CMD-028 | integration | Revoke imported certificate | Active imported certificate exists | `ok({ certificateId })` | None | `certificate-revoked` | Certificate status becomes `revoked` with Appaloft-local revocation; provider revocation is not called | No |
| ROUTE-TLS-CMD-029 | integration | Delete non-active certificate | Certificate is revoked, failed, expired, disabled, or already non-active and exact id confirmation is supplied | `ok({ certificateId })` | None | `certificate-deleted` | Certificate status becomes `deleted`; safe audit history remains | No |
| ROUTE-TLS-CMD-030 | integration | Delete active certificate rejected | Certificate is active | `err` | `certificate_delete_not_allowed`, phase `certificate-delete` | None | Certificate remains active; no implicit revoke occurs | No |
| DMBH-DOMAIN-001 | unit + integration | Domain binding owns certificate and ready gates | Binding status, TLS mode, and certificate policy vary across bound, certificate-pending, ready, not-ready, TLS-disabled, manual, auto, and disabled-policy cases | Certificate and ready callers ask `DomainBinding` intention methods | Same errors/events/state as the existing command/event rows | No new event | Public behavior unchanged; only behavior placement changes | No |
| DMBH-DOMAIN-002 | unit + integration | Domain binding owns canonical redirect target and route admission value behavior | Served and redirect bindings are evaluated during route configuration; proxy kind and redirect values vary | Route configuration callers ask `DomainBinding` whether a target can serve redirects; the aggregate composes VO predicates/equality for proxy, self-redirect, and change detection | Same errors/events/state as `ROUTE-TLS-CMD-021` and redirect entry rows | No new event | Public behavior unchanged; only behavior placement changes | No |
| DMBH-DOMAIN-003 | unit + integration | Domain binding owns ownership-confirmation attempt selection | Binding has explicit, latest pending, already verified, or non-pending verification attempts | Ownership confirmation callers ask `DomainBinding` for confirmation intent and DNS verification context | Same errors/events/state as `ROUTE-TLS-CMD-007`, `ROUTE-TLS-CMD-010`, and `ROUTE-TLS-CMD-016` | No new event | Public behavior unchanged; only behavior placement changes | No |
| DMBH-CONTEXT-002 | unit + integration | Domain binding creation uses aggregate context ownership | Environment, resource, destination, and server context ids are resolved for binding creation | The use case asks `Environment`, `Resource`, and `Destination` ownership methods instead of peeling ids from aggregate state | Same errors/events/state as `ROUTE-TLS-CMD-006` | No new event | Public behavior unchanged; only behavior placement changes | No |
| DMBH-CERT-001 | unit + integration | Certificate owns attempt worker selection | Certificate attempts are requested, issuing, issued, failed, retry-scheduled, or missing | Certificate-requested worker asks `Certificate` to claim or skip the attempt and to provide issue context | Same errors/events/state as `ROUTE-TLS-EVT-005`, `ROUTE-TLS-EVT-006`, `ROUTE-TLS-EVT-007`, and `ROUTE-TLS-EVT-010` | No new event | Public behavior unchanged; only behavior placement changes | No |

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
| ROUTE-TLS-EVT-014 | integration | Route realization retry succeeds for TLS-disabled binding | `deployment.finished(status = succeeded)` after a route failure | TLS-disabled binding is `not_ready` for the same resource route | `ok` after durable state update | `domain-ready` | Binding moves to `ready` and clears route failure metadata | No |
| ROUTE-TLS-EVT-015 | integration | Certificate revoked | `certificate-revoked` | Certificate was active for a binding | `ok` | None | Certificate read model shows `revoked`; resource/domain TLS readiness no longer uses it for new route realization | No |
| ROUTE-TLS-EVT-016 | integration | Certificate deleted | `certificate-deleted` | Certificate was non-active | `ok` | None | Certificate readback/list reflects deleted visible lifecycle while audit history remains safe | No |

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
| ROUTE-TLS-READMODEL-010 | integration | Imported certificate projection | `certificates.import` succeeded for a manual-policy binding | `certificates.list` returns `source = imported`, safe metadata, latest import attempt id, and no raw certificate/key/passphrase material |
| ROUTE-TLS-READMODEL-011 | integration | Domain binding show readback | Binding has access summary, selected route descriptor, DNS/route status, and certificate context | `domain-bindings.show` returns binding ownership, route readiness, generated access fallback, proxy readiness, selected/context route descriptors, delete safety, and read-only certificate readiness |
| ROUTE-TLS-READMODEL-012 | integration | Domain binding delete safety | Binding has active certificate state or historical certificate attempts | `domain-bindings.delete-check` blocks active certificate state and warns on historical certificate attempts without mutating state |
| ROUTE-TLS-READMODEL-013 | integration | Certificate show readback | Provider-issued and imported certificates exist | `certificates.show` returns safe metadata, status, source, latest attempt, and attempt history without PEM, private key, passphrase, secret refs, or provider credentials |
| ROUTE-TLS-READMODEL-014 | integration | Revoked/deleted certificate projection | Certificate was revoked or deleted | `certificates.show` and `certificates.list` expose the lifecycle state needed for audit and follow-up without treating the certificate as active TLS material |
| ROUTE-TLS-READMODEL-015 | integration | Domain binding show route/access parity | A binding's resource access summary has durable, server-applied, generated, proxy readiness, and optional generated fallback context | `domain-bindings.show` returns selected/context route descriptors, generated access fallback, proxy readiness, certificate context, and delete safety using the same shared route/access vocabulary as `ResourceAccessSummary` | Selected durable route wins, server-applied/generated routes remain context, and no provider raw payload or secret material is exposed. |

## Workflow Matrix

| Test ID | Preferred automation | Case | Input | Expected result |
| --- | --- | --- | --- | --- |
| ROUTE-TLS-WORKFLOW-001 | e2e-preferred | CLI durable domain binding realized on redeploy | CLI creates a deployment context, creates and confirms a TLS-disabled durable binding, then redeploys the resource | The redeployment runtime plan contains the durable domain access route, `domain-bindings.list` reports `ready`, and `resources.list` exposes `latestDurableDomainRoute` for the redeployment |
| ROUTE-TLS-WORKFLOW-002 | e2e-preferred, opt-in Docker | Durable domain reaches service through proxy | Docker/proxy e2e creates and confirms a TLS-disabled durable binding, redeploys the resource, then calls the proxy on `127.0.0.1` with `Host: <domain>` | The proxy returns the deployed service health/body for the durable domain without requiring public DNS registration |
| ROUTE-TLS-WORKFLOW-003 | e2e-preferred | DNS propagation pending is waitable | CLI/API creates a domain binding for a domain whose public DNS has not converged | Binding remains accepted and observable as `pending_verification` with `dnsObservation.status = pending`; deployment replacement and previously serving runtime are not failed only because public DNS is pending |
| ROUTE-TLS-WORKFLOW-004 | integration, opt-in public route | Confirmation-file route proof | Binding has generated route-proof token and edge/proxy can serve the requested host/path | A public request or direct edge-address plus `Host` header request returns the exact token body; proof success is route reachability evidence, not a replacement for DNS observation |
| ROUTE-TLS-WORKFLOW-005 | e2e-preferred | Manual certificate policy reaches ready state through import | CLI/API creates a manual-policy binding, confirms ownership, imports a valid certificate, and then lists certificates/resources | `certificate-imported` is recorded, `domain-ready` follows when route gates are satisfied, and read models show HTTPS readiness without any `certificate-issued` event |

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
| ROUTE-TLS-ASYNC-008 | integration | Certificate import validation failed | `certificate-import-validation` | `certificate_import_domain_mismatch` or `certificate_import_key_mismatch` or `certificate_import_expired` or `certificate_import_not_yet_valid` or `certificate_import_unsupported_algorithm` or `certificate_import_malformed_chain` | Manual certificate not attached | No `certificate-imported` | No until certificate material changes |
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
| ROUTE-TLS-BOUNDARY-005 | integration | Server-applied config domain route | Pure CLI/SSH config deploy applies `access.domains[]` through target proxy state | No managed `DomainBinding` or `Certificate` aggregate is created; route state is target-local until a control-plane adoption flow maps it explicitly. |
| ROUTE-TLS-BOUNDARY-006 | integration | Server-applied canonical redirect alias | Pure CLI/SSH config deploy applies `redirectTo` alias route state through target proxy state | No managed `DomainBinding`, `Certificate`, or route-ownership aggregate is created for the alias; route state is target-local until a control-plane adoption flow maps it explicitly. |
| ROUTE-TLS-BOUNDARY-007 | integration | Domain binding delete does not revoke/delete certificate | Active certificate is attached to a domain binding | `domain-bindings.delete` is attempted | Delete is blocked by active certificate state; no `certificate-revoked` or `certificate-deleted` event is recorded. |

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
| ROUTE-TLS-ENTRY-015 | e2e-preferred | Quick Deploy or config managed handoff | Quick Deploy, a config-aware local agent, or a headless executor runs in hosted/self-hosted control-plane mode with trusted resource/server/destination context and accepted managed domain/TLS intent | Executor dispatches `domain-bindings.create` as a separate command with explicit input; no domain/TLS fields are sent to `deployments.create` | Per command error contract | `domain-binding-requested` on success | Binding appears in the same read models as CLI/API/Web-created bindings |
| ROUTE-TLS-ENTRY-016 | e2e-preferred | Managed canonical redirect binding | Web/API/CLI creates a served binding, then creates another binding with `redirectTo` and optional `redirectStatus` for the same owner/path scope | `domain-bindings.create` accepts the redirect alias, list/read models expose redirect metadata, and redeploy planning realizes a redirect route beside the served route | None | `domain-binding-requested` includes redirect metadata | Redirect binding remains a managed `DomainBinding` with normal ownership/DNS/TLS lifecycle |
| ROUTE-TLS-ENTRY-017 | integration | Managed canonical redirect target missing | Web/API/CLI submits `redirectTo` without an existing served target binding in the same owner/path scope | Command rejects before persistence | `validation_error`, phase `domain-binding-admission` | None | No redirect binding is created |
| ROUTE-TLS-ENTRY-018 | e2e-preferred | CLI imports manual certificate | CLI targets a bound manual-policy binding and supplies chain/key/passphrase through secret-safe input | `ok({ certificateId, attemptId })` is printed without secret echo | Per command error contract | `certificate-imported` | `certificate list` shows imported safe metadata only |
| ROUTE-TLS-ENTRY-019 | e2e-preferred | API imports manual certificate | HTTP/oRPC posts the same command schema through secure transport handling | `ok({ certificateId, attemptId })` response | Per command error contract | `certificate-imported` | `GET /api/certificates` shows imported safe metadata only |
| ROUTE-TLS-ENTRY-020 | e2e-preferred | Resource-scoped Web imports manual certificate | User opens a manual-policy bound binding from the resource-scoped surface and pastes or uploads chain/key/passphrase | Accepted success is shown without secret echo | Per command error contract | `certificate-imported` | Resource/domain status surfaces show imported state and later ready state when gates pass |
| ROUTE-TLS-ENTRY-021 | e2e-preferred | CLI/API shows one binding | CLI/API reads `domain-bindings.show` after a binding exists | Shared readback includes ownership, route/proxy/readiness, generated fallback, certificate context, and delete safety | Per query error contract | None | No mutation |
| ROUTE-TLS-ENTRY-022 | e2e-preferred | CLI/API configures route behavior | CLI/API runs `domain-bindings.configure-route` with redirect target or clears redirect target | Same command semantics across surfaces | Per command error contract | `domain-binding-route-configured` when changed | Binding route behavior changes without certificate/deployment side effects |
| ROUTE-TLS-ENTRY-023 | e2e-preferred | CLI/API checks delete safety | CLI/API runs `domain-bindings.delete-check` | Same safety blockers/warnings across surfaces | Per query error contract | None | No mutation |
| ROUTE-TLS-ENTRY-024 | e2e-preferred | CLI/API deletes binding safely | CLI/API supplies exact id confirmation and no delete blockers are present | `ok({ id })` | Per command error contract | `domain-binding-deleted` | Binding is inactive/deleted and route snapshots/generated access remain intact |
| ROUTE-TLS-ENTRY-025 | e2e-preferred | CLI/API retries ownership verification | CLI/API runs `domain-bindings.retry-verification` on pending/not-ready binding | `ok({ id, verificationAttemptId })` | Per command error contract | `domain-binding-verification-retried` | List/show expose the new attempt count and pending DNS observation |
| ROUTE-TLS-ENTRY-026 | e2e-preferred | CLI/API shows certificate | CLI/API reads `certificates.show` after issue/import state exists | Safe certificate detail is returned | Per query error contract | None | No mutation |
| ROUTE-TLS-ENTRY-027 | e2e-preferred | CLI/API retries certificate | CLI/API runs `certificates.retry` for a retryable managed failure | `ok({ certificateId, attemptId })` | Per command error contract | `certificate-requested` | `certificate list/show` exposes the new attempt |
| ROUTE-TLS-ENTRY-028 | e2e-preferred | CLI/API revokes certificate | CLI/API runs `certificates.revoke` for active managed and imported certificates | `ok({ certificateId })` | Per command error contract | `certificate-revoked` | Certificate show/list exposes `revoked` |
| ROUTE-TLS-ENTRY-029 | e2e-preferred | CLI/API deletes certificate | CLI/API runs `certificates.delete` with exact confirmation for a non-active certificate | `ok({ certificateId })` | Per command error contract | `certificate-deleted` | Certificate show/list exposes `deleted`; domain binding remains present |

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

`ROUTE-TLS-BOUNDARY-005` is target coverage for ADR-024. Current SSH CLI implementation can persist
server-applied config domain desired state without creating managed `DomainBinding` or `Certificate`
aggregates, but applied/ready route state still depends on the future edge proxy route realization
slice.

Current tests cover `ROUTE-TLS-EVT-004`, `ROUTE-TLS-READMODEL-001`,
`ROUTE-TLS-READMODEL-002`, `ROUTE-TLS-READMODEL-003`, `ROUTE-TLS-READMODEL-015`, and
`ROUTE-TLS-ENTRY-012`.

`DMBH-DOMAIN-001` is the domain-model hardening row for the no-behavior-change certificate
admission and ready-gate refactor. It is bound to `packages/core/test/domain-binding.test.ts` and
verified with `packages/application/test/confirm-domain-binding-ownership.test.ts`,
`packages/application/test/issue-or-renew-certificate.test.ts`, and
`packages/application/test/import-certificate.test.ts`.

`DMBH-DOMAIN-002` is the domain-model hardening row for managed canonical redirect target behavior
placement. It is bound to `packages/core/test/domain-binding.test.ts` and verified with
`packages/application/test/domain-binding-lifecycle.test.ts`.

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

Quick Deploy/config managed handoff coverage for `ROUTE-TLS-ENTRY-015` remains a target row.
Current repository config parsing rejects domain/TLS-like fields before mutation. After ADR-024,
pure CLI/SSH `access.domains[]` should be covered by server-applied route rows instead of this
managed domain-binding entry row; resource-scoped domain binding surfaces remain the active managed
follow-up path.

`ROUTE-TLS-BOUNDARY-006` now has pure CLI route-state and edge proxy route realization coverage for
canonical redirect aliases. External DNS/TLS/public HTTP redirect verification remains opt-in e2e
coverage, and no managed `DomainBinding` or `Certificate` aggregate is created for the alias.

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

Current tests now cover `certificates.import` command/event/read-model coverage plus CLI, HTTP/API,
resource-scoped Web entry behavior, and durable certificate secret persistence through application
tests, shell e2e, Bun.WebView resource detail tests, and PG/PGlite persistence integration tests.

Current tests do not yet cover live DNS lookup/recheck, DNS-provider verification workflow,
confirmation-file route proof serving, exhaustive certificate validation failure branches for manual
import, event replay handling beyond the create/confirm/domain-ready/certificate-issued baseline,
renewal-window scheduling, or live CA behavior.

Generated default access routing tests are governed by [Default Access Domain And Proxy Routing Test Matrix](./default-access-domain-and-proxy-routing-test-matrix.md) and must remain separate from durable domain binding readiness tests.

## Open Questions

- None for the current routing/domain/TLS test baseline. DNS verification tests begin with a manual verification fake according to ADR-006, and certificate contract tests assume the injected ADR-007 selection policy returns `acme` with `http-01` in the default shell/test composition. Core and application use cases must not contain ACME-specific default selection.
