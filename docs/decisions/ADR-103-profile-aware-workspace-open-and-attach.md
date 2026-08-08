# ADR-103: Profile-Aware Workspace Open And Attach

Status: Accepted

Date: 2026-07-28

## Context

ADR-094 established Agent Workspace as a public entry workflow over Sandbox and Agent Runtime.
ADR-100 added portable Adapter/Profile definitions and immutable installation pins. Current
creation still diverges by entrypoint: SDK and Console compile Profiles independently, while CLI
selects Pi/OpenCode by name and requires low-level Sandbox parameters. Reconnect also requires ids,
and attach returns a descriptor instead of entering the Agent-owned interface.

Local Git context introduces a separate identity problem. Deployment `SourceLink` binds a source
fingerprint to Project/Environment/Resource/Server deployment context; it cannot truthfully stand
for a Repository-to-Project Workspace onboarding decision.

## Decision

1. Add a public tenant-scoped `RepositoryBinding` aggregate that maps connector-neutral
   `RepositoryIdentity` to `ProjectId`. It is distinct from deployment `SourceLink`.
2. Project owns an optional default Agent Workspace Profile installation reference. The reference
   must resolve to an enabled, tenant-visible immutable installation.
3. Profile installation configuration, not the portable Profile definition, maps Adapter
   credential requirement ids to named Credential Connections. Secret values and secret URIs do
   not cross Workspace operation contracts.
4. Add one public application workflow operation, `workspaces.open`. It performs atomic
   create-or-resume coordination over existing Sandbox, Runtime, Terminal, Port, Profile,
   Repository Binding, and Project operations. It does not create a Workspace aggregate.
5. `workspaceId` remains exactly the Sandbox id. A durable Workspace-entry projection may map
   tenant + subject + Project + Repository Identity + branch to preferred Sandbox ids and immutable
   source pins, but it owns no lifecycle state.
6. Creation fails before Sandbox effects unless Repository, Project, enabled Profile, exact named
   Credentials, Adapter/Template/capability compatibility, authz, and a consumable
   admission/placement reservation all succeed.
7. Local Git inspection is a CLI adapter responsibility. Dirty state, detached/no-upstream state,
   and remote branch tip mismatch fail before business dispatch. V1 never uploads or synchronizes
   local changes.
8. Explicit refs resolve to immutable commit pins before Sandbox creation. Resume requires the
   preferred Workspace source pin to match the requested commit; otherwise callers use `--new`.
9. `--new` creates a distinct Sandbox, makes it preferred for later open, and leaves older
   Workspaces untouched.
   An explicit Profile selector may resume the latest non-terminal older Workspace pinned to that
   resolved Profile; omitting the selector continues to use the global preference.
10. Attach behavior derives only from the pinned Adapter capability snapshot:
    - managed-terminal reuses the current valid Agent TUI Terminal Session and automatically
      bridges the CLI to it;
    - native attach issues short-lived revocable access and executes local argv only with an
      explicit approved `local-client-exec` capability;
    - unsupported attach fails without fabricated descriptors or raw host credentials.
11. SDK, CLI, Console, HTTP/oRPC, remote CLI, and future tool surfaces reuse the same workflow input
    and result schema.
12. Cloud supplies tenancy, authz, credential custody/grants, placement reservation, audit, and
    hosted provider composition through neutral public ports.

## Consequences

- One local command can create, resume, and attach without internal ids.
- Concurrent clients coordinate through the control plane rather than racing client-side queries
  and Sandbox creation.
- Repository onboarding, deployment source identity, and Workspace lifecycle remain separate.
- Pi, OpenCode, and future Agents use the same capability path; names never drive attach behavior.
- Partial failures retain exact Sandbox identity and recovery/termination evidence.

## Rejected Alternatives

- A new Workspace aggregate or Cloud Workspace table.
- Reusing `SourceLink`.
- CLI-only orchestration and best-effort idempotency.
- Provider/Agent-name branches.
- Raw native endpoints or automatic execution of undeclared local commands.
- Dirty warnings with continued creation or implicit patch upload/sync.

## Verification

See
[Profile-Aware Workspace Open And Attach Test Matrix](../testing/profile-aware-workspace-open-test-matrix.md).
