# Plan: Workspace Code Activation

## Governing Sources

- [ADR-094](../../decisions/ADR-094-agent-workspace-entry-workflow.md)
- [ADR-100](../../decisions/ADR-100-agent-adapter-distribution-and-workspace-profile-boundary.md)
- [ADR-103](../../decisions/ADR-103-profile-aware-workspace-open-and-attach.md)
- [ADR-107](../../decisions/ADR-107-task-oriented-workspace-activation-presentation.md)
- [Spec 120](../120-profile-aware-workspace-open-and-attach/spec.md)
- [workspaces.open](../../commands/workspaces.open.md)
- [Agent Workspace workflow](../../workflows/agent-workspace.md)
- [Workspace Code Activation Test Matrix](../../testing/workspace-code-activation-test-matrix.md)

## Architecture Approach

1. Add one top-level CLI presentation command, `code`, in the existing CLI composition.
2. Parse `path`, `--profile`, `--new` and `--no-attach` into the same CLI-local input used by
   `workspace open` rather than duplicating Git inspection or result rendering.
3. Reuse the existing control-plane target resolver. No selected remote target keeps local
   dispatch; `--control-plane-profile` and active remote profiles continue to use the existing
   remote workflow contract.
4. Reuse the exact `workspaces.open` application command locally or generated operation facade
   remotely. Do not add `code` to the operation catalog.
5. Reuse managed-terminal and native-attach bridging. The CLI must not inspect Agent output beyond
   transport framing already owned by Terminal attach.
6. Keep `workspace open` and all Workspace subcommands registered as compatibility surfaces.

## CQRS, Read Model And Event Impact

- Command/query impact: none; `OpenAgentWorkspaceCommand` remains canonical.
- Read model impact: none; existing Workspace/Sandbox/Runtime/Terminal descriptors remain.
- Event impact: none; existing lifecycle facts remain authoritative.
- Persistence impact: none; no new preference, alias, projection or migration.
- Error impact: no new business error family; parser/help errors and existing Workspace errors pass
  through the established CLI error boundary.

## Entrypoints And Documentation

- CLI: new top-level `code` presentation and help.
- SDK/API/Web/MCP: not applicable because the existing operation already exposes the behavior.
- Public docs: update localized Agent Workspace pages, CLI reference search terms, traceability and
  the stable `agent-workspace-open` anchor.
- Changelog/release notes: record the new CLI capability in the eventual minor release.

## Roadmap And Compatibility

- Roadmap position: delivered public Agent Workspace activation slice.
- Current release line: public Appaloft 1.8.x.
- Expected version target: next compatible minor release after implementation.
- Compatibility impact: minor; additive CLI command with no removal or changed operation schema.
- Deprecation/migration: none. `workspace open` remains supported.

## Testing Strategy

- CLI unit/contract: `WS-CODE-CLI-001`, `WS-CODE-PARITY-002`, `WS-CODE-OPTIONS-008`,
  `WS-CODE-COMPAT-010`.
- Target/preflight: `WS-CODE-LOCAL-003`, `WS-CODE-PREFLIGHT-004`, `WS-CODE-PROFILE-005`.
- Attach/reconnect/error: `WS-CODE-ATTACH-006`, `WS-CODE-RESUME-007`, `WS-CODE-ERROR-009`.
- Packaging/docs: `WS-CODE-PACKAGE-011`, `WS-CODE-DOCS-012`.
- Existing `WS-OPEN-*` and `WS-ATTACH-*` tests remain regression evidence for the delegated
  workflow; new tests must prove the top-level entry actually reaches those semantics.

## Delivery Record

1. ADR-107, Spec 125 and the Test Matrix were accepted.
2. Public issue [#1022](https://github.com/appaloft/appaloft/issues/1022) carried the actor-visible
   slice with `ready-for-agent`.
3. Test-First covered CLI, target resolution, help, docs and packaging boundaries.
4. The smallest CLI slice shipped without a production TUI or new operation.
5. Public docs, CLI, release bundle and repository gates supplied verification evidence.
6. This Post-Implementation Sync supplies the conventional feature commit/PR release-note input.

## Risks And Migration Gaps

- A second parser path could drift from `workspace open`; implementation must share one input and
  execution path.
- `--profile` and `--control-plane-profile` must remain clearly distinct in help and tests.
- Packaged binaries must expose help without initializing persistence or runtime composition.
- `--keep-awake` and exit-triggered removal remain blocked until lifecycle semantics are specified.
- The TUI framework spike is research for a later control experience and must not expand this Code
  Round.
