# Plan: Agent Workspace Entry Workflow

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions: ADR-022, ADR-091, ADR-092 and ADR-094
- Operations: `docs/CORE_OPERATIONS.md`, `docs/BUSINESS_OPERATION_MAP.md`
- Test matrix: `docs/testing/agent-workspace-test-matrix.md`

## Architecture Approach

- Keep `Agent Workspace` as an entry workflow; reuse `SandboxId` as `workspaceId`.
- Extend the harness-neutral Runtime port with optional prepare/terminate lifecycle hooks.
- Add a public OpenCode runtime adapter that starts `opencode serve` on loopback, persists its
  process marker below `/workspace`, and executes managed Runs through `opencode run --attach`.
- Add Public CLI and SDK convenience composition. Do not add a parallel operation family.
- Reuse Sandbox Postgres persistence, Agent Runtime persistence, Terminal Session gateway and
  Sandbox port operations without a new migration.

## Roadmap And Compatibility

- Roadmap target: next post-1.3 additive minor.
- Version target: a future `1.4.0` or later minor chosen by the release process.
- Compatibility impact: additive public API/CLI/SDK behavior; existing canonical operations remain
  unchanged.

## Testing Strategy

- Matrix ids: `AGENT-WS-*` and `AGENT-OPENCODE-*`.
- Adapter contract covers version admission, server lifecycle, JSON event translation,
  continuation and cancellation.
- CLI captures the exact canonical command/query messages dispatched by the workflow.
- SDK tests verify request sequence, parent-id propagation and partial-create recovery evidence.
- Existing Sandbox, Agent Runtime and Terminal matrices continue to prove lifecycle/isolation.

## Risks And Migration Gaps

- Concrete preview URL and native attach behavior depends on the selected provider/gateway.
- Git source materialization is explicit follow-up work.
- A terminated Sandbox loses live session data unless captured first.
