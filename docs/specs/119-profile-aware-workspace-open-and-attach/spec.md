# Profile-Aware Workspace Open And Attach

## Status

- Round: Spec complete; Ticket and Code authorized
- Artifact state: ready
- Compatibility: additive public CLI/API/SDK/Console capability with deliberate removal of
  name-based defaults from the new create path

## Business Outcome

An authenticated developer can enter a clean, pushed local Git Repository and run one command:

```bash
appaloft workspace open .
```

Appaloft resolves Repository, Project, Profile, Credential Connections, immutable source pin,
placement, Sandbox, Agent Runtime, and attach behavior without asking the developer for internal
resource ids or exposing host credentials.

## Ubiquitous Language

| Term | Meaning |
| --- | --- |
| Repository Identity | Connector-neutral canonical host and path used to find a Repository Binding. |
| Repository Binding | Tenant-scoped public aggregate that maps one Repository Identity to one Project. |
| Project Default Workspace Profile | Immutable enabled Profile installation selected when open has no explicit Profile. |
| Workspace Open Context | Tenant, subject, Project, Repository Identity, branch, and immutable source commit used for create-or-resume. |
| Preferred Workspace | Most recently selected non-terminal Sandbox identity for one Workspace Open Context. |
| Workspace Source Pin | Immutable Repository Identity, credential-free clone locator, ref, branch, and commit recorded for recovery. |
| Attach Handoff | Capability-derived managed-terminal connection or validated native local-client argv. |

## Requirements And Acceptance Criteria

| ID | Behavior | Given | When | Then |
| --- | --- | --- | --- | --- |
| WS-OPEN-GIT-001 | Resolve local Git context | A path is inside a Git worktree | CLI resolves context | Root, upstream remote, branch, and HEAD SHA are read without uploading files. |
| WS-OPEN-GIT-002 | Normalize Repository identity | Remote is scp SSH, `ssh://`, or HTTPS | identity is resolved | Equivalent locators match one connector-neutral identity; credentials, query, and fragment are rejected. |
| WS-OPEN-GIT-003 | Reject dirty source | Worktree has staged, unstaged, or untracked paths | open runs | It fails before remote calls, prints HEAD SHA and bounded status guidance, and uploads nothing. |
| WS-OPEN-GIT-004 | Reject unpushed or mismatched source | Upstream is absent, unreadable, missing, ahead, behind, or at another SHA | open runs | It fails before control-plane mutation with safe push/ref guidance. |
| WS-OPEN-BIND-005 | Resolve Project | A Repository Binding exists | open runs | The exact tenant-scoped Project is selected; absence returns bind/create entrypoints and no Organization guess. |
| WS-OPEN-PROFILE-006 | Resolve Profile | Explicit installation/name or Project default exists | open runs | Exact enabled installation is selected and compiled; missing, ambiguous, disabled, stale, or unauthorized state fails before effects. |
| WS-OPEN-CRED-007 | Resolve named Credentials | Profile requirements have installation bindings | preflight runs | Every required named Connection resolves exactly once; missing/stale/unauthorized state fails before Sandbox creation and returns a safe Connect Credential entrypoint. |
| WS-OPEN-ADMIT-008 | Reserve placement | Profile, source, credentials, capability, template, and authz are valid | preflight runs | A consumable reservation is obtained before Sandbox create; capacity failure creates no Sandbox. |
| WS-CREATE-PROFILE-009 | Profile-aware create | Valid Profile, repo, ref, branch are supplied | `workspace create` runs | Ref becomes an immutable source pin; compiled template, isolation, limits, network, initialization, ports, Runtime pin, and named credentials are used. |
| WS-OPEN-CREATE-010 | Create first Workspace | No preferred Workspace exists | open runs | One Sandbox and one Runtime are created through the workflow; `workspaceId = sandboxId`. |
| WS-OPEN-RESUME-011 | Resume idempotently | A matching preferred Workspace exists | open runs again | Same Sandbox/Runtime is resumed or reconnected; no duplicate Sandbox is created. |
| WS-OPEN-NEW-012 | Force isolation | A preferred Workspace exists | open runs with `--new` | A new Sandbox becomes preferred; existing Workspaces remain unchanged and addressable. |
| WS-OPEN-SHA-013 | Protect source mismatch | Preferred Workspace source SHA differs from local HEAD | open runs | It fails and recommends `--new`; no implicit Git mutation occurs. |
| WS-ATTACH-MANAGED-014 | Auto attach managed terminal | Adapter declares managed-terminal | create/open attaches | Exact process grant launches or reuses the Agent TUI and the CLI immediately connects to the returned Terminal Session with bounded replay. |
| WS-ATTACH-NATIVE-015 | Native attach handoff | Adapter declares native attach | create/open attaches | A short-lived revocable capability is issued; explicit `local-client-exec` runs validated argv directly, otherwise safe argv is displayed. |
| WS-ATTACH-UNSUPPORTED-016 | Reject unsupported attach | Profile has no supported attach mode | attach is requested | Capability-driven error is returned; no fake attach or raw host/credential is emitted. |
| WS-OPEN-PARTIAL-017 | Preserve partial evidence | Failure occurs after Sandbox identity exists | workflow returns | No partial Runtime is fabricated; exact phase, ids, retryability, recovery, and terminate evidence are returned. |
| WS-OPEN-REMOTE-018 | Remote CLI parity | An authenticated remote profile is active | create/open runs | Local Git preflight stays local; every business operation dispatches through catalog-backed remote contracts and terminal gateway. |
| WS-OPEN-SURFACE-019 | Cross-surface parity | CLI, SDK, Console use Workspace creation | same input is supplied | All call the same Profile-aware workflow schema and return the same descriptor semantics. |
| WS-OPEN-CLEANUP-020 | Exact termination cleanup | A Workspace has source preference, Runtime, grants, Terminal/native access, reservation, and Sandbox state | terminate completes | Owned ephemeral state and preference are revoked/advanced exactly; Repository Binding, Project default, Profile installation, and other Workspaces remain. |

## Public Surfaces

- CLI:
  - `appaloft workspace create --profile <name-or-installation-id> --repo <https> --ref <ref> --branch <branch> [--attach]`
  - `appaloft workspace open [path] [--profile <name-or-id>] [--new] [--no-attach]`
  - existing list/show/connect/attach/task/preview/pause/resume/terminate commands remain.
- API/oRPC: Repository Binding lifecycle, Project default Profile configuration, Profile
  installation Credential Connection configuration, and `workspaces.open`.
- SDK: local-context-free `workspaces.open(input)` plus profile-aware `workspaces.create(input)`.
- Console: creation calls the same workflow rather than duplicating Profile compilation.
- Public docs/help: task-oriented Workspace open/create/attach and troubleshooting anchors.

## Domain Ownership

- `RepositoryBinding` owns Repository Identity to Project association.
- `Project` owns its default Workspace Profile installation reference.
- `Sandbox` remains the Workspace identity and lifecycle owner.
- `SandboxAgentRuntime` owns immutable Profile/Adapter pin and active attach session reference.
- Workspace open is an application workflow with a durable preferred-Workspace projection and
  mutation coordination scope; it is not an aggregate.

## Non-Goals

- Uploading local files, patches, dirty changes, or implicit Git synchronization.
- A new Workspace aggregate, table, status model, or Cloud-only operation family.
- Raw host addresses, SSH keys, long-lived native credentials, or secret values in observable
  contracts.
- Name-based Agent branching in CLI, SDK, Console, application, or Cloud composition.
- Arbitrary local command execution without an approved handoff capability.

## Compatibility

Lower-level Sandbox, Runtime, Terminal, attach, task, preview, pause/resume/terminate operations
remain available. Existing harness-based SDK creation remains a low-level compatibility path;
the user-facing CLI create path becomes Profile-aware and capability-driven.
