# Plan: Agent Task Run Workflow

## Governing Sources

- ADR-091, ADR-092, ADR-094 and ADR-095.
- Specs 108, 109 and 111.
- Agent Workspace and Sandbox Agent delivery test matrices.

## Architecture Approach

- Reuse `SandboxAgentRunId` as `taskRunId`.
- Store bounded resumable protected state at `.appaloft/tasks/<runId>/state.json`.
- Implement one server-authoritative application process manager; SDK, CLI and Web dispatch the
  same canonical operations and consume the same result schema.
- Execute checks and Git inspection with argv arrays, not interpolated shell.
- Keep preview and immutable Candidate Preview distinct in state and UI.
- Accept structured commit/push/pull-request intent and execute only argv-safe adapter commands.

## Testing Strategy

- Bind all `AGENT-TASK-*` ids in SDK workflow tests.
- Add CLI composition and Console structure/interaction tests.
- Reuse Agent Run HTTP/stream, Sandbox file/exec/port and artifact integration tests.
- Add adapter tests for idempotent change delivery and secret-safe failures.

## Compatibility

- Additive public minor. Existing Sandbox Agent Run and Workspace clients remain unchanged.
