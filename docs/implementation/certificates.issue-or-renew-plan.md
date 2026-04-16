# certificates.issue-or-renew Implementation Plan

## Source Of Truth

This document is an implementation-planning contract for `certificates.issue-or-renew`. It does not replace the command, event, error, workflow, or testing specs.

Implementation must keep provider-driven certificate issuance and renewal separate from manual certificate import.

## Governed ADRs

- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-007: Certificate Provider And Challenge Default](../decisions/ADR-007-certificate-provider-and-challenge-default.md)
- [ADR-008: Renewal Trigger Model](../decisions/ADR-008-renewal-trigger-model.md)
- [ADR-009: Certificates Import Command](../decisions/ADR-009-certificates-import-command.md)

## Governed Specs

- [certificates.issue-or-renew Command Spec](../commands/certificates.issue-or-renew.md)
- [certificate-requested Event Spec](../events/certificate-requested.md)
- [certificate-issued Event Spec](../events/certificate-issued.md)
- [certificate-issuance-failed Event Spec](../events/certificate-issuance-failed.md)
- [domain-ready Event Spec](../events/domain-ready.md)
- [Routing, Domain Binding, And TLS Error Spec](../errors/routing-domain-tls.md)
- [Routing, Domain Binding, And TLS Workflow Spec](../workflows/routing-domain-and-tls.md)
- [Routing, Domain Binding, And TLS Test Matrix](../testing/routing-domain-and-tls-test-matrix.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Touched Modules And Packages

Expected implementation scope:

- `packages/core/src/runtime-topology`: `Certificate` aggregate, certificate status value object, certificate attempt entity/value object owned by the aggregate, opaque provider key, opaque challenge type, expiry timestamp, and transition rules. Core must not hard-code ACME, HTTP-01, CA endpoint behavior, or default provider selection.
- `packages/application/src/operations/certificates`: command schema, command message, handler, use case, process-manager entry points, renewal scheduler entry point, and operation-local factories/builders.
- `packages/application/src/operation-catalog.ts`: operation catalog entry for `certificates.issue-or-renew`.
- `packages/application/src/ports.ts` and `packages/application/src/tokens.ts`: certificate repository, certificate provider selection policy, certificate provider port, certificate secret store, event publisher/outbox port, clock, id generator, and renewal scheduler/process-manager port.
- `packages/persistence/pg`: Kysely persistence for certificate aggregate state, issuance attempts, renewal metadata, read model, and migrations.
- `packages/orpc`: typed command input/output contracts that reuse the application command schema.
- `packages/adapters/cli`: CLI transport for explicit issue/renew commands and status output.
- `packages/adapters/http-elysia`: HTTP transport that dispatches through the command bus.
- `apps/shell`: composition-root registration for provider adapters, secret storage, repositories, handlers, scheduler/process manager, and event consumers.

## Expected Ports And Adapters

Required write-side ports:

- `CertificateRepository`: loads and persists certificate lifecycle state, including issue/renew attempts owned by the aggregate.
- `CertificateProviderSelectionPolicy`: resolves omitted provider/challenge inputs into a provider key and challenge type before certificate state is created. The first injected default resolves to `acme` and `http-01` according to ADR-007, but core treats both as opaque values.
- `CertificateProviderPort`: creates ACME orders and performs HTTP-01 provider interactions behind a sanitized boundary.
- `CertificateSecretStore`: stores certificate material and private keys without exposing secrets in events, errors, logs, or read models.
- `DomainBindingRepository`: loads the owning domain binding and policy state.
- `DomainEventPublisher` or outbox port: records `certificate-requested`, `certificate-issued`, and `certificate-issuance-failed`.
- `IdGenerator` and `Clock`: create `certificateId`, `attemptId`, and timestamps.

Required async/process ports:

- `CertificateWorker`: consumes `certificate-requested` and drives provider issue/renew work.
- `CertificateRenewalScheduler` or process manager: scans durable certificate state and dispatches `certificates.issue-or-renew(reason = renew)`.
- `DomainReadyProcessManager`: evaluates readiness after `certificate-issued`.

## Write-Side State Changes

The minimal write-side model must include:

- `Certificate` lifecycle state keyed by `certificateId` and `domainBindingId`.
- Certificate states: `pending`, `issuing`, `active`, `renewing`, `failed`, `expired`, and `disabled`.
- Certificate attempt states: `requested`, `issuing`, `issued`, `failed`, and `retry_scheduled`.
- Provider key and challenge type selected by the injected provider selection policy registered by
  the composition root. The first shell default is `acme` with `http-01`, but core and application
  use cases store them as opaque values.
- Renewal metadata: `expiresAt`, renewal window policy reference, in-flight renewal guard, and last attempt id.
- Attempt idempotency key support for repeated issue/renew requests.
- Safe certificate fingerprint storage when available.

The command success result remains `ok({ certificateId, attemptId })`. It means the certificate request is accepted, not that a certificate has been issued.

## Event Publishing Points

Required event publishing points:

- Publish or record `certificate-requested` after certificate state and the issuance/renewal attempt are durably persisted.
- Publish `certificate-issued` only after provider success, secret storage success, and durable certificate active state are recorded.
- Publish `certificate-issuance-failed` after structured failure state is recorded for terminal or retry-scheduled failure.
- Publish or trigger `domain-ready` evaluation after `certificate-issued`.

Retries must create new certificate attempt ids. Old `certificate-requested` events must not be replayed as the retry mechanism.

## Error And neverthrow Boundaries

Command admission must return `err(DomainError)` for:

- invalid command input;
- missing domain binding or certificate state;
- TLS policy disallowing issuance or renewal;
- duplicate in-flight attempt without matching idempotency key;
- provider/challenge configuration unavailable before acceptance;
- persistence or outbox failure before acceptance.

Post-acceptance provider, challenge, validation, storage, and renewal-window failures must be recorded through certificate attempt state and `certificate-issuance-failed`.

Retriability follows ADR-007:

- transient provider/network/rate-limit/storage failures are retriable;
- HTTP-01 validation failure is non-retriable until DNS, route, or binding configuration changes;
- invalid provider/challenge configuration is non-retriable until configuration changes.

## Required Tests

Required test coverage:

- Certificate provider/challenge defaults: omitted provider resolves to `acme` and omitted
  challenge resolves to `http-01` through the injected provider selection policy registered by the
  composition root, not through core or application use-case branching.
- Command admission rejects TLS-disabled or missing binding cases with structured `DomainError`.
- Duplicate in-flight attempt behavior follows idempotency key rules.
- Use case persists attempt state before `certificate-requested`.
- Provider worker maps success to secret storage, durable active state, and `certificate-issued`.
- Provider worker maps transient provider failure, validation failure, rate limiting, and storage failure to `certificate-issuance-failed` with correct retriability.
- Renewal scheduler skips in-flight attempts and dispatches a new attempt when a certificate enters the configured renewal window.
- `domain-ready` is evaluated only after active certificate state exists.
- Event duplicate consumption is idempotent.
- HTTP/CLI contracts reuse the command schema and assert `Result` shape by code, phase, and attempt id.

## Minimal Deliverable

The minimal deliverable is:

- write-side `Certificate` and certificate attempt model;
- `certificates.issue-or-renew` command, schema, handler, use case, and operation catalog entry;
- provider selection policy with a hermetic default/fake adapter;
- certificate secret store port with a safe fake implementation;
- outbox/event publication for `certificate-requested`;
- event worker path for one successful fake issuance and one structured failed issuance;
- tests for defaults, attempt persistence, event payloads, and neverthrow error shape.

Renewal scheduler automation may ship after first issuance if the certificate state includes the renewal metadata required by ADR-008 and the MVP does not claim automatic renewal is active.

## First Code Round Slice

The first executable slice is certificate request acceptance and public observability:

- write-side `Certificate` and certificate attempt model;
- `certificates.issue-or-renew` command, schema, handler, use case, and operation catalog entry;
- `CertificateRepository` and `CertificateReadModel`;
- `CertificateProviderSelectionPolicy` injected into the use case for default provider/challenge resolution;
- PostgreSQL/PGlite migration and repository/read-model adapters;
- `certificates.list` query for public CLI/API observation;
- oRPC/OpenAPI and CLI entrypoints for issue/list;
- `certificate-requested` publication after durable attempt persistence;
- tests for defaults, TLS-disabled rejection, missing binding rejection, attempt persistence,
  read-model visibility, and CLI/HTTP e2e.

This slice intentionally does not claim provider issuance, ACME order creation, secret material
storage, `certificate-issued`, `certificate-issuance-failed`, or certificate-backed `domain-ready`.
Those remain follow-up Code Rounds under the same ADR/spec set.

## Second Code Round Slice

The second executable slice is event-driven certificate issuance through provider-neutral ports:

- `CertificateProviderPort` accepts a certificate attempt and returns safe certificate metadata plus
  certificate material without leaking provider SDK types;
- `CertificateSecretStore` stores certificate material and returns only a safe secret reference;
- `certificate-requested` event handler consumes the event as a first-class behavior entrypoint;
- successful handling records issued attempt state, active certificate metadata, and publishes
  `certificate-issued`;
- failed provider or storage handling records failed or retry-scheduled attempt state and publishes
  `certificate-issuance-failed` with structured safe error metadata;
- `certificates.list` exposes terminal certificate and latest-attempt state without exposing private
  key or certificate material;
- tests use injected fake provider and secret-store ports for deterministic success/failure paths.

This slice intentionally does not ship a real ACME adapter, ACME account persistence, challenge
token serving, retry scheduler, proxy reload, or certificate-backed `domain-ready`.

## Third Code Round Slice

The third executable slice is certificate-backed domain readiness:

- `certificate-issued` event handler consumes the event as a first-class behavior entrypoint;
- when the referenced domain binding is still `bound`, the handler marks it `ready` and publishes
  `domain-ready`;
- duplicate `certificate-issued` handling is idempotent and does not duplicate `domain-ready`;
- resource access summary projects ready TLS-auto durable domain bindings as HTTPS routes when a
  latest reverse-proxy deployment route exists.

This slice intentionally does not ship real ACME provider behavior, proxy reload, route realization
failure state, or durable outbox/inbox processing.

## Migration Seams And Legacy Edges

Runtime proxy behavior that obtains certificates implicitly remains adapter behavior and must not be treated as platform-owned certificate lifecycle state.

Existing `tlsMode` and proxy label generation can inform route/challenge feasibility, but certificate state must be created only through `certificates.issue-or-renew` or `certificates.import`.

Manual certificate import must remain outside this command. If operators need manual certificates before provider issuance ships, implement `certificates.import` rather than adding raw key material to `certificates.issue-or-renew`.

## Current Implementation Notes And Migration Gaps

Current code implements the first executable slice:

- `Certificate` aggregate and certificate attempt state;
- provider-neutral core state with opaque provider key/challenge type;
- injected provider selection policy, with the default shell composition resolving omitted provider
  and challenge to `acme` and `http-01`;
- `certificates.issue-or-renew` command, handler, use case, schema, and operation catalog entry;
- `certificates.list` query, handler, query service, schema, and operation catalog entry;
- certificate repository/read model ports, PostgreSQL/PGlite migration, repository, and read model;
- CLI/API/oRPC entrypoints for issue/list;
- `certificate-requested` publication after durable attempt persistence;
- application tests and CLI/HTTP e2e tests for request acceptance and public observability.

Current code also implements the second executable slice:

- provider-neutral `CertificateProviderPort` and `CertificateSecretStore` application ports;
- `certificate-requested` event handler for successful issued state and retryable/failed state;
- `certificate-issued` and `certificate-issuance-failed` publication after durable state updates;
- certificate read-model projection for issued expiry/fingerprint metadata and safe failure metadata;
- shell registration for the event handler with an explicitly unavailable default provider adapter,
  so local CLI/API users see a retryable post-acceptance failure instead of a hidden no-op when no
  real certificate provider is configured;
- `certificate-issued` handler for certificate-backed `domain-ready`;
- certificate-backed HTTPS durable route projection in resource access summaries;
- application tests for `ROUTE-TLS-EVT-005`, `ROUTE-TLS-EVT-006`, and
  `ROUTE-TLS-READMODEL-005`, plus domain-readiness tests for `ROUTE-TLS-EVT-008` and
  `ROUTE-TLS-READMODEL-006`.

Current code intentionally does not implement real ACME order creation, challenge token serving,
renewal scheduling, retry scheduler execution, proxy reload, or route realization failure state.
