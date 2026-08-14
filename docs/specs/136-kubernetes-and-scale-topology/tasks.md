# Tasks: Kubernetes And Scale Topology

## Governance

- [x] Merge ADR-114, Spec 136 and the `K8S-*`/`SCALE-*`/`ROLLOUT-*` Test Matrix.
- [x] Create R5a–R5d actor-visible public Tickets and mark the ready frontier `ready-for-agent`.

## R5a Existing Cluster

- [x] RED `K8S-PROFILE-001`–`K8S-CLEAN-008`, `K8S-SURFACE-017`, `K8S-E2E-018`.
- [x] Implement target profile/readiness, stateless OCI backend, normalized observation and cleanup.
- [x] Run disposable real-cluster packet and exact residual check.

## R5b Scale And Rollout

- [x] RED `SCALE-PROFILE-009`–`ROLLOUT-PROFILE-011` and `K8S-COMPOSE-012`.
- [x] Implement portable scale/rollout profiles, capability negotiation and service graph translation.
- [x] Prove convergence, failed rollout preservation and no-effect unsupported targets.

## R5c Stateful And Packaging

- [x] RED `K8S-HELM-013`, `K8S-STATEFUL-014`, `K8S-E2E-019`.
- [x] Implement bounded Helm lifecycle and Kubernetes storage/dependency realization.
- [x] Prove backup, independent restore, upgrade/rollback and exact cleanup.

## R5d Managed And Multi-Cluster

- [x] RED and GREEN public automated coverage for `K8S-MULTI-015`, `K8S-MANAGED-016` and the R5d
  portion of `K8S-SURFACE-017`.
- [x] Implement provider-neutral target-pool placement/failover/fencing and typed managed-cluster
  connector plan/apply/readback/delete contracts with exact accepted-plan binding.
- [x] Adopt the public protocol through Cloud/Enterprise custody, policy, entitlement and provider
  adapters, including the managed-cluster Web surface.
- [x] Run authorized managed/design-partner isolation, failover, recovery, cost/support and cleanup packet.

## Final Sync

- [x] Run public full gates, Cloud composed gates, docs-impact and final Boundary Review.
- [x] Sync all subprofile claims/evidence; close total R5 only after R5a–R5d pass.
