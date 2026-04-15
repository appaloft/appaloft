# Routing, Domain Binding, And TLS Workflow Spec

## Normative Contract

Routing/domain/TLS is a durable lifecycle workflow separate from deployment route snapshots and generated default access routes.

```text
create durable domain binding
  -> verify/bind domain routing
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
  -> domain-bound
  -> certificate-requested, if tlsMode is auto or certificatePolicy is auto
  -> certificate-issued
  -> domain-ready
```

For TLS disabled:

```text
domain-bindings.create
  -> domain-binding-requested
  -> domain-bound
  -> domain-ready
```

For certificate failure:

```text
domain-bindings.create
  -> domain-binding-requested
  -> domain-bound
  -> certificate-requested
  -> certificate-issuance-failed
  -> domain remains bound but not ready for TLS-required traffic
```

For manual certificate import:

```text
domain-bindings.create
  -> domain-binding-requested
  -> domain-bound
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
- normalized domain uniqueness/conflict checks;
- project/environment/resource/server/destination consistency checks;
- proxy kind and TLS mode policy checks;
- certificate request eligibility checks;
- duplicate in-flight certificate attempt checks.

Admission rejection returns `err(DomainError)` and must not publish lifecycle success events.

## Async Work

Async work includes:

- manual domain ownership verification with durable verification attempts;
- route/proxy realization when the binding is made active;
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
| `domain-bound` | Domain binding requirements satisfied. | Binding moves to `bound`. |
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

## Entry Boundaries

Web must treat resource detail pages as the primary resource-scoped domain binding surface when the binding belongs to a resource. The resource page may preload project, environment, resource, destination, and recent placement context, then dispatch `domain-bindings.create` with the same command contract.

Web may also keep a standalone domain bindings page for cross-resource listing, filtering, and creation. The standalone page must reuse the same command/query contracts and must not create a separate global binding model.

Web may guide users through DNS verification status, certificate issuance, and readiness display after the binding has been accepted.

CLI may expose separate commands for binding domains, issuing/renewing certificates, checking status, and retrying failed attempts.

API must expose strict command inputs and read-model status; it must not prompt.

Automation and future MCP tools must dispatch the same command semantics rather than mutating deployment runtime plans directly.

## Current Implementation Notes And Migration Gaps

Current code supports deployment runtime access routes in runtime plans and persistence snapshots.

Current adapter-facing runtime planning still contains explicit route-hint fields; target implementation must replace them with resource/domain/default-access route resolution.

Current runtime adapters generate Traefik/Caddy labels and can ensure edge proxy containers/networks for deployment runtime access routes.

Current health checks can build public URLs from access routes.

Current code now implements the `domain-bindings.create -> domain-binding-requested` admission segment with durable `DomainBinding` state, a first manual verification attempt, PostgreSQL/PGlite persistence, oRPC/OpenAPI create/list routes, CLI create/list commands, standalone and resource-scoped Web console create/list entrypoints, read-model listing, and command/query-level tests.

The DNS verification workflow, `domain-bound`, certificate issuance workflow, `domain-ready`, outbox/inbox workflow, and domain readiness read model are not implemented yet.

## Open Questions

- None for the current routing/domain/TLS workflow baseline. Domain verification is governed by ADR-006, certificate provider defaults are governed by ADR-007, renewal triggering and readiness expiry are governed by ADR-008, and manual certificate import is governed by ADR-009.
