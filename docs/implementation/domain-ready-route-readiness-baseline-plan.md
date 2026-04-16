# Domain Ready Route Readiness Baseline Implementation Plan

## Source Of Truth

This document is an implementation-planning contract for the TLS-disabled `domain-bound` to
`domain-ready` readiness baseline. It does not replace the event, workflow, error, or testing specs.

## Governed ADRs

- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-005: Domain Binding Owner Scope](../decisions/ADR-005-domain-binding-owner-scope.md)
- [ADR-006: Domain Verification Strategy](../decisions/ADR-006-domain-verification-strategy.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)

No new ADR is needed for this slice. ADR-017 already separates generated access from durable
bindings, and ADR-019 already governs provider-backed route realization and observable route state.

## Governed Specs

- [domain-bound Event Spec](../events/domain-bound.md)
- [domain-ready Event Spec](../events/domain-ready.md)
- [Routing, Domain Binding, And TLS Workflow Spec](../workflows/routing-domain-and-tls.md)
- [Routing, Domain Binding, And TLS Error Spec](../errors/routing-domain-tls.md)
- [Routing, Domain Binding, And TLS Test Matrix](../testing/routing-domain-and-tls-test-matrix.md)
- [Edge Proxy Provider And Route Realization Workflow Spec](../workflows/edge-proxy-provider-and-route-realization.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Touched Modules And Packages

Expected implementation scope:

- `packages/core/src/runtime-topology`: add a `DomainBinding.markReady(...)` state transition and
  `domain-ready` event payload.
- `packages/application/src/operations/domain-bindings`: add a `domain-bound` event handler/process
  manager that marks TLS-disabled bindings ready and publishes `domain-ready`.
- `packages/application/src/operations/resources`: extend `projectResourceAccessSummary(...)` so
  ready durable domain bindings project to `latestDurableDomainRoute` while generated/default access
  remains separate.
- `packages/persistence/pg`: include ready domain bindings when building resource summaries.
- `packages/testkit`: keep the in-memory resource read model aligned with the PostgreSQL read model.
- `apps/shell`: register the event handler.

No new public command, oRPC route, or CLI command is added. The executable user path remains
`domain-bindings.create -> domain-bindings.confirm-ownership -> domain-bindings.list/resources.list`.

## Write-Side State Changes

The process manager consumes `domain-bound` and loads the referenced `DomainBinding`.

For this slice it may mark a binding ready only when:

- binding state is `bound`;
- `tlsMode = disabled` or `certificatePolicy = disabled`;
- no certificate gate remains.

Bindings with `tlsMode = auto` or `certificatePolicy = auto` must remain `bound` until the
certificate workflow completes.

The ready transition persists the aggregate before `domain-ready` is published.

## Read Model Changes

`domain-bindings.list` must expose `status = ready` after the ready transition.

`resources.list` must expose:

- `latestGeneratedAccessRoute` from generated/default deployment route snapshots when available;
- `latestDurableDomainRoute` from the latest ready durable domain binding for the resource when a
  latest reverse-proxy deployment can provide deployment status and target port context;
- `proxyRouteStatus` and `lastRouteRealizationDeploymentId` from the latest route-carrying
  deployment.

Ready durable domain routes must not be projected from merely `bound` TLS-auto bindings.

## Required Tests

Required executable coverage:

- `ROUTE-TLS-EVT-004`: consuming `domain-bound` for TLS-disabled binding publishes `domain-ready`
  and persists `ready`;
- `ROUTE-TLS-READMODEL-001`: domain binding list shows `ready`;
- `ROUTE-TLS-READMODEL-002`: resource list projects `latestDurableDomainRoute` for a ready binding
  and preserves generated route projection;
- `ROUTE-TLS-READMODEL-003`: TLS-auto bound binding does not project a ready durable route before
  certificate readiness;
- `ROUTE-TLS-ENTRY-012`: CLI create/confirm/list flow observes the durable ready route through
  `resource list`.

## Minimal Deliverable

The minimal Code Round deliverable is:

- ready transition and `domain-ready` event in `DomainBinding`;
- `domain-bound` handler for TLS-disabled readiness;
- resource access summary durable-route projection in application, testkit, and PostgreSQL read
  models;
- shell handler registration;
- integration and e2e tests for the matrix rows above.

## Current Implementation Notes And Migration Gaps

This slice intentionally does not implement certificate issuance, certificate-backed readiness,
provider DNS verification, retryable route realization failure state, or a durable outbox/inbox.

Route provider execution remains governed by deployment route snapshots and ADR-019. This slice makes
ready TLS-disabled durable bindings observable through the same resource access query path so Web,
CLI, and API stop treating generated default access and custom domain bindings as the same thing.

## Open Questions

- None for the TLS-disabled readiness baseline.
