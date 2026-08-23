# Occupancy Agent Identity — Plan

## Governing

- [ADR-125](../../decisions/ADR-125-occupancy-agent-and-project-binding.md)
- [spec.md](./spec.md)

## Architecture

- `SandboxDisplayName.resolve` stops mapping git identity to `repo@sha`.
- `formatRemoteCodeBanner` leads with `agent <name>`.
- `RepositoryBinding.rebind` updates the default Project; application `bind` uses it.

No new catalog operation. No new table.

## Tests

- `packages/core/test/sandbox-display-name.test.ts` WS-AGENT-NAME-001/002/003
- `packages/core/test/repository-binding.test.ts` WS-AGENT-BIND-005
- `packages/adapters/cli/test/remote-code-session.test.ts` WS-AGENT-BANNER-004
