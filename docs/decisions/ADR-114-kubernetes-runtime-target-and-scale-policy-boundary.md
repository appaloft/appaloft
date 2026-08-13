# ADR-114: Kubernetes Runtime Target And Scale Policy Boundary

Status: Accepted

Date: 2026-08-13

## Context

ADR-023 reserves Kubernetes as a runtime target behind ids-only deployment admission. R5 now needs
durable target connection policy, portable scaling/rollout intent, stateful realization and managed
composition without leaking Kubernetes or hosted product models into core operations.

## Decision

1. Kubernetes is registered as `orchestrator-cluster` with provider key `kubernetes` and selected by
   the existing runtime target registry.
2. A provider-neutral Runtime Target Profile stores only opaque connection, credential, placement,
   routing, registry and capability-policy references. Provider documents and secrets remain adapter-owned.
3. `deployments.create` stays ids-only. Arbitrary namespace, manifest, Helm values, kubeconfig,
   ingress class and pull-secret input remains rejected.
4. Namespace/service-account/labels/network isolation are deterministic adapter policy derived from
   accepted tenant/project/environment context; no caller-controlled cross-scope placement.
5. Resource-owned Scale and Rollout Profiles express portable desired behavior. Target adapters
   declare capabilities and either enforce/read back or fail before deployment mutation.
6. Kubernetes workloads, Services, Ingress/Gateway objects, ConfigMaps, Secrets, HPAs, PVCs,
   StatefulSets and Helm releases are target realizations, not core aggregate state.
7. Existing normalized logs, health, diagnostics, proof, rollback, StorageVolume and
   DependencyResource backup/restore contracts remain authoritative.
8. Managed cluster provisioning uses public connector capability contracts. Cloud/Enterprise owns
   provider selection, tenancy, entitlement, credential custody, billing, support and managed defaults.

## Consequences

Self-hosted users can connect their clusters without Cloud. Docker, Swarm and Kubernetes share
business operations while capability gaps fail closed. R5 can add scale without turning Appaloft
into a raw Kubernetes client or making Community depend on private code.

## Rejected Alternatives

A Kubernetes-specific deployment command, raw manifest storage, kubeconfig in DeploymentTarget,
Cloud-only orchestration core, silent target fallback and adapter-default autoscaling with no public
policy/readback.

## Verification

See Spec 136 and `docs/testing/kubernetes-scale-topology-test-matrix.md`.
