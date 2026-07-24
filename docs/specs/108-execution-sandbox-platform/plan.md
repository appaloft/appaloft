# Plan: Execution Sandbox Platform

## Governing Sources

- [Domain Model](../../DOMAIN_MODEL.md)
- [Business Operation Map](../../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../../CORE_OPERATIONS.md)
- [ADR-091: Execution Sandbox Boundary](../../decisions/ADR-091-execution-sandbox-boundary.md)
- [Async Lifecycle And Acceptance](../../architecture/async-lifecycle-and-acceptance.md)
- [Adapter Command/Query Boundary](../../architecture/adapter-command-query-boundary.md)
- [Error Model](../../errors/model.md)
- [neverthrow Conventions](../../errors/neverthrow-conventions.md)
- [Execution Sandbox Test Matrix](../../testing/execution-sandbox-test-matrix.md)

## Architecture Approach

- Add `packages/core/src/execution-sandbox/` containing class-based Sandbox, SandboxTemplate and
  SandboxSnapshot aggregates, value objects, lifecycle state machines and selection/mutation specs.
- Add command/query schemas and handlers under `packages/application/src/operations/sandboxes/`,
  repository/read-model/provider ports, reconciliation orchestration and catalog entries.
- Persist desired state, safe provider handles, attempts, templates and snapshots through
  `packages/persistence/pg`; do not persist output streams or plaintext credentials.
- Implement a hermetic provider in `packages/adapters/runtime` for contract tests, followed by a
  truthful Docker provider that declares `container-trusted` and optional gVisor capability only
  after host/runtime probing.
- Provider operations receive neutral DTOs and `AshScript`/structured argv at the execution seam;
  provider SDK/CRD/Docker types remain adapter-local.
- Expose HTTP/oRPC/OpenAPI operations, generated TypeScript SDK methods, CLI commands and generated
  MCP descriptors from the shared operation catalog.
- Use a durable provider attempt/reconciliation worker for provisioning, pause/resume, terminate,
  expiry and snapshot capture. Foreground exec/file operations remain request-scoped; background
  processes are provider-read runtime state with bounded event streams.
- Reuse audit and usage-attribution extension points after successful admission/persistence; do not
  convert domain facts directly into billing events.

## CQRS, Events And Consistency

- Commands: template create/delete; Sandbox create/pause/resume/terminate/update-network-policy;
  exec/start/terminate process; write/remove file; expose/revoke port; snapshot create/delete.
- Queries: template list/show; Sandbox list/show/events; process list/show/events; file list/read;
  port list; snapshot list/show.
- Domain events: lifecycle facts only after aggregate transition persistence.
- Application/process events: provider attempt progression and stream frames.
- Read-your-own-write: create returns the persisted Sandbox descriptor in requested/provisioning
  state; show/events reveal later provider state.
- Provider reconciliation and event consumers are idempotent by Sandbox id plus attempt id.
- Provider orphan reconciliation enumerates only runtimes carrying the exact provider-owned
  `ownerScope` label. Provider requests preserve that opaque tenant scope and may additionally carry
  the authorized organization id for organization-owned infrastructure selection. Reconciliation
  compares runtimes with tenant-scoped persisted handles and deletes an unmatched runtime only
  through a second ownership-checked provider operation.
- The server worker runtime immediately starts a bounded system-only maintenance loop. It pages
  persisted tenant ids, applies TTL/lifecycle reconciliation and then performs exact provider orphan
  reconciliation for each tenant without exposing this fleet-wide boundary as a public operation.

## Persistence And Migration

- Add additive Postgres/PGlite tables for sandboxes, templates, snapshots and provider attempts.
- Scope every row through RepositoryContext tenant identity and bounded list defaults.
- Store secret references and safe broker grant metadata only; never store resolved secret values.
- Store provider handles only when classified safe and opaque; host credentials remain existing
  credential-provider state.

## Roadmap And Compatibility

- Roadmap: post-1.0 Execution Sandbox Platform track, added after Blueprint and MCP foundations now
  exist; this does not introduce an Agent Runtime or orchestration framework.
- Compatibility: additive minor public capability; no existing operation changes.
- Public docs and generated SDK/OpenAPI/MCP snapshots must change in the same public PR.

## Testing Strategy

- Stable ids: `SBX-*` in the execution sandbox test matrix.
- Core unit tests: value objects, lifecycle transitions, policy invariants and specs.
- Application tests: command/query admission, provider capabilities, async attempts, path/network
  guards, reconciliation, audit and usage intent boundaries.
- Persistence tests: tenant isolation, round trips, bounded lists and migration parity on PGlite.
- Adapter tests: hermetic provider plus Docker/gVisor command rendering and sanitized failures.
- Contract tests: operation catalog, HTTP/oRPC/OpenAPI, SDK generation/runtime, CLI and MCP parity.
- Runtime smoke: local Docker `container-trusted`; gVisor smoke only where `runsc` is available and
  must otherwise report an explicit unsupported capability rather than pass falsely.

## Risks And Migration Gaps

- Secure untrusted execution cannot be proven by unit tests alone; gVisor/Kata/microVM claims need
  runtime evidence and provider capability probes.
- Binary and long-lived streams require bounded transport framing, cancellation and reconnect
  semantics beyond ordinary request/response generation.
- Credential brokerage needs a secret resolver plus outbound proxy provider; first adapters must
  fail closed when they cannot keep plaintext outside the sandbox.
- Cloud fleet, quota, metering and official preview routing are implemented only in the dependent
  private repository.
