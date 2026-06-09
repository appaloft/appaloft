# Durable Deployment Worker Topology Plan

## Implementation Order

1. Add public application-layer durable worker topology and queue adapter contract.
2. Add config parsing for worker runtime mode, worker count, worker group, and queue backend.
3. Add default database durable work ledger tables for item claim/retry state and safe event logs.
4. Expose worker runtime topology through operator diagnostics.
5. Add a dedicated `appaloft worker` startup entrypoint for standalone worker processes.
6. Add focused tests for topology, backend descriptors, adapter boundary, environment config,
   diagnostics, and CLI startup routing.
7. Synchronize ADR/spec/test matrix and keep workflow-specific durable work handlers behind the
   neutral handler registry extension point.

## Deferred Code Rounds

- `deployments.retry` and `deployments.rollback` durable worker binding.
- Additional workflow-specific parent durable work kinds remain extension-owned; public Appaloft
  exposes the handler registry, durable ledger, and operator-work monitoring surfaces without
  importing product-specific application domains.
