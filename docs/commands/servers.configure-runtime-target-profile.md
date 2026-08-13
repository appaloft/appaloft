# servers.configure-runtime-target-profile Command Spec

## Metadata

- Operation key: `servers.configure-runtime-target-profile`
- Command class: `ConfigureServerRuntimeTargetProfileCommand`
- Handler: `ConfigureServerRuntimeTargetProfileCommandHandler`
- Use case: `ConfigureServerRuntimeTargetProfileUseCase`
- Domain / bounded context: Runtime topology / DeploymentTarget
- Current status: R5a Code Round
- Source classification: normative contract

## Normative Contract

This command atomically configures the provider-neutral Runtime Target Profile owned by one active
`orchestrator-cluster` DeploymentTarget. It never accepts kubeconfig content, tokens, private keys,
Kubernetes API objects, manifests, namespaces, provider SDK objects, or workload mutation fields.

```ts
type ConfigureServerRuntimeTargetProfileCommandInput = {
  serverId: string;
  connectionReference: string;
  credentialReference?: string;
  placementPolicyReference?: string;
  routingPolicyReference?: string;
  registryCredentialReference?: string;
  capabilityPolicyReference?: string;
};
```

Every reference is an opaque URI-like token resolved only by the runtime adapter or composition
root. `connectionReference` is required. Equivalent complete input returns `changed = false`,
performs no write, and emits no duplicate event. A real change persists the complete profile and
emits `deployment_target.runtime_target_profile_configured` with reference categories only.

The public Kubernetes composition recognizes
`builtin://kubernetes/ingress-controller/traefik-k3s` as a routing policy whose only external
ingress source is namespace `kube-system` plus Pod selector
`app.kubernetes.io/name=traefik`. Other references require an injected resolver. Routed workload
admission fails before apply when the reference is absent, unresolved, wildcard-like, or resolves
to an empty Pod selector.

The target must exist in the caller's tenant scope, be active, and have
`targetKind = "orchestrator-cluster"`. Readback uses `servers.show`; live validation uses the
read-only `servers.runtime-readiness` query.

## Entrypoints

| Entrypoint | Mapping |
| --- | --- |
| CLI | `appaloft server configure-runtime-target-profile <serverId> --connection-reference <ref> [...]` |
| oRPC / HTTP | `POST /api/servers/{serverId}/runtime-target-profile` |
| SDK | Generated from the shared operation catalog and schema. |
| Web | Server detail Runtime Target panel submits the same complete profile. |
| MCP | Generated command descriptor dispatches the same command. |

## Governing References

- [ADR-114](../decisions/ADR-114-kubernetes-runtime-target-and-scale-policy-boundary.md)
- [Spec 136](../specs/136-kubernetes-and-scale-topology/spec.md)
- [Kubernetes And Scale Topology Test Matrix](../testing/kubernetes-scale-topology-test-matrix.md)
- [servers.show](../queries/servers.show.md)
- [servers.runtime-readiness](../queries/servers.runtime-readiness.md)
