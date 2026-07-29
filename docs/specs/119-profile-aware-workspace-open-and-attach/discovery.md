# Discovery: Profile-Aware Workspace Open And Attach

## Actor And Outcome

An authenticated developer who has already bound a Git Repository to a Project, selected a
Project default Agent Workspace Profile, configured its Credential Connections, and registered
capacity can run `appaloft workspace open .` from a local Git checkout. Appaloft resolves the exact
remote source, creates or resumes one Sandbox-backed Workspace, starts the pinned Agent Runtime,
and enters the Agent-owned interface without requiring Workspace, Runtime, Server, or Terminal ids.

## Existing Evidence

- ADR-094 and Spec 111 define Agent Workspace as a public workflow whose identity is `SandboxId`.
- ADR-100 and Spec 117 define immutable Profile/Adapter installation pins, capability-derived
  interaction, and requirement/reference/grant credential delivery.
- SDK and Console creation already compile Profiles before creating a Sandbox.
- CLI `workspace create` still selects Pi/OpenCode by name, does not accept a Profile installation,
  and only prints attach descriptors.
- `SourceLink` maps deployment source fingerprints to Project/Environment/Resource/Server context.
  It is not a Repository-to-Project onboarding binding and must not be reused for this workflow.
- Sandbox creation has no atomic local-context create-or-resume workflow or durable preferred
  Workspace lookup by user, Project, Repository, and branch.

## Constraints

- No second Workspace aggregate, identity, lifecycle, or Cloud-only operation family.
- Public Appaloft owns neutral Repository Binding, Project default Profile, source pin, Workspace
  open orchestration, Profile resolution, capability-driven attach, and recovery semantics.
- Cloud injects tenancy, authz, named Credential custody, placement reservation, audit, and hosted
  composition.
- Local source files and patches never cross the boundary in V1.
- Secret values and secret URIs never enter argv, descriptors, audit, Profile definitions, or
  Workspace source metadata.

## Owner-Confirmed Decisions

| # | Topic | Decision |
| --- | --- | --- |
| 1 | Repository binding | Add a neutral public `RepositoryBinding` from normalized Repository identity to Project. Do not reuse deployment `SourceLink`. |
| 2 | Atomic workflow | Add a public application-level `workspaces.open` workflow operation shared by CLI, SDK, Console, and remote dispatch. It composes existing owners and returns `workspaceId = sandboxId`. |
| 3 | Dirty checkout | Any staged, unstaged, or untracked file fails before remote lookup or mutation. Output includes the intended HEAD SHA and a bounded safe summary; no patch upload exists. |
| 4 | Pushed source | Require an upstream branch whose read-only remote tip exactly equals local HEAD. Detached, missing, unreadable, or mismatched refs fail before control-plane effects. |
| 5 | Native handoff | Execute local argv only when the approved Adapter explicitly declares `local-client-exec`; never use a shell, secret environment injection, or Agent-name branching. Otherwise display the validated handoff. |
| 6 | Admission | Consume a neutral admission/placement reservation before Sandbox creation. Cloud supplies authz, quota, Server Pool capacity, and the short-lived reservation. |
| 7 | Source mismatch | If a resumable Workspace pin differs from current HEAD, fail and recommend `--new`; V1 never syncs, resets, merges, or rebases an existing Workspace. |
| 8 | Managed terminal | Reconnect the Runtime's one current valid Agent TUI Terminal Session. Launch a new exact-grant child only when the previous session is terminal, expired, or unrecoverable. |
| 9 | `--new` preference | A newly isolated Workspace becomes the preferred resumable Workspace for that context. Older Workspaces remain available through lower-level commands. |
| 10 | Profile reference | Resolve exact installation id, then exact enabled Profile id, then exact enabled display name. Missing, disabled, stale, or ambiguous matches fail before effects. Project default stores an immutable installation id. |
| 11 | Repository identity | Use a connector-neutral resolver for scp SSH, `ssh://`, and credential-free HTTPS. Normalize host/default port/trailing slash/`.git`, preserve path case, and never guess an Organization or forge. |
| 12 | Explicit create source | Resolve `--repo/--ref` to an immutable commit pin before Sandbox creation and materialize that exact commit. |
| 13 | Credential ownership | Tenant-scoped Profile installation configuration maps requirement ids to named Credential Connections. Open/create select only the Profile; custody resolves and grants at execution time. |
| 14 | Partial failure | Repeated open coordinates the same partial Sandbox identity. Safe phases may retry; unsafe phases return exact recovery/terminate evidence. No automatic duplicate or evidence deletion. |

The owner confirmed shared understanding and authorized Spec, Ticket, and Code on 2026-07-28.

## Rejected Options

- Reusing `SourceLink`: couples coding Workspace entry to Resource/Environment/Server deployment
  identity.
- CLI-only lookup then create: cannot provide cross-client idempotency or concurrency safety.
- Pi/OpenCode conditionals: violates Adapter capability ownership.
- Dirty warning with continued creation: makes remote source differ from the developer's apparent
  local context.
- Implicit patch upload or Git sync: introduces secret/file selection and destructive merge
  semantics outside this feature.
- Raw SSH/native server handoff: violates scoped, revocable access.

## Open Questions

None.
