# Remote Agent Door

## Status

- Round: Code
- Artifact state: slice 1 identity door shipped on public `main` `4f237698`; slice 2 occupancy ticket [#1128](https://github.com/appaloft/appaloft/issues/1128)
- Discovery: [discovery.md](./discovery.md)
- Governing decision: ADR-118 occupies; ADR-117 remains the login/Server/`--local` door; ADR-116 remains Scratch-only; ADR-103 stays on explicit `workspace open` Git fail-closed
- Code changes allowed: yes for occupancy
- Compatibility: public minor. Default `appaloft code` now occupies a Sandbox; `--local` preserves Spec 138; `workspace open` Git preflight unchanged

## Business Outcome

After `appaloft login`, `appaloft code` occupies **my Sandbox** on the team’s default
enrolled Server. Source is the remote Binding SHA. The laptop tree is not uploaded.
`--local` remains this-Mac Scratch. Explicit `workspace open` keeps ADR-103 Git fail-closed.

## Ubiquitous Language

| Term | Meaning |
| --- | --- |
| Remote Agent door | Default `appaloft code`. Login + default Server + my Sandbox occupancy. |
| My Sandbox | Tenant + subject + Project Binding occupancy. `workspaceId = sandboxId`. |
| Shared Server | Enrolled Mac mini / VPS / later managed pool. Door passes `targetServerId`. |
| Scratch | Spec 138 this-Mac session. Only `appaloft code --local`. |
| Delivery open | `appaloft workspace open`. ADR-103 Git fail-closed. Unchanged managed-default policy. |
| `ca` tree | Later `appaloft workspace` management UI. Not this slice. |

## Requirements And Acceptance Criteria

| ID | Behavior | Given | When | Then |
| --- | --- | --- | --- | --- |
| WS-REMOTE-LOGIN-001 | Login is the door | no Appaloft login | `appaloft code` | exits non-zero with login guidance; does not start Scratch. |
| WS-REMOTE-SERVER-002 | Server required | logged in, no enrolled/default Server | `appaloft code` | exits with enroll / `workspace` guidance; no Scratch; no Sandbox create. |
| WS-REMOTE-OPEN-003 | Default code occupies | logged in, default Server exists | `appaloft code` | CLI does not inspect laptop Git as Workspace truth; dispatches `workspaces.open` with remote SHA + `targetServerId`; prints Remote banner with real `workspaceId`; attaches via existing handoff. |
| WS-REMOTE-RESUME-004 | Same person reconnect | I already have a non-terminal preferred Sandbox | `appaloft code` from any directory, including another Git origin | resumes that Sandbox; cwd origin is not Workspace truth unless `--new`. |
| WS-REMOTE-OCCUPY-005 | One disk each | teammate B is logged in on the same Server/Binding | B runs `appaloft code` | B gets B’s Sandbox; A’s files and auth paths are not mounted. |
| WS-REMOTE-NO-UPLOAD-006 | No laptop upload | laptop tree is dirty / missing / not a repo | `appaloft code` | still occupies from remote SHA when origin exists; no file content upload; no `workspace_git_dirty`. Missing origin resumes the latest non-terminal occupancy when one exists; otherwise fail-closes `workspace_remote_repository_missing`. |
| WS-REMOTE-BINDING-007 | Binding optional at CLI | logged in + Server, no Project Binding | `appaloft code` | Community initializer creates/reuses Project + Binding + invisible `appaloft-remote` Profile; occupancy proceeds. |
| WS-REMOTE-PROFILE-008 | Shared harness pin | Project has no default Profile | `appaloft code` occupies | initializer installs OpenCode-else-Pi `appaloft-remote` with optional `model-api` and no required model credential. Unbound compile still starts vendor-login. Existing default Profile is reused, never overwritten. |
| WS-REMOTE-AUTH-009 | Personal model login | no team Connection; I never signed in inside my Sandbox | Agent starts | vendor TUI may prompt **me** to log in; occupancy egress allowlist includes `opencode.ai` so unbound OpenCode vendor-login is not blocked by the sandbox proxy. No teammate OAuth file is copied. |
| WS-REMOTE-LOCAL-010 | Scratch is explicit | any directory | `appaloft code --local` | Spec 138 Scratch contract; no Server/Sandbox required. |
| WS-REMOTE-OPEN-COMPAT-011 | Delivery open unchanged | `workspace open` / `workspace create` | dirty/non-git laptop | existing `workspace_git_*` fail-closed. Bare `workspace open` does not require `targetServerId`. |
| WS-REMOTE-CAPACITY-012 | No silent fallback | default Server has no capacity | `appaloft code` | fail closed; not Scratch; not another teammate’s Sandbox; not a different Server; not managed substitution. |
| WS-REMOTE-DOCS-013 | Help names doors | `code --help` / Workspace docs | rendered | default `code` occupies my Sandbox; `--local` is Scratch; `workspace open` is delivery Git-safe; `workspace` `ca` is later. |
| WS-REMOTE-BANNER-014 | Identity after occupy | `workspaces.open` succeeds | attach or `--no-attach` | stdout has one banner: `Remote · <project> · <repo@sha> · <server> · my sandbox · <workspaceId>`. No live deploy stream. |
| WS-REMOTE-TARGET-015 | Door Server is placement | door selected Server S | `code` dispatches open | command includes `targetServerId=S`; placement reserves S. |
| WS-REMOTE-NO-ATTACH-016 | Occupy without attach | `--no-attach` | `appaloft code --no-attach` | Sandbox is created or resumed; CLI does not attach; exit 0; `sandbox list` shows my occupancy. |
| WS-REMOTE-SKILL-017 | Occupancy offers Appaloft skill | occupancy OpenCode starts or attaches | harness config is prepared | Sandbox serve offers `/workspace/skills` and `/workspace/.agents/skills`; `appaloft-remote` declares optional `appaloft-tools` so a later first-party MCP Connection can bind into occupancy serve. Unbound occupancy still starts without serve MCP. Native attach offers the public Appaloft skill plus `appaloft mcp remote-stdio` when a control plane is selected, or `mcp stdio` for local-only Scratch. Occupancy attach must not wrap remote-stdio with `APPALOFT_CONTROL_PLANE_MODE=none`. Attach sets an isolated `XDG_CONFIG_HOME` so a broken host `opencode.json` cannot reject the injected MCP. Vendor TUI text is not parsed. |

| WS-REMOTE-RESUME-SERVE-018 | Resume restarts serve | preferred Sandbox exists but OpenCode serve is gone | `appaloft code --no-attach` | occupancy resumes the same workspaceId and `ensureRuntime` starts serve before exit 0. |
| WS-REMOTE-TEMPLATE-019 | Occupancy template is automatic | login + Server, no `APPALOFT_OPENCODE_SANDBOX_TEMPLATE_ID` | `appaloft code --no-attach` | Community/Cloud register OpenCode against reserved `stp_appaloft_remote_opencode`, ensure that tenant template with `COMMUNITY_REMOTE_DEFAULT_NETWORK_POLICY`, then occupy. Explicit env still pins a different template id. Mismatch fail-closes; no local/BYOS fallback. |
| WS-REMOTE-RESUME-EGRESS-020 | Ready occupancy resume reapplies egress | preferred allowlist Sandbox is already `ready` | `appaloft code --no-attach` | resume probes the provider runtime, then reapplies the stored allowlist via `updateNetworkPolicy` so a replaced Sandbox Gateway still has the occupancy egress policy. Gateway 5xx fail-closes; deny-mode Sandboxes skip reapply. |
| WS-REMOTE-MCP-DISCOVERY-021 | Occupancy can discover deploy ids and deliver | occupancy OpenCode/Pi has first-party `appaloft-tools` | Agent prepares serve, deploys, or opens a PR | first-party binding always includes `projects_list`, `environments_list`, `resources_list`, `resources_show`, `servers_list`, `deployments_list`, `deployments_plan`, `deployments_create`, `deployments_show`, `preview_environments_list`, `preview_environments_show`, `sandbox_ports_expose`, and `sandboxes_agent_tasks_deliver`. Tenant MCP Connections are unchanged. Invisible `appaloft-remote` default lists the same tools. |




## Slice Scope

Slice 1 (shipped): login + default Server + Remote banner + this-laptop native-attach.

Slice 2 (this ticket): occupy my Sandbox from default `code`.

In slice 2:

- default `code` must call `workspaces.open`;
- optional `targetServerId` on `workspaces.open`;
- Community initializer for missing Binding/default Profile;
- `--no-attach` still occupies;
- `appaloftdev code --no-attach` after login + enrolled Server lists a Sandbox.

Out of slice 2: `workspace` as Railway `ca` tree, team Connection, Cloud managed as
default Server when no BYOS, adding Server to the preferred unique key, sharing
occupancy metrics.

## Public Surfaces

- CLI: default `appaloft code [--no-attach] [--local]`. Path is not a Git locator
  for the default door.
- Catalog: existing `workspaces.open` gains optional `targetServerId`.
- Persistence: existing Server / Binding / Profile / `workspace_open_entries`.
- No new aggregate or Cloud table.

## Domain Ownership

- Server, Sandbox, Binding, Profile: existing public aggregates.
- CLI resolves login, default Server, and remote SHA, then dispatches
  `workspaces.open`.
- Community initializer owns invisible `appaloft-remote`.
- Cloud: later default-Server injection when no BYOS exists. Must honor
  `targetServerId` and must not override it with managed capacity.

## Error Contract

| Code | When |
| --- | --- |
| `workspace_remote_login_required` | not logged in |
| `workspace_remote_server_missing` | no default Server |
| `workspace_remote_repository_missing` | no Git origin and no resumable occupancy |
| `workspace_open_target_server_unavailable` | `targetServerId` is not tenant-visible or not reservable |
| existing `workspace_git_*` | `workspace open` / `workspace create` only |
| Spec 138 scratch codes | `--local` only |

Missing Binding is not a `code` hard failure. The initializer creates or reuses it.

## Non-Goals

- Implementing `ca` in the same ticket as occupancy.
- Shared personal OAuth.
- Dirty-tree upload.
- New Host aggregate.
- Deleting Scratch; only keep it behind `--local`.
- Adding Server to the preferred unique index.
- Cloud managed as default Server when no BYOS exists.

## Compatibility

- Spec 138 / ADR-116: Scratch lives under `--local`.
- ADR-117 identity-only attach is superseded by ADR-118 occupancy.
- Users who adopted #1127 identity-only `code` now occupy a Sandbox.
- Expected SemVer: public minor. Changelog must say default `code` occupies my Sandbox.
