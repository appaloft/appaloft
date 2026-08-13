# servers.runtime-readiness Query Spec

## Metadata

- Operation key: `servers.runtime-readiness`
- Query class: `InspectServerRuntimeReadinessQuery`
- Handler: `InspectServerRuntimeReadinessQueryHandler`
- Query service: `InspectServerRuntimeReadinessQueryService`
- Domain / bounded context: Runtime topology / RuntimeTargetBackend
- Current status: R5a Code Round
- Source classification: normative contract

## Normative Contract

This is the only live existing-cluster readiness operation. It is read-only and must not create,
patch, delete, label, authorize, bootstrap, repair, install, or otherwise mutate a cluster or an
Appaloft workload.

```ts
type InspectServerRuntimeReadinessInput = { serverId: string };

type InspectServerRuntimeReadinessResult = {
  schemaVersion: "servers.runtime-readiness/v1";
  serverId: string;
  targetKind: "orchestrator-cluster";
  status: "ready" | "blocked";
  checks: Array<{
    capability:
      | "api-reachability"
      | "version"
      | "authorization"
      | "namespace-isolation"
      | "routing"
      | "storage";
    status: "ready" | "blocked" | "unsupported";
    reasonCode?: string;
    message?: string;
  }>;
  checkedAt: string;
};
```

The query resolves the persisted Runtime Target Profile, selects the exact registered backend, and
returns stable provider-neutral blockers. A missing profile, missing backend, unresolved reference,
unreachable API, unsupported version, denied authorization, or required capability gap returns a
blocked result or typed failure without falling back to a single-server backend. No Kubernetes API
object, kubeconfig content, token, certificate, provider payload, namespace override, or secret
value may appear in the response, logs, traces, or errors.

For routing, readiness also resolves the opaque routing policy and verifies that every exact
namespace plus Pod-label selector currently selects at least one controller Pod. Merely discovering
the Ingress and Middleware APIs is insufficient. The check is read-only and never broadens the
policy when no controller matches.

## Entrypoints

| Entrypoint | Mapping |
| --- | --- |
| CLI | `appaloft server readiness <serverId>` |
| oRPC / HTTP | `GET /api/servers/{serverId}/runtime-readiness` |
| SDK | Generated from the shared operation catalog and schema. |
| Web | Server detail Runtime Target panel displays normalized checks. |
| MCP | Generated read-only query descriptor dispatches the same query. |

## Governing References

- [ADR-114](../decisions/ADR-114-kubernetes-runtime-target-and-scale-policy-boundary.md)
- [Spec 136](../specs/136-kubernetes-and-scale-topology/spec.md)
- [Kubernetes And Scale Topology Test Matrix](../testing/kubernetes-scale-topology-test-matrix.md)
- [servers.configure-runtime-target-profile](../commands/servers.configure-runtime-target-profile.md)
