# Plan: Kubernetes And Scale Topology

## Governing Sources

- ADR-023, ADR-114, Spec 136 and `docs/testing/kubernetes-scale-topology-test-matrix.md`.
- Existing runtime target registry, Swarm contract, Resource profile, deployment recovery,
  StorageVolume, DependencyResource, connector and proof sources.

## Architecture Approach

1. Add provider-neutral Runtime Target Profile operations with opaque provider/secret references.
2. Extend runtime target capabilities for readiness, scale, rollout, stateful and Helm realization.
3. Implement Kubernetes intent rendering and a bounded command/API runner entirely in the runtime
   adapter package; no Kubernetes type crosses into core/application contracts.
4. Add Resource Scale/Rollout profile operations and normalized observation.
5. Reuse existing deployment, logs, health, proof, backup/restore and cleanup operations.
6. Expose cluster provisioning only through the public connector capability protocol; Cloud and
   Enterprise provide private adapters/policy.

## Test-First Strategy

- Target profile persistence/contract and secret safety.
- Shared backend conformance suite run against Docker/Swarm/Kubernetes fakes and real Kubernetes.
- Render/apply/verify/rollback/cleanup translation tests with stable `K8S-*`, `SCALE-*`, `ROLLOUT-*` ids.
- CLI/HTTP/SDK/Web/MCP parity and unsupported-capability no-effect tests.
- Disposable local Kubernetes e2e, followed by explicitly authorized managed/design-partner packet.

## Delivery Order

R5a -> R5b -> R5c -> R5d. Each profile gets an actor-visible Ticket and may merge after its own
claim/evidence, but total R5 remains open until all profiles and final boundary/sync pass.

## Risks

- Credential leakage: opaque refs and adapter-local clients.
- Orphaned resources: stable labels, receipts, reverse cleanup and independent residual checks.
- Policy explosion: small portable profiles plus explicit capability negotiation.
- Provider lock-in: connector/adapter anticorruption and normalized readback.
