# Mutation Coordination Implementation Plan

## Goal

Implement scope-based mutation coordination without changing the accepted command surface or hiding
coordination policy in transport-specific workflow code.

## Phase 1: Policy Registry

1. Add an explicit coordination policy registry near the operation catalog.
2. Map active mutation commands to logical scope kinds and coordination modes:
   - `deployments.create` -> `resource-runtime` / `supersede-active`
   - `deployments.cleanup-preview` -> `preview-lifecycle` / `serialize-with-bounded-wait`
   - `source-links.relink` -> `source-link` / `serialize-with-bounded-wait`
3. Resolve safe scope keys from already-validated command context rather than from raw transport
   inputs.
4. Keep decorators optional and secondary; the registry remains the source of truth.

## Phase 2: Port And Shell Wiring

1. Add a `MutationCoordinator` port in `packages/application`.
2. Inject the coordinator into the affected use cases or workflow helpers.
3. Keep `CommandBus` as process-local dispatch only.
4. Preserve current async acceptance semantics; no queued accepted attempt records in this phase.

## Phase 3: SSH/Local Backend Provider

1. Split low-level state-root coordination from command-level coordination.
2. Keep remote state ensure/migrate/sync safe under backend maintenance coordination.
3. Implement logical-scope coordination for SSH/local state backends with durable leased records or
   an equivalent backend-owned mechanism.
4. Report coordination timeout details by logical scope instead of exposing only raw server-lock
   language.

## Phase 4: PostgreSQL / Control-Plane Provider

1. Add a PostgreSQL-backed coordinator implementation.
2. Prefer explicit durable coordination tables and/or advisory locks over in-process primitives.
3. Keep the same logical policy/scope resolution used by CLI, HTTP, Web, and future MCP entrypoints.

## Out Of Scope For This Plan

- durable accepted queued deployment attempts;
- changing `deployments.create` into a queue-submission command;
- making Kafka, Redis Streams, or another remote queue mandatory for pure CLI or GitHub Actions;
- hiding all backend maintenance failures from diagnostics.
