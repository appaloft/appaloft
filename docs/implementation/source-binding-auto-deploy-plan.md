# Source Binding And Auto Deploy Implementation Plan

## Status

Spec Round placeholder for Phase 7 / `0.9.0`.

The plan records implementation slices for the accepted candidate behavior in
[Source Binding And Auto Deploy](../specs/042-source-binding-auto-deploy/spec.md). It is not Code
Round authorization.

## Slices

### 1. Decision Closure

- ADR-037 decides source event ownership and durable retry boundaries.
- ADR-037 decides generic signed webhook secret custody and rotation baseline.
- ADR-037 decides source-binding-change behavior for existing auto-deploy policies.
- Remaining ADR work is required only if Code Round expands beyond ADR-037.

### 2. Policy Model

- Add Resource-owned auto-deploy policy value objects.
- Add `resources.configure-auto-deploy` command schema, handler, use case, and operation catalog
  entry after tests exist.
- Persist policy and expose safe Resource detail/read-model summaries.

### 3. Source Event Ingestion

- Add provider-neutral `source-events.ingest` command schema.
- Add signature verification/normalization ports for Git provider and generic signed events.
- Add durable source event records with dedupe keys, normalized facts, policy match results, ignored
  reasons, and created deployment ids.
- Store project/resource scoped read-model facts first; global operator source-event rollups remain
  future.

### 4. Deployment Dispatch

- Evaluate enabled policies in application logic.
- Dispatch matching policies through existing deployment admission and `resource-runtime`
  coordination.
- Preserve async acceptance, deployment snapshots, logs, recovery, and rollback semantics.

### 5. Entrypoints And Docs

- Add CLI, HTTP/oRPC, and Web surfaces only after application behavior and persistence pass.
- Add public docs for setup, signatures, dedupe, ignored events, and manual recovery.
- Add future MCP/tool descriptor mapping from operation catalog metadata.

## Verification Gate

Minimum before Code Round completion:

- source auto-deploy local command/query/error specs are synchronized;
- source auto-deploy test matrix rows have automation bindings;
- operation map, `CORE_OPERATIONS.md`, operation catalog, public docs/help, and contracts are in
  sync;
- `bun run typecheck`, `bun run lint`, and targeted source auto-deploy tests pass;
- remaining gaps are recorded under the source spec and roadmap.
