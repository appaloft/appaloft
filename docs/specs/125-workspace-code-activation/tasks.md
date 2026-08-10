# Tasks: Workspace Code Activation

## Spec Round

- [x] Record owner-confirmed discovery and rejected alternatives.
- [x] Add proposed ADR-107 for the CLI and future control-presentation boundary.
- [x] Add Spec 125, implementation plan and OpenTUI hardest-path research gate.
- [x] Add stable `WS-CODE-*` and `WS-TUI-SPIKE-*` Test Matrix rows.
- [x] Position the behavior in the Business Operation Map and Core Operations without adding a new
  operation.
- [x] Synchronize the `workspaces.open` command spec, Agent Workspace workflow and traceability,
  while keeping the unimplemented command out of published localized docs.
- [x] Accept ADR-107 and Spec 125 through review before Ticket or Code Round.

## Ticket

- [x] After Spec acceptance, create public tracking issue [#1022](https://github.com/appaloft/appaloft/issues/1022) for the actor-visible
  `appaloft code` local-direct slice.
- [x] Link ADR-107, Spec 125, Test Matrix ids, dependencies, non-goals and verification commands.
- [x] Mark `ready-for-agent` only when the Test-First slice and implementation paths remain exact.

## Test First

- [x] Add failing `WS-CODE-CLI-001/WS-CODE-PARITY-002/WS-CODE-OPTIONS-008/WS-CODE-COMPAT-010`
  tests to `packages/adapters/cli/test/agent-workspace-command.test.ts`.
- [x] Add `WS-CODE-LOCAL-003` target-resolution binding without remote handshake or local fallback
  drift.
- [x] Bind `WS-CODE-PREFLIGHT-004/WS-CODE-PROFILE-005` to existing Git/Profile failure semantics.
- [x] Add `WS-CODE-ATTACH-006/WS-CODE-RESUME-007/WS-CODE-ERROR-009` entrypoint tests.
- [x] Add `WS-CODE-PACKAGE-011` packaged help/start coverage and `WS-CODE-DOCS-012` docs-registry
  coverage.

## Implementation

- [x] Register the top-level `code` command through the existing CLI composition.
- [x] Share parser input, local Git preflight, `workspaces.open` dispatch and attach rendering with
  `workspace open`.
- [x] Preserve `--profile` versus `--control-plane-profile` help and target semantics.
- [x] Keep every current Workspace command and machine-readable path compatible.
- [x] Do not add a TUI dependency, operation-catalog entry, persistence field or lifecycle shortcut.

## Entrypoints And Docs

- [x] Add final CLI help and conventional feature commit/PR release-note input during Code/Sync Round.
- [x] Update both localized Agent Workspace pages and CLI references only when the command ships.
- [x] Confirm the localized `agent-workspace-open` anchor and CLI reference resolve in the built
  docs output.
- [x] Classify future MCP/Web/SDK changes as not applicable because `workspaces.open` remains
  canonical.

## Verification

- [x] Run focused CLI and target-resolution tests for all `WS-CODE-*` rows.
- [x] Run `bun test packages/docs-registry/test`.
- [x] Run `bun run lint:ci`, `bun run typecheck`, `bun run test` and `bun run build`.
- [x] Run the release packaging path required by `WS-CODE-PACKAGE-011`.

## Post-Implementation Sync

- [x] Reconcile ADR, Spec, plan, tasks, Test Matrix, operation map, CLI help, localized docs, code,
  tests and release-note input.
- [x] Keep `WS-TUI-SPIKE-*`, lifecycle shortcuts, registered VPS acceptance and Windows support as
  explicit later behavior unless their own round is authorized.
