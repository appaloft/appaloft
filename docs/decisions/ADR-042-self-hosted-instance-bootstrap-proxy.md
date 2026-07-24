# ADR-042: Self-Hosted Instance Bootstrap Proxy

## Status

Accepted

## Context

The self-hosted installer must make the Appaloft console reachable before an operator can use the
console to configure projects, servers, resources, or domain bindings. Requiring users to manually
write Caddy, Nginx, or Traefik configuration before first login creates avoidable setup friction.

At the same time, the Appaloft console route is not a user application route. It exists before any
Project, Environment, Resource, Deployment, DomainBinding, or DeploymentTarget is selected.

## Decision

`install.sh` owns a special self-hosted **instance bootstrap route** for the Appaloft console.

- The installer defaults to a resident Traefik edge proxy.
- The installer-managed resident Traefik proxy uses the exact reviewed default owned by the
  Traefik edge proxy provider contract. Rerunning the installer reconciles an Appaloft-managed
  proxy to that default; an explicitly overridden image or an externally managed proxy remains
  operator-owned.
- When `--domain <domain>` is supplied, the installer writes a Traefik console route from that
  domain to the Appaloft app service and sets `APPALOFT_WEB_ORIGIN=https://<domain>`.
- When no domain is supplied, the installer keeps the console reachable through a direct host port
  fallback and derives `APPALOFT_WEB_ORIGIN` from the detected host and port.
- The default direct host port is `3721`; public domain traffic still uses Traefik on `80/443`.
  The port is intentionally memorable and may still be overridden with `--port` for local policy or
  conflict avoidance.
- The default persistence backend remains PostgreSQL for production self-hosting.
- The resident Traefik edge network is the same edge surface later used by workload routes.
- The instance bootstrap route is not a `Resource`, `DomainBinding`, deployment snapshot, or
  project-owned route.
- Changing the instance domain is an idempotent installer/bootstrap operation, not a general
  deployment admission command.

## Consequences

- Operators can run the installer without understanding `APPALOFT_WEB_ORIGIN` first.
- A domain install can create the console proxy route and TLS automation in one command.
- Project routes can reuse the same resident Traefik edge after the control plane is running.
- Web console surfaces may guide instance domain changes, but direct host Docker/proxy mutation from
  the Web app requires a separate operation and security review before becoming a write endpoint.

## Related Specs

- [Control-Plane Mode Selection And Adoption](../workflows/control-plane-mode-selection-and-adoption.md)
- [Edge Proxy Provider And Route Realization](../workflows/edge-proxy-provider-and-route-realization.md)
- [Control-Plane Modes Test Matrix](../testing/control-plane-modes-test-matrix.md)
