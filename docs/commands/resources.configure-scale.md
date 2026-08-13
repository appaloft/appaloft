# resources.configure-scale Command Spec

## Normative Contract

`resources.configure-scale` atomically replaces the portable scale profile used by future
deployments of one Resource. Success persists the profile and emits
`resource-scale-profile-configured`; it does not resize the currently running deployment.

## Input

| Field | Requirement | Meaning |
| --- | --- | --- |
| `resourceId` | Required | Existing active Resource. |
| `scaleProfile.replicas` | Required, positive integer | Baseline desired replicas. |
| CPU/memory request and limit fields | Optional positive integers | Millicores and mebibytes. Requests must not exceed matching limits. |
| `scaleProfile.horizontal` | Optional complete group | `minReplicas`, `maxReplicas`, and CPU utilization target; partial groups are rejected. |

The command validates portable policy only. A deployment adapter must still prove target support
before mutation. Kubernetes requires the HPA and `metrics.k8s.io` APIs when horizontal scaling is
configured; absence fails closed without applying a candidate.

## Entrypoints

- CLI: `appaloft resource configure-scale <resourceId> --replicas <n>` plus optional resource and
  complete HPA flags.
- HTTP/oRPC: `POST /api/resources/{resourceId}/scale-profile`.
- Web, SDK, and MCP use the same operation key and schema.
- `resources.show` reads the persisted profile and normalized deployment scale observation back.

## References

- [ADR-114](../decisions/ADR-114-kubernetes-runtime-target-and-scale-policy-boundary.md)
- [Spec 136](../specs/136-kubernetes-and-scale-topology/spec.md)
- [Kubernetes And Scale Topology Test Matrix](../testing/kubernetes-scale-topology-test-matrix.md)

