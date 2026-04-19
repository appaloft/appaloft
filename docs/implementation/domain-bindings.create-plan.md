# domain-bindings.create Implementation Plan

## Source Of Truth

This document is an implementation-planning contract for `domain-bindings.create`. It does not replace the command, event, error, workflow, or testing specs.

Implementation must preserve the source-of-truth behavior in the governed ADRs and specs before adding transport-specific affordances.

## Governed ADRs

- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-005: Domain Binding Owner Scope](../decisions/ADR-005-domain-binding-owner-scope.md)
- [ADR-006: Domain Verification Strategy](../decisions/ADR-006-domain-verification-strategy.md)

## Governed Specs

- [domain-bindings.create Command Spec](../commands/domain-bindings.create.md)
- [domain-binding-requested Event Spec](../events/domain-binding-requested.md)
- [domain-bound Event Spec](../events/domain-bound.md)
- [domain-ready Event Spec](../events/domain-ready.md)
- [Routing, Domain Binding, And TLS Error Spec](../errors/routing-domain-tls.md)
- [Routing, Domain Binding, And TLS Workflow Spec](../workflows/routing-domain-and-tls.md)
- [Routing, Domain Binding, And TLS Test Matrix](../testing/routing-domain-and-tls-test-matrix.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Touched Modules And Packages

Expected implementation scope:

- `packages/core/src/runtime-topology`: `DomainBinding` aggregate, domain binding status value object, domain binding id, normalized domain name, route path prefix, optional canonical redirect metadata, owner scope, verification attempt value/entity, and transition rules.
- `packages/application/src/operations/domain-bindings`: command schema, command message, handler, use case, operation-local factories/builders, and result/error translation.
- `packages/application/src/operation-catalog.ts`: operation catalog entry for `domain-bindings.create`.
- `packages/application/src/ports.ts` and `packages/application/src/tokens.ts`: domain binding repository, domain binding read-model ports, event publisher/outbox port, clock, and id generator tokens.
- `packages/persistence/pg`: Kysely persistence for the domain binding aggregate, verification attempts, uniqueness constraints, read model, and migrations.
- `packages/orpc`: typed command input/output contracts that reuse the application command schema.
- `packages/adapters/cli`: CLI transport that collects input and dispatches the command bus.
- `packages/adapters/http-elysia`: HTTP transport that dispatches the command bus without redefining transport-only input shapes.
- `apps/web`: standalone domain binding management surface and resource-scoped detail-page affordance that both call the typed oRPC client.
- `apps/shell`: composition-root registration for repositories, ports, handlers, and process managers.

## Expected Ports And Adapters

Required write-side ports:

- `DomainBindingRepository`: loads and persists the `DomainBinding` aggregate, including verification attempts owned by the aggregate.
- `DomainBindingUniquenessSpec`: checks normalized domain/path/owner conflicts through repository selection without leaking persistence filters into domain logic.
- `DomainEventPublisher` or outbox port: records `domain-binding-requested` after durable state exists.
- `IdGenerator`: creates `domainBindingId` and first `verificationAttemptId`.
- `Clock`: provides accepted/requested timestamps.

Required async/process ports:

- `DomainVerificationPort`: represents manual verification confirmation first, then DNS lookup/provider verification later behind the same attempt model.
- `DomainDnsObservationPort` or equivalent process capability: observes public resolver answers for
  the binding hostname and records safe DNS observation state. This port is async/readiness
  workflow infrastructure, not command admission.
- `RouteRealizationPort`: checks or applies proxy route readiness when the binding moves toward ready.

Adapters must keep provider credentials, DNS details, and proxy-specific implementation details outside `core`.

## Write-Side State Changes

The minimal write-side model must include:

- `DomainBinding` aggregate root.
- Owner scope governed by ADR-005.
- States: `requested`, `pending_verification`, `bound`, `certificate_pending`, `ready`, `not_ready`, and failed/degraded state when needed by workflow specs.
- A first durable verification attempt allocated before `domain-binding-requested`.
- Initial DNS observation metadata with expected public target and waitable status when the target
  can be derived from the selected edge/server context.
- Verification attempt states such as `requested`, `pending`, `verified`, `failed`, and `retry_scheduled`.
- Normalized uniqueness guard for active `(domainName, pathPrefix, ownerScope)` combinations.
- Idempotency key support for repeated create attempts.

The command success result remains `ok({ id })`. It means the binding request is accepted, not that the domain is ready.

## Event Publishing Points

Required event publishing points:

- Publish or record `domain-binding-requested` after `DomainBinding` and the first verification attempt are durably persisted.
- Publish `domain-bound` only after the verification attempt is durably marked successful and binding state is `bound`.
- Publish `domain-ready` only after routing and TLS gates are satisfied by the workflow contract.

Event payloads must include correlation and causation ids when available. Event consumers must dedupe by event id or the event-specific dedupe keys defined in the event specs.

## Error And neverthrow Boundaries

Value object factories, aggregate transitions, command factories, use cases, handlers, repositories, and process managers must return `Result<T, DomainError>` or `Promise<Result<T, DomainError>>` according to [neverthrow Conventions](../errors/neverthrow-conventions.md).

The command must return admission errors synchronously as `err(DomainError)` for:

- invalid domain/path/proxy/TLS input;
- missing project/environment/resource/server/destination context;
- owner-scope mismatch;
- duplicate active domain binding;
- missing or redirect-chain canonical redirect target;
- persistence or outbox failure before acceptance.

Post-acceptance verification, route realization, and readiness failures must be recorded as async-processing state and must not rewrite accepted command success into a later command failure.

## Required Tests

Required test coverage:

- Domain value object normalization and invalid domain/path rejection.
- `DomainBinding` aggregate state transitions and invalid transition protection.
- Duplicate active binding detection for the ADR-005 owner scope.
- Command handler delegates through command bus/use case and returns typed `Result`.
- Use case persists binding and first verification attempt before event publication.
- Use case persists initial DNS observation metadata before event publication, so
  `domain-bindings.list` can show pending DNS propagation immediately after command acceptance.
- `domain-binding-requested` payload includes `verificationAttemptId`.
- Verification success publishes `domain-bound`.
- Verification failure records structured error state and does not publish `domain-bound`.
- Retry creates a new verification attempt id.
- HTTP/CLI inputs reuse the command schema and preserve command semantics.
- Persistence adapter enforces uniqueness and serializes value objects without leaking primitives into core.

## Minimal Deliverable

The minimal deliverable is:

- write-side `DomainBinding` aggregate and repository;
- `domain-bindings.create` command, schema, handler, use case, and operation catalog entry;
- first manual verification attempt persistence;
- initial DNS observation read-model visibility;
- outbox/event publication for `domain-binding-requested`;
- read-model status sufficient for UI/CLI/API to show accepted and pending-verification states;
- Web entrypoints for both standalone cross-resource management and resource-scoped creation/listing from the resource detail page;
- tests for command admission, duplicate detection, event payload, and structured errors.

`domain-bound` and `domain-ready` process-manager behavior may ship in a follow-up only if the first deliverable clearly exposes pending verification and does not pretend the domain is ready.

## Migration Seams And Legacy Edges

Deployment runtime access routes remain valid runtime-plan intent for deployment attempts. They must not be silently converted into durable domain bindings.

Existing proxy label generation, public health URL derivation, and deployment access-route snapshots can be reused by route realization adapters, but they remain adapter/runtime concerns until a durable domain binding command explicitly creates write-side state.

Legacy UI/CLI affordances that accept domain strings during deployment must either keep them as deployment runtime access-route intent or explicitly call `domain-bindings.create`; they must not create domain binding state by mutating deployment runtime plan internals.

## Current Implementation Notes And Migration Gaps

The first implementation slice now covers:

- `DomainBinding` aggregate and write-side selection/mutation specs in `packages/core/src/runtime-topology`;
- `domain-bindings.create` schema, command, handler, use case, operation catalog entry, and shell registration;
- `DomainBindingRepository` and `DomainBindingReadModel` ports;
- PostgreSQL/PGlite `domain_bindings` migrations, repository, and read model;
- initial `dnsObservation` aggregate state, persistence JSON, contract schema, and read-model
  projection;
- managed canonical redirect metadata through command schema, aggregate state, persistence, read
  models, CLI flags, Web route-behavior selects, and deployment route planning;
- oRPC/OpenAPI `POST /api/domain-bindings` and `GET /api/domain-bindings`;
- CLI `appaloft domain-binding create` and `appaloft domain-binding list`;
- Web console standalone domain binding create/list entrypoint and resource-scoped resource detail create/list entrypoint;
- command/query-level tests for admission, duplicate detection, idempotency key reuse, structured errors, `domain-binding-requested` payload, and read-model listing.

Remaining implementation gaps:

- live DNS/manual verification process manager that consumes `domain-binding-requested`;
- user-triggered DNS recheck command or scheduler;
- confirmation-file route proof token generation/serving;
- `domain-bound` state transition and event publisher;
- certificate issuance/renewal/import implementation;
- `domain-ready` process-manager behavior and readiness read model;
- outbox/inbox/dedupe persistence for long-running consumers;
- Web console can create and list accepted bindings on standalone and resource-scoped surfaces, but it does not yet guide DNS verification, certificate issuance, or readiness troubleshooting.
- Resource-scoped browser/e2e coverage is not implemented yet.
