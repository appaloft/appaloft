# Resource Runtime Controls Implementation Plan

## Status

Spec Round placeholder for Phase 7 / `0.9.0`.

The plan records implementation slices for accepted candidate runtime stop/start/restart behavior in
[Resource Runtime Controls](../specs/043-resource-runtime-controls/spec.md). It is not Code Round
authorization.

## Slices

### 1. Decision And Local Specs

- ADR-038 decides runtime-control ownership, coordination, process-state baseline, and public
  semantics.
- Local command specs now exist for `resources.runtime.stop`, `resources.runtime.start`, and
  `resources.runtime.restart`.
- Runtime-control error and blocked-reason vocabulary now lives in
  `docs/errors/resource-runtime-controls.md`.
- First-slice attempt readback is specified as `resources.health.latestRuntimeControl`.
- Public docs/help anchors now exist for runtime controls, restart versus redeploy, and blocked
  start recovery.
- Add error spec and blocked reason vocabulary.
- Decide readback placement for runtime-control attempt status.

### 2. Application Model

- Add command schemas, handlers, and use cases.
- Add runtime-control attempt/result types.
- Resolve Resource and retained runtime metadata from read models or repositories without letting
  adapters decide business admission.
- Coordinate through `resource-runtime`.

### 3. Runtime Target Port

- Add a provider-neutral runtime control port for stop/start/restart.
- Implement local/generic-SSH Docker and Compose adapters behind that port.
- Return sanitized status, phase, and support details only.

### 4. Persistence And Read Models

- Persist runtime-control attempts before adapter execution.
- Expose latest control status through the chosen read surface.
- Keep runtime-control attempt history separate from Deployment attempts unless a future spec
  explicitly adds relationship fields.

### 5. Entrypoints And Docs

- Add CLI, HTTP/oRPC, and Web controls only after application and adapter tests pass.
- Add public docs/help for stop/start/restart, blocked start, and restart versus redeploy.
- Add operation catalog metadata and future MCP/tool descriptors in the activation commit.

## Verification Gate

Minimum before Code Round completion:

- runtime-control command/error/readback specs are synchronized;
- runtime-control test matrix rows have automation bindings;
- operation map, `CORE_OPERATIONS.md`, operation catalog, public docs/help, and contracts are in
  sync;
- `bun run typecheck`, `bun run lint`, and targeted runtime-control tests pass;
- remaining gaps are recorded under the runtime-control spec and roadmap.
