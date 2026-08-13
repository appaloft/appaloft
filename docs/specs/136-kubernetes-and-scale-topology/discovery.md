# Kubernetes And Scale Topology — Grill / Discovery

## Status

- Round: Grill complete.
- Owner confirmation: owner delegated all recommended R4/R5 decisions and authorized complete
  implementation after governing artifacts and Tickets exist.
- Product target: R5 Scale Topology after the R4 replacement gate.

## Business Outcome

An operator can connect an existing Kubernetes cluster, deploy the same Appaloft workload through
the existing operation surface, then opt into portable scaling and rollout policies. Cloud or
Enterprise can additionally provision/manage cluster capacity through injected connectors without
forking the public deployment model.

## Owner-Delegated Recommended Decisions

| Frontier | Accepted answer | Consequence |
| --- | --- | --- |
| Completion shape | R5 is a sequence: R5a existing-cluster stateless OCI; R5b scale/rollout; R5c stateful/Helm; R5d managed/multi-cluster Enterprise acceptance. | R5a cannot be reported as total R5 completion. |
| Deployment command | Keep ids-only `deployments.create`. | No Kubernetes command or manifest fields in admission. |
| Target configuration | Add provider-neutral Runtime Target Profile with opaque connection/placement/routing/registry references. | Kubeconfig and provider details stay adapter/secret-store owned. |
| Registration | Existing `orchestrator-cluster` + provider key identifies target; readiness is a separate query. | Server/DeploymentTarget remains the target owner until vocabulary is broadened later. |
| Namespace isolation | Adapter derives a stable Appaloft-owned namespace from target profile + tenant/project/environment policy. | Callers cannot submit arbitrary namespaces to deploy. |
| Workload | Start with prebuilt OCI image; then support existing build artifacts, Compose graph translation and Helm source under explicit capabilities. | Unsupported artifact fails before apply. |
| Observation | Logs, health, diagnostics, proof and cleanup stay normalized. | No Pod/Deployment/Job API objects leak into public read models. |
| Scaling | Add provider-neutral desired replicas/resources and optional horizontal scaling policy to Resource profile. | Single-server targets fail before mutation when enforcement is unavailable. |
| Rollout | Add provider-neutral recreate/rolling/canary policy with verification and rollback gates. | Adapter owns target-specific render/apply details. |
| Stateful | Reuse StorageVolume/DependencyResource/backup contracts and add Kubernetes realization capabilities. | PVC/StorageClass/StatefulSet stay adapter-owned. |
| Managed clusters | Public connector/capability protocol; Cloud/Enterprise owns provider selection, tenant policy, entitlement, custody, billing and support. | No public managed-product strategy. |
| R5 exit | Contract parity, isolation, rollback, cleanup and real existing + managed design-partner packets. | Unit/fake-only evidence is insufficient. |

## Boundary Classification

| Addition | Classification | Reason |
| --- | --- | --- |
| Runtime target profile, scale/rollout profiles and Kubernetes adapter | `MOVE_PUBLIC` | Neutral self-host/Cloud/Enterprise behavior. |
| Existing Deployment/Resource/Storage/Dependency operations | `REUSE_PUBLIC` | They remain lifecycle truth. |
| Managed provider policy, entitlement, custody, billing and support topology | `KEEP_PRIVATE` | Hosted commercial responsibility. |
| Cloud Kubernetes core or Kubernetes fields in deployment DTOs | `DELETE_OR_MERGE` | Violates ADR-023. |

## Rejected Alternatives

- A separate `kubernetes deploy` command, raw manifest/Helm values in business operations, or raw
  kubeconfig in DeploymentTarget state.
- Implementing only `kubectl apply` and calling R5 complete without normalized readback, rollback,
  cleanup, stateful data and isolation.
- Cloud-only Kubernetes lifecycle or silent fallback from Kubernetes to Docker/Swarm.

## Open Questions

No architecture question blocks Spec. Each managed provider requires explicit external target,
cost, credentials, cleanup and design-partner authorization before its acceptance packet runs.
