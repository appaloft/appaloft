# ADR-002: Routing, Domain, And TLS Boundary

Status: Accepted

Date: 2026-04-14

## Decision

`deployments.create` owns runtime access-route intent for the deployment attempt. It does not own long-lived domain binding, DNS ownership, certificate issuance, or certificate renewal as hidden side effects.

The following fields remain valid deployment command hints for runtime plan creation and deployment snapshotting:

- `proxyKind`;
- `domains`;
- `pathPrefix`;
- `tlsMode`.

These fields describe desired access routes for the deployment runtime plan. They do not create a persisted `DomainBinding`, `Certificate`, or routing aggregate by themselves.

Separate routing/domain/certificate commands are required before the platform treats domain ownership, certificate lifecycle, or route mutation as durable business objects independent of a deployment attempt.

Future commands may include:

- `routing.bind-domain`;
- `routing.update-route`;
- `routing.remove-route`;
- `certificates.issue`;
- `certificates.renew`;

Those commands must not be inferred from `deployments.create` without an explicit operation-catalog entry and spec.

## Governed Specs

- [deployments.create Command Spec](../commands/deployments.create.md)
- [deployments.create Workflow Spec](../workflows/deployments.create.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Domain Model](../DOMAIN_MODEL.md)

## Implementation Requirements

Runtime plan resolution may convert `proxyKind`, `domains`, `pathPrefix`, and `tlsMode` into access routes, runtime labels, network requirements, proxy container requirements, and deployment runtime metadata.

Deployment persistence must snapshot the access-route intent needed to inspect, verify, reattach, or roll back the deployment attempt.

Runtime adapters may ensure shared proxy infrastructure, route labels, Docker networks, or equivalent provider-specific runtime configuration when a runtime plan requires proxy-backed access.

Deployment creation must not:

- mutate a future domain-binding aggregate;
- issue or renew certificates as an implicit domain command;
- change DNS ownership records as a hidden side effect;
- make route ownership decisions that outlive the deployment attempt.

When a future product requirement needs persistent domains, certificates, route reuse across deployments, custom TLS renewal, or domain validation, that work must be modeled through explicit commands and specs.

## Consequences

Initial deployment flows can expose applications through direct host-port routes or proxy-backed access routes without blocking on a full domain/certificate bounded context.

The routing boundary remains clear: deployment attempts can carry runtime access intent, while durable domain and certificate lifecycle remain future explicit operations.

## Superseded Open Questions

- Should routing/domain/TLS hints remain part of deployment or move to a separate routing/domain binding command?
