# Plan: Agent Workspace Entry Workflow

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions: ADR-022, ADR-091, ADR-092 and ADR-094
- Operations: `docs/CORE_OPERATIONS.md`, `docs/BUSINESS_OPERATION_MAP.md`
- Test matrix: `docs/testing/agent-workspace-test-matrix.md`

## Architecture Approach

- Keep `Agent Workspace` as an entry workflow; reuse `SandboxId` as `workspaceId`.
- Extend the harness-neutral Runtime port with optional prepare/terminate lifecycle hooks.
- Add a public OpenCode runtime adapter that starts `opencode serve` only inside the Sandbox
  provider's private network namespace without publishing a host port, persists its process marker
  below `/workspace`, and executes managed Runs through `opencode run --attach`.
- Add Public CLI and SDK convenience composition. Do not add a parallel operation family.
- Add optional safe HTTPS Git materialization before Runtime creation and return partial-creation
  evidence. Docker providers use a provider egress policy adapter on the internal network instead
  of granting direct container internet access.
- Publish harness capability descriptors and derive client affordances from those descriptors.
- Add `workspace connect`, scoped attach access and Public Console Workspace surfaces over canonical
  operations.
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
- `AGENT-WS-EGRESS-019` proves exact host/port admission, reserved-address denial, capability
  authentication, update and cleanup.

## Risks And Migration Gaps

- Concrete preview URL and native attach behavior depends on the selected provider/gateway and must
  fail closed when scoped access is unavailable.
- Git materialization and source-control delivery fail closed when a provider does not supply an
  authenticated allowlist egress adapter.
- A terminated Sandbox loses live session data unless captured first.
