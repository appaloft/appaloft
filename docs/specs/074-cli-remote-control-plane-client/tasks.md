# Tasks: CLI Remote Control-Plane Client

## Spec Round

- [x] Read repository rules, Appaloft profile skill, and Domain Driven Develop workflow references.
- [x] Read governing ADRs, workflow specs, operation map, core operations, domain model, error
  contracts, async lifecycle, adapter command/query boundary, current CLI runtime, shell
  composition, oRPC, HTTP, SDK, and auth command implementation.
- [x] Create `docs/specs/074-cli-remote-control-plane-client/spec.md`.
- [x] Create `docs/specs/074-cli-remote-control-plane-client/plan.md`.
- [x] Create this `tasks.md`.
- [x] Position CLI remote control-plane client behavior in
  `docs/BUSINESS_OPERATION_MAP.md` as a workflow over existing operations.
- [x] Synchronize `docs/CORE_OPERATIONS.md` with the no-new-business-operation rule for login,
  profile, context, and remote dispatch.
- [x] Update `docs/workflows/control-plane-mode-selection-and-adoption.md` with CLI login/profile
  and remote dispatch semantics.
- [x] Update `docs/implementation/control-plane-modes-roadmap.md` with the CLI remote client bridge
  phase and gap classification.
- [x] Update `docs/testing/control-plane-modes-test-matrix.md` with stable CLI remote client rows.
- [x] Record that the first read-only slice does not require a new ADR, while later Cloud auth,
  credential custody, context defaults, or adoption coupling may require ADR-025 update or a new
  ADR.

## Test-First Round

| ID | Outcome | Suggested test binding | Verification command |
| --- | --- | --- | --- |
| CONTROL-PLANE-CLI-001 | Successful login writes only safe local profile metadata after handshake/auth status succeeds. | `packages/adapters/cli/test/control-plane-client.test.ts` | `bun test packages/adapters/cli/test/control-plane-client.test.ts -t CONTROL-PLANE-CLI-001` |
| CONTROL-PLANE-CLI-002 | Failed login leaves profiles unchanged and returns a structured phase. | `packages/adapters/cli/test/control-plane-client.test.ts` | `bun test packages/adapters/cli/test/control-plane-client.test.ts -t CONTROL-PLANE-CLI-002` |
| CONTROL-PLANE-CLI-003 | Logout removes only local credential/session state. | `packages/adapters/cli/test/control-plane-client.test.ts` | `bun test packages/adapters/cli/test/control-plane-client.test.ts -t CONTROL-PLANE-CLI-003` |
| CONTROL-PLANE-CLI-004 | Status and context output redacts token/session material. | `packages/adapters/cli/test/control-plane-client.test.ts` | `bun test packages/adapters/cli/test/control-plane-client.test.ts -t CONTROL-PLANE-CLI-004` |
| CONTROL-PLANE-CLI-005 | `context list/use/show` switches active profile locally without business mutation. | `packages/adapters/cli/test/control-plane-client.test.ts` | `bun test packages/adapters/cli/test/control-plane-client.test.ts -t CONTROL-PLANE-CLI-005` |
| CONTROL-PLANE-CLI-006 | Remote `project list/show` dispatch uses typed remote client and does not create local composition or SSH PGlite sync. | `packages/adapters/cli/test/control-plane-client.test.ts`; `apps/shell/test/run-control-plane-cli.test.ts` | `bun test packages/adapters/cli/test/control-plane-client.test.ts apps/shell/test/run-control-plane-cli.test.ts -t CONTROL-PLANE-CLI-006` |
| CONTROL-PLANE-CLI-007 | No trusted remote source preserves local/pure SSH default behavior. | `packages/adapters/cli/test/control-plane-client.test.ts` | `bun test packages/adapters/cli/test/control-plane-client.test.ts -t CONTROL-PLANE-CLI-007` |
| CONTROL-PLANE-CLI-008 | Remote selected for unsupported operation fails before local mutation. | `packages/adapters/cli/test/control-plane-client.test.ts` | `bun test packages/adapters/cli/test/control-plane-client.test.ts -t CONTROL-PLANE-CLI-008` |
| CONTROL-PLANE-CLI-009 | Profile store never writes tokens, database URLs, SSH keys, credential ids, tenant/org secret identity, or raw secrets to committed config/log output. | `packages/adapters/cli/test/control-plane-client.test.ts` | `bun test packages/adapters/cli/test/control-plane-client.test.ts -t CONTROL-PLANE-CLI-009` |
| CONTROL-PLANE-CLI-010 | Remote dispatch reuses `@appaloft/sdk` or `@appaloft/orpc/client` contract metadata and does not define parallel schemas. | `packages/adapters/cli/test/control-plane-client.test.ts` | `bun test packages/adapters/cli/test/control-plane-client.test.ts -t CONTROL-PLANE-CLI-010` |
| CONTROL-PLANE-CLI-011 | Remote profile auth errors and handshake failures preserve structured server/client error phases. | `packages/adapters/cli/test/control-plane-client.test.ts` | `bun test packages/adapters/cli/test/control-plane-client.test.ts -t CONTROL-PLANE-CLI-011` |

## Code Round

Recommended first slice:

- [x] Implement a CLI profile store outside `core` and `application`, with owner-only file-backed
  fallback and redacted list/show/status output.
- [x] Implement first-slice active profile resolution and no-profile local fallback.
- [ ] Implement full `CliExecutionTargetResolver` for flags/env/profile/config selection and `auto`
  fallback.
- [x] Make remote-only first-slice command execution avoid local shell composition and SSH PGlite
  sync.
- [x] Implement first-slice remote operation dispatcher for `projects.list/show`.
- [ ] Generalize `CliOperationDispatcher` with local and remote implementations for broader
  operation coverage.
- [x] Use `@appaloft/sdk` generated operation descriptors or extend `@appaloft/orpc/client` with
  auth/header support for remote operation dispatch.
- [x] Add login/logout/status/context CLI commands and top-level aliases when feasible.
- [x] Remoteize `appaloft project list` and `appaloft project show <projectId>`.
- [x] Return structured `control_plane_unsupported` or `validation_error` failures for unsupported
  project mutations before local mutation when a remote profile is active.
- [x] Keep deployment, resource/server mutation, DB, serve, remote-state, terminal, runtime logs,
  and event streaming local/unsupported in remote mode for the first slice.
- [x] Run targeted tests listed in the Test-First table.

## Docs Round

- [ ] Add or update public docs for CLI login, logout, auth status, context list/use/show, remote
  dispatch, pure SSH fallback, `auto` safety, and unsupported remote operations.
- [ ] Add stable docs-registry help anchors for CLI login/context and control-plane client errors.
- [ ] Update CLI help descriptions to point to the public anchors.
- [ ] Ensure docs explain that login is not adoption, state upload, or `deployments.create`
  enrichment.
- [ ] Update release-note input when the Code Round ships.

Docs Round outcome for this Code Round: deferred before release. Internal CLI help now exposes the
commands, but public docs anchors and docs-registry links remain a required follow-up.

## Sync Round

- [x] Verify `docs/BUSINESS_OPERATION_MAP.md`, `docs/CORE_OPERATIONS.md`, this feature artifact,
  workflow spec, roadmap, and test matrix still agree after implementation.
- [x] Verify `packages/application/src/operation-catalog.ts` does not need a new login/context
  operation entry unless a later product auth ADR adds one.
- [x] Verify operation metadata/OpenAPI/SDK still expose `projects.list/show` with product-session
  auth and no CLI-only schema.
- [x] Verify profile store and remote dispatcher import boundaries.
- [x] Verify no committed `appaloft.yml` fixture contains token, database URL, SSH key, credential
  id, tenant/org secret identity, or raw secret control-plane fields.
- [x] Run `bun run --cwd packages/adapters/cli typecheck`.
- [x] Run `bun run --cwd apps/shell typecheck`.
- [x] Run `bun run --cwd packages/adapters/cli test`.
- [x] Run `bun run typecheck`.
- [x] Run `bun run lint`.
- [x] Run `git diff --check`.

Verification notes:

- `bun run lint` exits successfully with existing `apps/web/src/routes/layout.css`
  `noImportantStyles` warnings unrelated to this slice.
- `git diff --name-only -- '*.yml' '*.yaml'` produced no changed committed config files.
