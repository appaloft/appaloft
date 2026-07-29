# Plan: Profile-Aware Workspace Open And Attach

## Governing Sources

- ADR-094, ADR-100, ADR-102
- Spec 111 and Spec 117
- `docs/workflows/agent-workspace.md`
- `docs/testing/profile-aware-workspace-open-test-matrix.md`
- `docs/specs/074-cli-remote-control-plane-client/`

## Architecture

1. Add connector-neutral Repository locator normalization and a tenant-scoped
   `RepositoryBinding` aggregate/repository with bind/show/list/delete operations.
2. Add intention-revealing Project commands/query fields for configuring and reading the default
   Agent Workspace Profile installation.
3. Extend Profile installation configuration with requirement-to-named-Connection references;
   keep portable definitions secret- and tenant-free.
4. Add `OpenAgentWorkspaceCommand` as an application workflow operation. It:
   - resolves binding, Project and Profile;
   - compiles the immutable Profile plan;
   - resolves source ref and named Credential Connections;
   - validates attach capability and local handoff policy;
   - obtains a consumable admission/placement reservation;
   - coordinates preferred Workspace selection and create-or-resume;
   - materializes the immutable source commit;
   - performs initialization/default ports;
   - creates the Runtime with immutable pin;
   - returns one descriptor plus attach handoff.
5. Store source pin and preferred lookup as Workspace-entry metadata/projection keyed by tenant,
   subject, Project, Repository Identity, and branch. It references Sandbox ids and does not own
   Sandbox lifecycle.
6. Reuse or replace one current managed-terminal Agent attachment per Runtime; native attach
   returns short-lived access plus explicit handoff policy.
7. Keep local Git inspection in the CLI adapter. Business resolution and mutation dispatch through
   generated remote operation contracts.
8. Replace CLI and Console name-based create branches with Profile/capability data.

## CQRS, Read Model And Events

- Commands: bind/unbind Repository, configure Project default Profile, configure Profile Credential
  Connections, open Workspace.
- Queries: list/show Repository Bindings and read Workspace open/preferred state through the open
  descriptor; Profile resolution reuses bounded list/show queries.
- The open command owns orchestration and mutation coordination; query handlers do not mutate.
- No new domain event is required for the first slice. Existing Sandbox/Runtime/Terminal lifecycle
  facts remain authoritative; audit consumes operation results through existing policy.

## Persistence

- Public PG/PGlite persistence for Repository Binding, Project default Profile reference, Profile
  installation Connection references, Workspace source/preference projection, and current managed
  attach session reference.
- No `workspaces` aggregate table. Every projection row references an existing Sandbox id.
- Termination removes/repoints only owned preference and ephemeral session/grant/reservation state.

## Error And Partial-Failure Model

- Pre-effect: local Git, binding, Profile, credential, capability, template, authz, and placement
  errors contain no Workspace id because no Sandbox exists.
- Post-identity: errors contain safe phase, workspace/sandbox id, retryability, and exact
  recovery/terminate operation keys.
- Repeated open never hides a partial Workspace by creating another unless `--new` was explicit.

## Testing Strategy

- Matrix ids `WS-OPEN-*`, `WS-CREATE-*`, and `WS-ATTACH-*`.
- Unit: local Git resolver, Repository normalization/value objects, Profile reference resolution.
- Application/PGlite: binding/default/configuration lifecycle, pre-effect ordering, idempotent open,
  preferred `--new`, SHA mismatch, partial retry and cleanup.
- CLI/remote: help, parsing, no-secret argv, remote catalog dispatch, terminal auto attach, native
  handoff execution/display.
- Contract: oRPC/HTTP/generated SDK/Console schema parity.
- Cloud: authz, audit, named Credential custody, reservation/placement, partial evidence.
- Opt-in: real Pi managed TUI and OpenCode native attach, reconnect, terminate, and remote orphan
  readback.

## Docs And Compatibility

- Update Workspace task/reference/troubleshooting docs and stable CLI help anchors.
- Treat this as an additive public capability. Do not remove lower-level operations.
- Record no implicit sync/patch upload as a deliberate V1 limitation.

## Risks

- Local Git remote verification must not leak credentials or execute hooks.
- A server-provided local client argv requires explicit approved capability and direct spawn.
- Placement reservation consumption and release must remain exact across partial failure.
- Cross-client concurrency requires durable coordination; client-only idempotency is insufficient.
