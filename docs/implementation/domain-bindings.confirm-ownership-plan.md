# domain-bindings.confirm-ownership Implementation Plan

## Source Of Truth

This document is an implementation-planning contract for `domain-bindings.confirm-ownership`. It does not replace the command, event, workflow, error, or testing specs.

## Governed ADRs

- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-005: Domain Binding Owner Scope](../decisions/ADR-005-domain-binding-owner-scope.md)
- [ADR-006: Domain Verification Strategy](../decisions/ADR-006-domain-verification-strategy.md)

## Governed Specs

- [domain-bindings.confirm-ownership Command Spec](../commands/domain-bindings.confirm-ownership.md)
- [domain-bound Event Spec](../events/domain-bound.md)
- [Routing, Domain Binding, And TLS Workflow Spec](../workflows/routing-domain-and-tls.md)
- [Routing, Domain Binding, And TLS Error Spec](../errors/routing-domain-tls.md)
- [Routing, Domain Binding, And TLS Test Matrix](../testing/routing-domain-and-tls-test-matrix.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Touched Modules And Packages

Expected implementation scope:

- `packages/core/src/runtime-topology`: add `DomainBinding.confirmOwnership(...)` transition and event payload.
- `packages/application/src/operations/domain-bindings`: command schema, command message, handler, and use case.
- `packages/application/src/operation-catalog.ts`: add `domain-bindings.confirm-ownership`.
- `packages/application/src/ports.ts` and `packages/application/src/tokens.ts`: reuse `DomainBindingRepository`, `Clock`, `EventBus`, `AppLogger`.
- `packages/persistence/pg`: reuse the existing domain binding upsert/read model because verification attempts are serialized in aggregate state.
- `packages/orpc`: add typed `POST /api/domain-bindings/{domainBindingId}/ownership-confirmations`.
- `packages/contracts`: expose confirm input/response and read-model bound status.
- `packages/adapters/cli`: add `appaloft domain-binding confirm-ownership <domainBindingId>`.
- `apps/web`: add resource-scoped and standalone pending-binding confirmation affordances.
- `apps/shell`: register the use case.

## Write-Side State Changes

The command mutates one `DomainBinding` aggregate:

- current pending manual verification attempt moves to `verified`;
- binding status moves from `pending_verification` to `bound`;
- safe confirmation metadata may be recorded when supported by the aggregate state;
- `domain-bound` is published after persistence.

No deployment, generated default access route, certificate, or read model state is mutated directly.

## Event Publishing Points

Publish or record `domain-bound` after the bound binding state and verified attempt are durably persisted.

Duplicate confirmation for the same verified attempt must return idempotent success without publishing a duplicate `domain-bound`.

## Error And neverthrow Boundaries

Command factory returns `Result<ConfirmDomainBindingOwnershipCommand, DomainError>`.

Handler and use case return `Promise<Result<{ id: string; verificationAttemptId: string }, DomainError>>`.

Expected errors must use [Routing, Domain Binding, And TLS Error Spec](../errors/routing-domain-tls.md) and must not throw for validation, missing binding, missing pending attempt, invalid state transition, persistence failure, or event publication failure.

## Required Tests

Required tests:

- command schema validates required `domainBindingId` and optional fields;
- use case confirms the latest pending manual attempt and publishes `domain-bound`;
- use case accepts an explicit matching `verificationAttemptId`;
- repeated confirmation of the same verified/bound attempt is idempotent and does not duplicate events;
- missing binding returns `not_found` with phase `domain-verification`;
- binding with no pending manual attempt returns `domain_verification_not_pending`;
- read model lists the binding as `bound` after confirmation;
- operation catalog, API/oRPC, CLI, and Web entrypoints dispatch through the shared command schema.

## Minimal Deliverable

The minimal Code Round deliverable is:

- `domain-bindings.confirm-ownership` command/schema/handler/use case;
- aggregate transition and `domain-bound` event;
- operation catalog and `CORE_OPERATIONS.md` entry;
- typed API/oRPC route;
- CLI command;
- Web owner-scoped resource detail confirmation action;
- standalone Web confirmation action when a binding is pending;
- tests for command admission, state transition, event payload, idempotency, and read-model visibility.

Certificate issuance and domain readiness remain follow-up behavior.

## Current Implementation Notes And Migration Gaps

The manual confirmation slice is implemented. It does not perform DNS lookups, DNS provider writes, certificate issuance, or route readiness checks.

`domain-bound` is currently produced only by explicit manual confirmation. Future DNS/provider automation can reuse the same aggregate transition and event semantics.

## Open Questions

- None for the manual confirmation baseline.
