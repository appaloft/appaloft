# Plan: Workspace Collaboration

## Governing Sources

- ADR-022, ADR-045, ADR-091, ADR-092, ADR-094, ADR-095 and ADR-096.
- Specs 108, 109, 111, 112 and 113.
- Agent Workspace and Workspace Collaboration test matrices.

## Architecture Approach

- Add one tenant-scoped `WorkspaceCollaboration` aggregate and repository. Store only participant
  references, Workspace lane references, fenced writer leases and immutable candidate handoffs.
- Resolve actor identity from `ExecutionContext`; validate referenced Sandbox, Agent Runtime and
  Source Artifact through their public owners in the application service.
- Add canonical command/query schemas, handlers, operation catalog entries and generated transport
  contracts.
- Add writer/observer attachment capabilities to managed Terminal Session. Keep terminal rendering
  and interaction inside the vendor TUI.
- Gate native attach through the same writer-lease application policy.
- Reuse existing preview descriptors and audit/event infrastructure.
- Add Cloud operation policy/admission mapping without private collaboration state.

## Testing Strategy

- Bind `COLLAB-CREATE-001` through `COLLAB-REVIEW-010` in core/application/persistence tests.
- Bind `COLLAB-OBSERVE-006` and `COLLAB-RECONNECT-007` in runtime and HTTP WebSocket tests.
- Bind `COLLAB-SURFACE-013` in operation catalog, generated SDK, CLI and Public Console tests.
- Bind `COLLAB-CLOUD-014` in Cloud authz/admission/composed runtime tests.
- Add concurrency and stale-generation tests before repository implementation.

## Compatibility

- Additive public minor. Existing Workspace, Terminal Session and Agent Task Run clients retain
  current behavior when no Collaboration context is supplied.
