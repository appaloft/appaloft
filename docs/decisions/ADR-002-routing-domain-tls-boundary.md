# ADR-002: Routing, Domain, And TLS Boundary

Status: Accepted

Date: 2026-04-14

## Decision

Routing, domain ownership, generated default access, and TLS lifecycle are separate from deployment command input.

`deployments.create` must not accept public routing/domain/TLS fields such as:

- `proxyKind`;
- `domains`;
- `pathPrefix`;
- `tlsMode`;
- generated access-domain provider settings;
- certificate policy.

Deployment attempts may still carry an immutable resolved access-route snapshot. That snapshot is derived from resource, server, domain binding, certificate, and default access domain policy state during deployment planning/execution. It is not submitted by the caller as deployment command input.

Durable custom domains must use `domain-bindings.create`. A durable binding may either serve
traffic or act as a canonical redirect alias to another served durable binding in the same
resource/path owner scope. Certificate issuance, renewal, and import must use certificate commands.
Generated default access domains are governed by
[ADR-017](./ADR-017-default-access-domain-and-proxy-routing.md) and must be provided through
provider-neutral ports/adapters instead of deployment input.

Pure CLI/SSH server-applied config domains are governed by
[ADR-024](./ADR-024-pure-cli-ssh-state-and-server-applied-domains.md). Their route state may include
provider-neutral canonical redirect aliases, but those aliases remain server-local route intent in
pure CLI mode and must not be submitted to `deployments.create`.

Future routing commands may include:

- `resource-access.configure-default-route`;
- `domain-bindings.update-route`;
- `domain-bindings.remove`;
- `certificates.issue-or-renew`;
- `certificates.import`.

Those commands must not be inferred from `deployments.create` without an explicit operation-catalog entry and spec.

## Governed Specs

- [deployments.create Command Spec](../commands/deployments.create.md)
- [deployments.create Workflow Spec](../workflows/deployments.create.md)
- [Default Access Domain And Proxy Routing Workflow Spec](../workflows/default-access-domain-and-proxy-routing.md)
- [Routing Domain And TLS Workflow Spec](../workflows/routing-domain-and-tls.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Domain Model](../DOMAIN_MODEL.md)

## Implementation Requirements

Deployment route snapshots may contain generated or durable access routes, runtime labels/config intent, network requirements, proxy container requirements, and public verification metadata.

Route snapshots must be resolved from:

- `ResourceNetworkProfile`;
- ready or pending durable `DomainBinding` state when explicitly allowed, including redirect-only
  aliases that still require ownership and TLS coverage for the redirecting host;
- configured default access domain policy;
- selected deployment target/server public address and proxy readiness;
- certificate/TLS state when TLS is required.

Runtime adapters may ensure shared proxy infrastructure, route labels, Docker networks, Caddy/Traefik config, or equivalent provider-specific runtime configuration when a runtime plan requires proxy-backed access.

Deployment creation must not:

- accept domain/proxy/TLS fields in the command schema;
- mutate a domain-binding aggregate as an implicit side effect;
- issue or renew certificates as an implicit side effect;
- change DNS ownership records as a hidden side effect;
- know provider-specific generated-domain brands or suffixes in core/application code;
- make route ownership decisions that outlive the deployment attempt.

When a product requirement needs persistent custom domains, certificates, route reuse across deployments, custom TLS renewal, or domain validation, that work must be modeled through explicit commands and specs.

## Consequences

Initial deployment flows can expose applications through generated provider-backed routes when policy, proxy readiness, and resource network profile are available.

The routing boundary remains clear:

- deployment attempts carry resolved snapshots;
- resources own source/runtime/network profile;
- `DomainBinding` owns durable custom domain state and managed canonical redirect policy;
- certificate workflows own TLS state;
- provider adapters own concrete generated-domain behavior.

## Superseded Open Questions

- Should routing/domain/TLS hints remain part of deployment or move to separate routing/domain binding commands?
- Should generated default access domains be represented as durable domain bindings?
- Should provider-specific generated-domain services be part of core/application domain language?

## Current Implementation Notes And Migration Gaps

Current runtime adapters can still consume runtime-plan access routes and generate proxy labels/config.

Current adapter-facing deployment config still contains route hint fields that must be replaced by resolved route snapshots from resource/domain/default-access state.

Current `domain-bindings.create` implements the durable custom-domain admission segment, but DNS verification, certificate issuance, and domain readiness are still future workflow work.

## Open Questions

- None for the routing/domain/TLS boundary. Operator-facing configuration command names for default access policy remain future behavior governed by ADR-017.
