# Tasks: Kubernetes And Scale Topology

## Governance

- [x] Merge ADR-114, Spec 136 and the `K8S-*`/`SCALE-*`/`ROLLOUT-*` Test Matrix.
- [x] Create R5a–R5d actor-visible public Tickets and mark the ready frontier `ready-for-agent`.

## R5a Existing Cluster

- [x] RED `K8S-PROFILE-001`–`K8S-CLEAN-008`, `K8S-SURFACE-017`, `K8S-E2E-018`.
- [x] Implement target profile/readiness, stateless OCI backend, normalized observation and cleanup.
- [x] Run disposable real-cluster packet and exact residual check.

## R5b Scale And Rollout

- [ ] RED `SCALE-PROFILE-009`–`ROLLOUT-PROFILE-011` and `K8S-COMPOSE-012`.
- [ ] Implement portable scale/rollout profiles, capability negotiation and service graph translation.
- [ ] Prove convergence, failed rollout preservation and no-effect unsupported targets.

## R5c Stateful And Packaging

- [ ] RED `K8S-HELM-013`, `K8S-STATEFUL-014`, `K8S-E2E-019`.
- [ ] Implement bounded Helm lifecycle and Kubernetes storage/dependency realization.
- [ ] Prove backup, independent restore, upgrade/rollback and exact cleanup.

## R5d Managed And Multi-Cluster

- [ ] RED `K8S-MULTI-015`, `K8S-MANAGED-016`, `K8S-E2E-020`.
- [ ] Implement public connector/placement/failover protocol; adopt through Cloud/Enterprise adapters.
- [ ] Run authorized managed/design-partner isolation, failover, recovery, cost/support and cleanup packet.

## Final Sync

- [ ] Run public full gates, Cloud composed gates, docs-impact and final Boundary Review.
- [ ] Sync all subprofile claims/evidence; close total R5 only after R5a–R5d pass.
