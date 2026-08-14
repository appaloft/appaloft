# Kubernetes And Scale Topology

## Status

- Round: Spec.
- Artifact state: owner-accepted recommendation on 2026-08-13.
- Code changes allowed: after the public Ticket is `ready-for-agent`.
- Compatibility: additive pre-1.0 public operations/configuration and runtime backend.
- Governing decisions: ADR-023 and ADR-114.

## Business Outcome

The same Appaloft Resource and Deployment workflow runs on user-owned or managed Kubernetes with
provider-neutral target configuration, scaling, rollout, observation, recovery and data safety.

## Release Subprofiles

| Profile | Actor-visible outcome | Exit evidence |
| --- | --- | --- |
| R5a Existing Cluster | connect one cluster and deploy stateless OCI | readiness, apply, route, logs, health, proof, rollback, cleanup, isolation |
| R5b Scale And Rollout | configure portable resources/replicas/HPA and rolling/canary policy | capability blocker, convergence, failed rollout preservation, scale readback |
| R5c Stateful And Packaging | run storage/dependency workloads and optional Helm source | PVC/data, backup/independent restore, upgrade/rollback, cleanup |
| R5d Managed And Multi-Cluster | Cloud/Enterprise provisions capacity and places across managed targets | custody/authz/tenant isolation, failover, cost/support evidence, real design-partner packets |

R5 is complete only when all four profiles are verified. A profile may ship independently with its
exact narrower claim.

## Ubiquitous Language

| Term | Meaning |
| --- | --- |
| Runtime Target Profile | Provider-neutral references and capability policy for one DeploymentTarget. |
| Provider configuration reference | Opaque reference resolved only by the target adapter/secret boundary. |
| Scale profile | Resource-owned desired resources, replicas and optional horizontal scaling intent. |
| Rollout profile | Resource-owned portable replacement strategy and verification gates. |
| Target realization | Adapter-owned Kubernetes objects and sanitized identity implementing accepted public intent. |

## Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| K8S-PROFILE-001 | Target profile configure/read | active cluster target exists | profile is configured | only opaque refs and portable policy persist/read back; secret/provider payloads never appear. |
| K8S-READY-002 | Existing cluster readiness | profile and credential ref exist | readiness runs | API reachability, version, authorization, namespace/route/storage capabilities and stable blockers return without workload mutation. |
| K8S-ADM-003 | Ids-only admission | cluster target is selected | plan/create runs | deployment input stays ids-only; unsupported artifact/capability fails before apply and never falls back. |
| K8S-OCI-004 | Stateless OCI apply | prebuilt image and route exist | deployment executes | namespaced workload/service/route converge and sanitized identity is retained. |
| K8S-OBS-005 | Normalized observation | workload is running/failing | logs/health/diagnostics/proof run | existing provider-neutral contracts return bounded evidence without Kubernetes API DTOs. |
| K8S-ISO-006 | Tenant/project isolation | two scopes share a cluster | both deploy | namespace, service account, labels, network and cleanup remain fenced; cross-scope access fails. |
| K8S-ROLLBACK-007 | Failed replacement | prior healthy runtime exists | candidate fails | candidate is cleaned, prior runtime remains or is restored, and exact proof/readiness is visible. |
| K8S-CLEAN-008 | Exact cleanup | Appaloft-owned realization exists | cancel/delete/cleanup runs | only labeled receipt-owned objects are removed; user/other-tenant objects remain. |
| SCALE-PROFILE-009 | Portable scale profile | Resource requests replicas/resources/HPA | profile is configured/planned | supported targets enforce/read back; unsupported targets fail before deployment mutation. |
| SCALE-CONVERGE-010 | Scale convergence | scale policy is accepted | target reconciles | desired/current/ready replicas and metric decision are normalized and bounded. |
| ROLLOUT-PROFILE-011 | Portable rollout | recreate/rolling/canary policy exists | deployment runs | ordered traffic/readiness/promotion/rollback gates follow the accepted policy. |
| K8S-COMPOSE-012 | Service graph translation | Compose/Appaloft service graph is accepted | cluster planning runs | services translate to target-owned workloads/services with private networking and dependency secrets. |
| K8S-HELM-013 | Helm source lifecycle | chart source/version/values secret refs are configured | plan/apply/upgrade/rollback runs | rendered diff is reviewable, hooks/timeouts bounded, secrets redacted and release cleanup scoped. |
| K8S-STATEFUL-014 | Stateful realization | StorageVolume/DependencyResource exists | deploy/backup/restore runs | PVC/data readiness, backup, independent restore and rollback/cleanup evidence use existing owners. |
| K8S-MULTI-015 | Multi-cluster placement/failover | target pool and policy exist | placement/failure occurs | deterministic reason/readback, no silent topology fallback, bounded failover and orphan cleanup are proven. |
| K8S-MANAGED-016 | Managed cluster composition | entitled Cloud/Enterprise tenant requests capacity | connector plan/apply runs | public connector protocol is reused; private policy/custody/billing stays injected and auditable. |
| K8S-SURFACE-017 | Surface parity | capability is user-visible | CLI/API/SDK/Web/MCP uses it | shared operation schemas and stable docs/help expose configure, readiness and readback. |
| K8S-E2E-018 | Real existing-cluster packet | disposable conformant cluster exists | R5a journey runs | deploy/route/log/health/proof/rollback/cleanup passes with zero owned residual. |
| K8S-E2E-019 | Real scale/stateful packet | disposable cluster supports metrics/storage | R5b/R5c runs | HPA/rollout plus backup/restore/Helm lifecycle and exact cleanup pass. |
| K8S-E2E-020 | Real managed/design-partner packet | authorized managed target exists | R5d runs | provision/place/failover/recover/cleanup and tenant/cost/support evidence pass. |

## Public Surfaces

- Operations: configure/show Runtime Target Profile; configure/show Resource Scale and Rollout
  Profiles; readiness remains a Query; deployment remains ids-only.
- CLI/Web/API/SDK/MCP: shared operations and normalized observations.
- Provider adapter: Kubernetes implementation plus connector protocol for cluster provisioning.
- Managed connector protocol: `infrastructure.cluster.provision|inspect|delete|place|failover|recover|cleanup-orphans`
  uses typed plans/readback/receipts. Target pools rank eligible targets deterministically by policy,
  and failover/recovery carries a bounded attempt, monotonic placement epoch and fencing token.
- Mutating managed-cluster apply must be bound to the exact accepted plan; missing acceptance or
  parameter drift fails before provider effects.
- Repository config: portable scale/rollout and Helm source only after capability validation; never
  raw manifests, kubeconfig, arbitrary namespace, provider API objects or secret values.
- Docs: `/docs/servers/kubernetes/#kubernetes-runtime-target` and scaling/rollout/stateful sections.

## Non-Goals

- Replacing Kubernetes, exposing raw Kubernetes administration, or promising every CRD/operator.
- Silent fallback across target kinds, unmanaged arbitrary manifest application, or provider-specific
  state in public aggregates.

## Compatibility And Rollback

All surfaces are additive pre-1.0. A backend/profile can be disabled after cleanup while Resource,
Deployment and recovery history remains readable through normalized contracts.
