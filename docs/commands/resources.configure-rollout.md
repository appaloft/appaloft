# resources.configure-rollout Command Spec

## Normative Contract

`resources.configure-rollout` atomically replaces the portable rollout profile used by future
deployments of one Resource. Success persists the profile and emits
`resource-rollout-profile-configured`; it does not redeploy the current runtime.

## Input And Gates

| Strategy | Conditional fields | Runtime behavior |
| --- | --- | --- |
| `recreate` | No rolling/canary fields | Replace according to target recreate semantics. |
| `rolling` | Optional `maxUnavailable` and `maxSurge` | Use target rolling update semantics. |
| `canary` | Complete initial traffic, step traffic, and interval group | Preserve the stable deployment, prove candidate readiness, apply bounded weighted steps, prove route convergence at every step, and retain stable on failure. |

Canary fields are rejected for non-canary strategies. The Kubernetes implementation currently
requires one health-checked Traefik-routed workload, ready stable endpoints, EndpointSlice support,
Traefik `IngressRoute`/`TraefikService`/`Middleware` CRDs, and an externally reachable route whose
deployment identity can be proved. Service-graph canary is unsupported and fails before candidate
mutation. Failed promotion removes only the receipt-owned candidate namespace.

## Entrypoints

- CLI: `appaloft resource configure-rollout <resourceId> --strategy <recreate|rolling|canary>`.
- HTTP/oRPC: `POST /api/resources/{resourceId}/rollout-profile`.
- Web, SDK, and MCP use the same operation key and schema.
- `resources.show` reads the profile and rollout proof metadata back.

## References

- [ADR-114](../decisions/ADR-114-kubernetes-runtime-target-and-scale-policy-boundary.md)
- [Spec 136](../specs/136-kubernetes-and-scale-topology/spec.md)
- [Kubernetes And Scale Topology Test Matrix](../testing/kubernetes-scale-topology-test-matrix.md)

