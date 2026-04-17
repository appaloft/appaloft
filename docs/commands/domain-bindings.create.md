# domain-bindings.create Command Spec

## Normative Contract

`domain-bindings.create` is the source-of-truth command for creating a durable domain binding.

A domain binding is a long-lived routing business object. It binds a public domain name and optional path prefix to a project/environment/resource placement policy. It is not the same thing as a deployment route snapshot or generated default access route.

Command success means the domain binding request has been accepted and a binding id is available. It does not mean DNS ownership is verified, certificate issuance has completed, or the domain is ready for traffic.

```ts
type CreateDomainBindingResult = Result<{ id: string }, DomainError>;
```

The command contract is:

- admission failure returns `err(DomainError)`;
- accepted requests return `ok({ id })`;
- accepted requests persist a domain binding state such as `requested` or `pending_verification`;
- accepted requests persist the expected public DNS target and initial DNS observation state when
  the target can be derived safely;
- accepted requests publish `domain-binding-requested`;
- DNS/proxy/certificate readiness progresses asynchronously.

## Global References

This command inherits:

- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-005: Domain Binding Owner Scope](../decisions/ADR-005-domain-binding-owner-scope.md)
- [ADR-006: Domain Verification Strategy](../decisions/ADR-006-domain-verification-strategy.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Purpose

Create a durable domain binding for a resource or route owner so future deployments can reuse a verified domain and certificate lifecycle.

It is not:

- a deployment command;
- a deployment route snapshot;
- a generated default access route;
- a certificate issuance command;
- a DNS provider adapter call;
- a Web wizard step;
- a query/read-model operation.

## Entry Surfaces And Resource Scope

`domain-bindings.create` is a standalone command, but the binding owner is resource-scoped. Web, CLI, API, automation, and future MCP tools must all dispatch the same command semantics.

Web must provide a resource-scoped affordance from the resource detail page so a user can bind a domain while looking at the resource that will receive traffic. That affordance preloads the current resource's project, environment, resource, and destination context when available, but it must still submit the same `domain-bindings.create` input model.

The standalone domain bindings page may remain as a cross-resource management and creation surface. It must not define different ownership, validation, or lifecycle rules from the resource-scoped surface.

CLI and API remain strict operation entrypoints. CLI may collect missing values interactively in the future; API must require explicit input and must not prompt.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `projectId` | Required | Project that owns the domain binding. |
| `environmentId` | Required | Environment scope for the binding. |
| `resourceId` | Required | Resource that receives traffic for this binding. |
| `serverId` | Required | Deployment target/server that will serve the route. |
| `destinationId` | Required | Destination on the server for route placement. |
| `domainName` | Required | Public DNS hostname. Must not include scheme, path, or port. |
| `pathPrefix` | Optional | Route path prefix. Defaults to `/`. |
| `edgeProxyProviderKey` | Optional | Opaque provider key. When omitted, the binding uses the target/server's resolved edge proxy provider. |
| `tlsMode` | Optional | `auto` or `disabled`. Defaults to `auto`. |
| `certificatePolicy` | Optional | `auto`, `manual`, or `disabled`. Defaults from `tlsMode`. |
| `idempotencyKey` | Optional but recommended | Caller-supplied dedupe key for repeated create attempts. |

## Admission Flow

The command must:

1. Validate command input.
2. Normalize and validate `domainName`.
3. Validate `pathPrefix`, optional edge proxy provider key, and `tlsMode`.
4. Resolve project, environment, resource, server, and destination.
5. Reject cross-project/environment/destination mismatches.
6. Reject duplicate active bindings for the same normalized `domainName`, `pathPrefix`, and environment/resource scope.
7. Reject durable bindings when the target resolves to no edge proxy provider or to a provider that does not support durable domain routes.
8. Persist a durable binding in `requested` or `pending_verification`.
9. Allocate and persist the first domain verification attempt id according to ADR-006.
10. Persist initial DNS observation state such as `pending` with the expected Appaloft edge target.
11. Publish or record `domain-binding-requested` with the verification attempt id.
12. Return `ok({ id })`.

## Async Progression

Required progression:

```text
domain-bindings.create
  -> domain-binding-requested
  -> DNS observation pending | matched | mismatch | unresolved | lookup_failed
  -> domain-bound
  -> certificate-requested, when certificatePolicy is auto
  -> certificate-issued | certificate-issuance-failed
  -> domain-ready, when route and TLS gates are satisfied
```

If TLS is disabled, `domain-ready` may follow `domain-bound` after route/proxy readiness is satisfied.

If manual certificate policy is used, `domain-ready` requires the manually supplied certificate state to be valid and attached.

## Events

Canonical event specs:

- `domain-binding-requested`: binding request accepted and durable binding state exists.
- `domain-bound`: domain binding ownership/route requirements are satisfied.
- `certificate-requested`: certificate issuance or renewal requested.
- `certificate-issued`: certificate is issued and durable certificate state exists.
- `certificate-issuance-failed`: certificate issuance attempt failed.
- `domain-ready`: domain binding is ready for traffic according to routing and TLS policy.

## Domain-Specific Error Codes

All errors use [Error Model](../errors/model.md). Command-specific codes and phases:

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input shape, domain name, path prefix, edge proxy provider key, or TLS mode is invalid. |
| `not_found` | `context-resolution` | No | Project, environment, resource, server, or destination is missing. |
| `conflict` | `domain-binding-admission` | No | Active binding already owns the same normalized domain/path/scope. |
| `domain_binding_proxy_required` | `domain-binding-admission` | No | Durable binding requested for a no-proxy target or unsupported edge proxy provider. |
| `domain_binding_context_mismatch` | `context-resolution` | No | Resource, environment, server, destination, or project relationship is inconsistent. |
| `infra_error` | `domain-binding-persistence` or `event-publication` | Conditional | Binding could not be safely persisted or event recorded. |

DNS verification, public DNS propagation, proxy route realization, and certificate failures after acceptance are async-processing failures and must be represented through binding/certificate state, DNS observation, route proof/readiness state, and events where applicable. A pending or stale public DNS answer after command admission must not turn command success into failure.

## Handler Boundary

The handler must delegate to an application use case and return typed `Result`.

It must not:

- perform DNS provider calls directly;
- issue certificates directly;
- mutate deployment attempts;
- update read models directly;
- perform Web/CLI prompt logic;
- convert deployment access-route hints into durable bindings without an explicit command.

## Relationship To deployments.create

`deployments.create` must not carry edge proxy provider keys, domains, path prefix, or TLS mode.

`domain-bindings.create` creates durable domain ownership and readiness state. Future deployment admission may reuse a ready domain binding, but deployment creation must not implicitly create one.

Generated default access routes are governed by [ADR-017](../decisions/ADR-017-default-access-domain-and-proxy-routing.md). They may provide a convenience public URL without creating a `DomainBinding`.

Manual ownership confirmation after creation is governed by
[`domain-bindings.confirm-ownership`](./domain-bindings.confirm-ownership.md). Generated default
access URLs such as sslip hostnames must not be interpreted as confirmed custom-domain ownership.

## Current Implementation Notes And Migration Gaps

Current code models routing as runtime-plan `accessRoutes` with `proxyKind`, `domains`, `pathPrefix`, and `tlsMode`.

Generated default access routes and their provider-neutral route snapshots are not yet implemented as distinct state from durable `DomainBinding`.

Current runtime adapters generate concrete proxy Docker labels and can ensure an edge proxy container/network for proxy-backed access routes. ADR-019 moves those provider-specific decisions behind edge proxy provider packages.

Current persistence snapshots deployment access routes on deployment runtime plan/read model data; those snapshots remain separate from durable domain bindings.

Current code now includes a first-class `DomainBinding` aggregate, repository port, PostgreSQL/PGlite persistence, `domain-bindings.create` command schema/message/handler/use case, operation catalog entry, oRPC/OpenAPI create route, CLI create command, `domain-bindings.list` read/query surface, a standalone Web console create/list entrypoint, and a resource-scoped Web detail-page entrypoint.

Current `domain-bindings.create` persists the binding in `pending_verification`, allocates the first manual verification attempt, publishes `domain-binding-requested`, returns `ok({ id })`, rejects `proxyKind = none`, detects active owner-scope duplicates, and supports idempotency key reuse. The `proxyKind` field is now provider-selection migration data; the target command resolves edge proxy provider eligibility through server/target state and optional `edgeProxyProviderKey`.

`domain-bindings.confirm-ownership` now implements the manual confirmation step that publishes
`domain-bound`. Certificate issuance and `domain-ready` process-manager behavior are implemented as
separate follow-on workflow steps outside `domain-bindings.create`.

Current code records initial DNS observation metadata on accepted bindings, but live public DNS
lookup, user-triggered recheck, and confirmation-file route proof remain follow-up workflow work.

## Open Questions

- None for the current `domain-bindings.create` baseline. Owner scope is governed by ADR-005 and verification strategy is governed by ADR-006.
