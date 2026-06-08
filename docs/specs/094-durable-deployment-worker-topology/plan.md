# Durable Deployment Worker Topology Plan

## Implementation Order

1. Add public application-layer durable worker topology and queue adapter contract.
2. Add config parsing for worker runtime mode, worker count, worker group, and queue backend.
3. Add focused tests for topology, backend descriptors, adapter boundary, and environment config.
4. Synchronize ADR/spec/test matrix and mark the deployment-worker execution binding as the next
   governed Code Round.

## Deferred Code Rounds

- `deployments.create` durable worker binding.
- `deployments.retry` and `deployments.rollback` durable worker binding.
- CLI/server startup command split for dedicated `appaloft worker` process.
- Cloud Blueprint install acceptance integration after public deployment worker binding exists.
