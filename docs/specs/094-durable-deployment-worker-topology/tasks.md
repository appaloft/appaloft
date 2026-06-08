# Durable Deployment Worker Topology Tasks

## Spec Round

- [x] Define public-neutral worker runtime modes.
- [x] Decide coordinator/worker language and reject master/slave terminology.
- [x] Define database and external queue backend boundaries.
- [x] Record PGlite/CLI disabled-worker behavior as supported topology, not a separate model.

## Test Matrix

- [x] Add stable test ids for topology, adapter, and config coverage.
- [ ] Add deployment-worker binding test ids when `deployments.create` moves from inline
  projection to durable worker execution.

## Code Round

- [x] Add `DurableWorkRuntimeConfig`, `DurableWorkTopology`, and `DurableWorkQueueAdapter`.
- [x] Add backend descriptors for database and external queue adapters.
- [x] Add `workerRuntime` config defaults and environment parsing.
- [ ] Wire server startup status to report `workerRuntime` topology.
- [ ] Add dedicated `appaloft worker` startup mode.
- [ ] Promote deployment create execution to pending process-attempt claim/completion.

## Verification

- [x] Run `bun test packages/application/test/durable-work.test.ts`.
- [x] Run `bun test packages/config/test/index.test.ts`.
- [x] Run targeted typecheck for changed public packages.
