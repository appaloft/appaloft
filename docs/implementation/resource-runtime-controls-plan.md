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

- Command schemas, handlers, and a shared use case now exist in `packages/application`.
- Runtime-control attempt/result types now exist for command results, recorder input, target
  requests, and target results.
- Resolve Resource and retained runtime metadata from read models or repositories without letting
  adapters decide business admission.
- Coordinate through `resource-runtime`.
- Remaining application-model gaps are tied to durable attempt persistence and public activation,
  not command admission or normalized port shape.

### 3. Runtime Target Port

- A provider-neutral runtime control port contract now exists for stop/start/restart.
- Provider-neutral Docker container and Docker Compose command mapping now exists behind that port
  with an injected executor boundary.
- Local shell and generic SSH command execution now exists behind the runtime-control target with
  bounded subprocess execution and sanitized adapter failure details.
- Shell composition now registers the runtime-control target port, attempt recorder, use case, and
  command handlers without exposing public entrypoints.
- Return sanitized status, phase, and support details only.

### 4. Persistence And Read Models

- PG/PGlite persistence now stores runtime-control attempts before adapter execution through the
  attempt recorder port.
- `PgResourceReadModel` now exposes latest control status through
  `ResourceSummary.latestRuntimeControl`, which feeds `resources.health.latestRuntimeControl`.
- Keep runtime-control attempt history separate from Deployment attempts unless a future spec
  explicitly adds relationship fields.

### 5. Entrypoints And Docs

- CLI, HTTP/oRPC, and Web controls are active after application and adapter tests passed.
- Public docs/help for stop/start/restart, blocked start, and restart versus redeploy are linked
  from CLI help, API descriptions, and Web help affordances.
- Operation catalog metadata is active; future MCP/tool descriptors remain deferred until the tool
  surface exists.

## Verification Gate

Minimum before Code Round completion:

- runtime-control command/error/readback specs are synchronized;
- runtime-control test matrix rows have automation bindings;
- operation map, `CORE_OPERATIONS.md`, operation catalog, public docs/help, and contracts are in
  sync;
- `bun run typecheck`, `bun run lint`, and targeted runtime-control tests pass;
- remaining gaps are recorded under the runtime-control spec and roadmap.
