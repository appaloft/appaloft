# ADR-005: Domain Binding Owner Scope

Status: Accepted

Date: 2026-04-14

## Decision

The first durable `DomainBinding` owner scope is `resourceId` within a project and environment.

A domain binding must reference:

- `projectId`;
- `environmentId`;
- `resourceId`;
- `serverId`;
- `destinationId`;
- normalized `domainName`;
- `pathPrefix`;
- `proxyKind`;
- `tlsMode` / certificate policy.

Project-level and environment-level domain ownership are future capabilities and must be introduced through explicit specs and ADRs before implementation relies on them.

## Context

The domain model treats `Resource` as the deployable unit inside a project/environment, while `Destination` and `DeploymentTarget` define runtime placement.

Durable domain binding needs a stable owner for conflict detection, read models, certificate lifecycle, and deployment admission. Resource-level ownership matches the deployment flow and avoids creating broad routing semantics before project-level and environment-level routing rules exist.

## Options Considered

| Option | Rule | Result |
| --- | --- | --- |
| Resource-owned binding | Domain binding belongs to one resource in one project/environment and one destination/server placement. | Chosen. |
| Environment-owned binding | Domain binding belongs to an environment and routes later to resources. | Deferred. Requires route-selection policy. |
| Project-owned binding | Domain binding belongs to a project and can be shared across environments/resources. | Deferred. Requires ownership, conflict, and promotion semantics. |
| Deployment-owned binding | Domain binding belongs to one deployment attempt. | Rejected. This duplicates deployment runtime access-route intent and is not durable enough. |

## Chosen Rule

`domain-bindings.create` must require `resourceId` for the first implementation.

Uniqueness must be enforced at least by normalized `(projectId, environmentId, resourceId, domainName, pathPrefix)`. Implementations may also enforce stronger global uniqueness for `(domainName, pathPrefix)` if the deployment profile requires exclusive ownership across the installation.

Future environment/project-level bindings must not be faked by using a placeholder resource. They require explicit command input, specs, read-model behavior, and conflict policy.

## Consequences

Deployment admission can reuse ready domain bindings for a specific resource without guessing route ownership.

The first implementation avoids ambiguous questions such as cross-environment domain promotion, shared apex domains, and path-based routing to multiple resources.

The model remains extensible: environment-level and project-level routing can be added later without changing the meaning of existing resource-owned bindings.

## Governed Specs

- [domain-bindings.create Command Spec](../commands/domain-bindings.create.md)
- [Routing, Domain Binding, And TLS Workflow Spec](../workflows/routing-domain-and-tls.md)
- [Routing, Domain Binding, And TLS Error Spec](../errors/routing-domain-tls.md)
- [Routing, Domain Binding, And TLS Test Matrix](../testing/routing-domain-and-tls-test-matrix.md)
- [ADR-002: Routing, Domain, And TLS Boundary](./ADR-002-routing-domain-tls-boundary.md)

## Current Implementation Notes And Migration Gaps

Current code has deployment runtime access routes but no durable `DomainBinding` aggregate or owner scope.

## Superseded Open Questions

- Should the first durable binding owner be `resourceId` only, or should bindings support environment-level and project-level routing ownership from the start?
