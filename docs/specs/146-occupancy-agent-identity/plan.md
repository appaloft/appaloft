# Occupancy Agent Identity — Plan

## Governing

- [ADR-125](../../decisions/ADR-125-occupancy-agent-and-project-binding.md)
- [ADR-127](../../decisions/ADR-127-occupancy-agent-first-class-identity.md)
- [spec.md](./spec.md)

## Architecture

- `OccupancyAgent` is the public aggregate for the user-facing `agt_*` identity and
  display name. It references the current public Sandbox without duplicating the
  Sandbox lifecycle state machine.
- `OccupancyAgentRepository` owns create, resume/retarget, and `--new` retirement;
  the PostgreSQL adapter persists it in `occupancy_agents` with one active row per
  tenant, actor subject, Project, repository identity, and branch.
- `WorkspaceOpenResult` returns `agentId` and the persisted Agent name. CLI/TUI
  progress and banners consume that result instead of inventing a local name.
- `SandboxDisplayName.resolve` stops mapping git identity to `repo@sha`.
- `formatRemoteCodeBanner` leads with `agent <name>`.
- `RepositoryBinding.rebind` updates the default Project; application `bind` uses it.

No new catalog operation. Sandbox pause, resume, terminate, files, ports, and
terminal sessions remain owned by the existing public Sandbox lifecycle.

## Tests

- `packages/core/test/sandbox-display-name.test.ts` WS-AGENT-NAME-001/002/003
- `packages/core/test/occupancy-agent.test.ts` WS-AGENT-ID-008/009/010
- `packages/application/test/occupancy-agent.test.ts` WS-AGENT-ID-008/009/010
- `packages/application/test/agent-workspace-open.test.ts` WS-AGENT-ID-008/009
- `packages/persistence/pg/test/occupancy-agent-repository.test.ts` WS-AGENT-ID-008/009/010
- `packages/adapters/cli/test/occupancy-agent-name.test.ts` WS-AGENT-NAME-007
- `packages/core/test/repository-binding.test.ts` WS-AGENT-BIND-005
- `packages/adapters/cli/test/remote-code-session.test.ts` WS-AGENT-BANNER-004
