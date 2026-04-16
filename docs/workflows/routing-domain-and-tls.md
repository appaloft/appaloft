# Routing, Domain Binding, And TLS Workflow Spec

## Normative Contract

Routing/domain/TLS is a durable lifecycle workflow separate from deployment route snapshots and generated default access routes.

```text
create durable domain binding
  -> confirm or verify domain ownership
  -> bind domain routing
  -> evaluate route readiness
  -> request certificate when required
  -> issue certificate or record failure
  -> mark domain ready when all gates pass
```

`deployments.create` must not carry domain/proxy/TLS input. It may persist resolved generated or durable route snapshots for one deployment attempt. It must not create durable domain bindings or issue certificates as hidden side effects.

## Global References

This workflow inherits:

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

## End-To-End Workflow

```text
domain-bindings.create
  -> domain-binding-requested
  -> domain-bindings.confirm-ownership
  -> domain-bound
  -> route readiness satisfied
  -> certificate-requested, if tlsMode is auto or certificatePolicy is auto
  -> certificate-issued
  -> domain-ready
```

For TLS disabled:

```text
domain-bindings.create
  -> domain-binding-requested
  -> domain-bindings.confirm-ownership
  -> domain-bound
  -> route readiness satisfied
  -> domain-ready
```

For certificate failure:

```text
domain-bindings.create
  -> domain-binding-requested
  -> domain-bindings.confirm-ownership
  -> domain-bound
  -> route readiness satisfied
  -> certificate-requested
  -> certificate-issuance-failed
  -> domain remains bound but not ready for TLS-required traffic
```

For manual certificate import:

```text
domain-bindings.create
  -> domain-binding-requested
  -> domain-bound
  -> route readiness satisfied
  -> certificates.import
  -> certificate-imported
  -> domain-ready
```

For renewal:

```text
renewal scheduler/process manager
  -> certificates.issue-or-renew(reason = renew)
  -> certificate-requested
  -> certificate-issued | certificate-issuance-failed
```

## Synchronous Admission

Synchronous admission includes:

- domain binding input validation;
- manual ownership confirmation input validation;
- normalized domain uniqueness/conflict checks;
- project/environment/resource/server/destination consistency checks;
- proxy kind and TLS mode policy checks;
- pending verification attempt and state transition checks;
- certificate request eligibility checks;
- duplicate in-flight certificate attempt checks.

Admission rejection returns `err(DomainError)` and must not publish lifecycle success events.

## Async Work

Async work includes:

- manual domain ownership verification with durable verification attempts;
- route/proxy realization when the binding is made active;
- route readiness projection into resource access summaries;
- certificate challenge preparation;
- certificate provider request;
- certificate storage;
- domain readiness finalization.

Async work must persist state and publish formal events after durable transitions.

## State Model

Domain binding state:

```text
requested
pending_verification
bound
certificate_pending
ready
failed | not_ready
```

Certificate state:

```text
pending
issuing
active
renewing
failed
expired
disabled
```

Certificate attempt state:

```text
requested
issuing
issued
failed
retry_scheduled
```

## Event / State Mapping

| Event | Meaning | State impact |
| --- | --- | --- |
| `domain-binding-requested` | Binding request accepted. | Binding moves to `requested` or `pending_verification`. |
| `domain-bound` | Domain binding requirements satisfied after manual confirmation or future provider verification. | Binding moves to `bound`. |
| route readiness evaluation | Route/proxy gates for the binding are satisfied or failed. | Binding may remain `bound`, move to `ready`, or move to `not_ready` when a route failure is recorded. |
| `certificate-requested` | Certificate attempt accepted. | Certificate attempt moves to `requested` or `issuing`. |
| `certificate-issued` | Certificate state is active. | Certificate moves to `active`; domain may move to `ready`. |
| `certificate-issuance-failed` | Certificate attempt failed. | Certificate attempt moves to `failed` or `retry_scheduled`; domain remains not ready if TLS is required. |
| `domain-ready` | All routing and TLS gates are satisfied. | Domain binding read model reports ready. |

## Failure Visibility

Admission failures are returned to the caller as `err(DomainError)`.

Async failures are exposed through:

- domain binding read-model status;
- certificate read-model status;
- attempt status when available;
- `certificate-issuance-failed` or domain verification failure state;
- logs/traces with correlation and causation ids.

## Route Readiness Baseline

Route readiness for a durable domain binding is evaluated after `domain-bound`.

The minimal v1 readiness baseline is:

- the binding is `bound`;
- the binding uses an enabled proxy kind;
- the current resource has a deployment route snapshot that can serve reverse-proxy traffic;
- the binding's TLS/certificate policy has no remaining certificate gate, or the certificate gate has later completed;
- the resource read model exposes a `latestDurableDomainRoute` for ready bindings so CLI, API, and Web can observe the same URL without inspecting persistence.

For TLS-disabled bindings, no certificate gate remains after route readiness is satisfied. The domain-ready process manager may persist the binding as `ready` and publish `domain-ready`.

For TLS auto or certificate-policy auto bindings, route readiness alone is not sufficient. The binding remains `bound` until certificate issuance completes. `certificate-requested` is consumed by the certificate worker through provider-neutral ports; `certificate-issued` records active certificate state, and `certificate-issuance-failed` records failed or retry-scheduled attempt state.

Certificate-backed `domain-ready` after `certificate-issued` is a later process-manager behavior.

The route readiness baseline does not create a separate public command. It is an event/process-manager continuation from `domain-bound` and a query/read-model projection for resources and domain bindings.

## Retry Points

Domain verification retry is a new verification attempt.

Certificate issuance retry is a new certificate attempt.

Certificate renewal retry is a new certificate attempt dispatched by the scheduler/process manager.

Route/proxy realization retry is a new route attempt or process-manager attempt.

Previous failed attempts remain historical state and must not be erased by retry.

## Relationship To Generated Access And Deployment Route Snapshots

Generated default access routes are convenience routes resolved from provider-neutral platform policy. They are not durable domain bindings, and they do not prove domain ownership.

Deployment route snapshots may shape Docker labels, edge proxy requirements, public health URLs, and deployment runtime metadata for one deployment attempt. They must be derived from resource/domain/default-access state rather than submitted through `deployments.create`.

Durable domain binding and certificate lifecycle must use `domain-bindings.create`, `certificates.issue-or-renew`, `certificates.import`, and their event flows.

Manual ownership confirmation must use `domain-bindings.confirm-ownership`. Entry surfaces must not
infer ownership from generated sslip/default access routes or from deployment runtime route
snapshots.

## Entry Boundaries

Web must treat resource detail pages as the primary resource-scoped domain binding surface when the binding belongs to a resource. The resource page may preload project, environment, resource, destination, and recent placement context, then dispatch `domain-bindings.create` with the same command contract.

Web may also keep a standalone domain bindings page for cross-resource listing, filtering, and creation. The standalone page must reuse the same command/query contracts and must not create a separate global binding model.

Web may guide users through DNS verification status, certificate issuance, and readiness display after the binding has been accepted.

Web must present generated default access and custom domain binding as separate concepts. A generated
sslip/default access URL is read from `ResourceAccessSummary`; it is not a row in
`domain-bindings.list` and it does not satisfy ownership confirmation for a custom domain.

CLI may expose separate commands for binding domains, confirming ownership, issuing/renewing certificates, checking status, and retrying failed attempts.

API must expose strict command inputs and read-model status; it must not prompt.

Automation and future MCP tools must dispatch the same command semantics rather than mutating deployment runtime plans directly.

## Current Implementation Notes And Migration Gaps

Current code supports deployment runtime access routes in runtime plans and persistence snapshots.

Current adapter-facing runtime planning still contains explicit route-hint fields; target implementation must replace them with resource/domain/default-access route resolution.

Current runtime adapters generate Traefik/Caddy labels and can ensure edge proxy containers/networks for deployment runtime access routes.

Current health checks can build public URLs from access routes.

Current code now implements the `domain-bindings.create -> domain-binding-requested ->
domain-bindings.confirm-ownership -> domain-bound` segment with durable `DomainBinding` state, a
first manual verification attempt, PostgreSQL/PGlite persistence, oRPC/OpenAPI create/list/confirm
routes, CLI create/list/confirm commands, standalone and resource-scoped Web console create/list
entrypoints, read-model listing, and command/query-level tests.

Current code implements the TLS-disabled route readiness baseline: `domain-bound` is consumed for
eligible bindings, the binding is marked `ready`, `domain-ready` is published, and ready durable
domain routes are projected into resource access summaries.

Current code implements certificate request acceptance and public observability:
`certificates.issue-or-renew` accepts issue/renew requests for eligible TLS-auto bindings, resolves
provider/challenge defaults through an injected provider selection policy, persists certificate attempt
state, publishes `certificate-requested`, and exposes the pending request through
`certificates.list`, CLI, and API.

Current code also implements the `certificate-requested` event-handler segment through injected
certificate provider and secret-store ports. It records issued state and `certificate-issued` on
provider/store success, or failed/retry-scheduled state and `certificate-issuance-failed` on
provider/store failure. The default shell provider is intentionally unavailable until a real
provider adapter is configured, so CLI/API users can observe retryable
`certificate_provider_unavailable` state.

Real ACME provider issuance, outbox/inbox workflow, DNS-provider verification, route realization
failure state, retry scheduler execution, proxy reload, and certificate-backed domain readiness are
not implemented yet.

## Open Questions

- None for the current routing/domain/TLS workflow baseline. Domain verification is governed by ADR-006, certificate provider defaults are governed by ADR-007, renewal triggering and readiness expiry are governed by ADR-008, and manual certificate import is governed by ADR-009.
