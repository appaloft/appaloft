# Served Route Terminal Verification

## Status

Spec confirmed for the 2026-08-17 deployment-correctness repair.

## Governing Sources

- [Discovery](./discovery.md)
- [Routing, Domain And TLS](../../workflows/routing-domain-and-tls.md)
- [Docker Swarm Runtime Target](../045-docker-swarm-runtime-target/spec.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](../../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [ADR-023: Runtime Orchestration Target Boundary](../../decisions/ADR-023-runtime-orchestration-target-boundary.md)
- [Routing Test Matrix](../../testing/routing-domain-and-tls-test-matrix.md)
- [Served Route Terminal Verification Test Matrix](../../testing/served-route-terminal-verification-test-matrix.md)

## Problem

Local and Generic SSH Docker/Compose execution currently select one served route and one domain for
terminal public HTTP verification. A deployment can therefore report success while another route
or domain in the same immutable route snapshot is broken. Docker Swarm promotes route ownership
after task convergence but does not yet prove every promoted public route or restore the previous
route owner when that public proof fails.

## Accepted Behavior

A deployment that requests public HTTP verification reaches terminal success only after every
distinct served route applicable to the deployed target service passes.

The verification set is the deterministic expansion of:

```text
served access route
  x every normalized domain on that route
  x path prefix joined with the Resource health path
```

Redirect routes are excluded. Duplicate normalized URLs are checked once. When a Compose target
service is explicit, only served routes targeting that service are required; legacy routes without
target-service metadata remain eligible fallback evidence. A route for a different explicit
service cannot prove the deployed target service.

Health-disabled Resources preserve the existing opt-out and do not acquire an implicit public
network probe.

## Acceptance Criteria

| ID | Scenario | Expected result |
| --- | --- | --- |
| `ROUTE-TERM-SPEC-001` | One served route contains two domains. | Both domain URLs are verified before terminal success. |
| `ROUTE-TERM-SPEC-002` | One target service owns multiple served path routes. | Every distinct path/domain URL for that service is verified; a failure fails the candidate. |
| `ROUTE-TERM-SPEC-003` | Route snapshot also contains a redirect and a route for another explicit service. | Redirect and unrelated-service routes are excluded from workload health verification. |
| `ROUTE-TERM-SPEC-004` | Local or Generic SSH Docker/Compose verification fails on the second or later URL. | Candidate cleanup runs, superseded cleanup does not run, and deployment is terminal failed with safe failing-route evidence. |
| `ROUTE-TERM-SPEC-005` | Swarm candidate converges and route labels are promoted, then one public route fails. | Previous route ownership is restored and verified before failed-candidate cleanup; success is not reported. |
| `ROUTE-TERM-SPEC-006` | All Swarm route URLs pass. | Superseded service cleanup runs only after the complete public proof. |
| `ROUTE-TERM-SPEC-007` | Health checks are disabled. | Existing opt-out remains; no public route verification command is introduced. |
| `ROUTE-TERM-SPEC-008` | URLs normalize to duplicates. | Verification order is deterministic and each distinct URL is probed once. |

## Compatibility

- No command, API, CLI, Web, event or persisted aggregate shape changes.
- Single-route deployments keep the same result and error families.
- The repair intentionally makes previously partial multi-route success fail closed.
- Redirect correctness remains deployment-proof evidence rather than workload health.

## Non-Goals

- DNS ownership or certificate issuance lifecycle changes.
- Provider-native route configuration as public command input.
- Treating one canonical route as proof for unrelated path/service routes.
- Enabling health checks for Resources that explicitly disabled them.
