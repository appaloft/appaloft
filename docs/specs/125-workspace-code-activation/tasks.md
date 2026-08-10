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

- [ ] After Spec acceptance, create one public tracking issue for the actor-visible
  `appaloft code` local-direct slice.
- [ ] Link ADR-107, Spec 125, Test Matrix ids, dependencies, non-goals and verification commands.
- [ ] Mark `ready-for-agent` only when the Test-First slice and implementation paths remain exact.

## Test First

- [ ] Add failing `WS-CODE-CLI-001/WS-CODE-PARITY-002/WS-CODE-OPTIONS-008/WS-CODE-COMPAT-010`
  tests to `packages/adapters/cli/test/agent-workspace-command.test.ts`.
- [ ] Add `WS-CODE-LOCAL-003` target-resolution binding without remote handshake or local fallback
  drift.
- [ ] Bind `WS-CODE-PREFLIGHT-004/WS-CODE-PROFILE-005` to existing Git/Profile failure semantics.
- [ ] Add `WS-CODE-ATTACH-006/WS-CODE-RESUME-007/WS-CODE-ERROR-009` entrypoint tests.
- [ ] Add `WS-CODE-PACKAGE-011` packaged help/start coverage and `WS-CODE-DOCS-012` docs-registry
  coverage.

## Implementation

- [ ] Register the top-level `code` command through the existing CLI composition.
- [ ] Share parser input, local Git preflight, `workspaces.open` dispatch and attach rendering with
  `workspace open`.
- [ ] Preserve `--profile` versus `--control-plane-profile` help and target semantics.
- [ ] Keep every current Workspace command and machine-readable path compatible.
- [ ] Do not add a TUI dependency, operation-catalog entry, persistence field or lifecycle shortcut.

## Entrypoints And Docs

- [ ] Add final CLI help and release-note input during Code/Sync Round.
- [ ] Update both localized Agent Workspace pages and CLI references only when the command ships.
- [ ] Confirm the localized `agent-workspace-open` anchor and CLI reference resolve in the built
  docs output.
- [ ] Classify future MCP/Web/SDK changes as not applicable because `workspaces.open` remains
  canonical.

## Verification

- [ ] Run focused CLI and target-resolution tests for all `WS-CODE-*` rows.
- [ ] Run `bun test packages/docs-registry/test`.
- [ ] Run `bun run lint:ci`, `bun run typecheck`, `bun run test` and `bun run build`.
- [ ] Run the release packaging path required by `WS-CODE-PACKAGE-011`.

## Post-Implementation Sync

- [ ] Reconcile ADR, Spec, plan, tasks, Test Matrix, operation map, CLI help, localized docs, code,
  tests and release-note input.
- [ ] Keep `WS-TUI-SPIKE-*`, lifecycle shortcuts, registered VPS acceptance and Windows support as
  explicit later behavior unless their own round is authorized.
