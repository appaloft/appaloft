# Remote Agent Door

## Status

- Round: Code
- Artifact state: first-slice implementation in progress
- Discovery: [discovery.md](./discovery.md)
- Governing decision: ADR-117; ADR-116 remains Scratch-only; ADR-103 stays on
  `workspace open`
- Code changes allowed: yes for the remote `code` door
- Compatibility: public minor. Default `appaloft code` changes again; `--local`
  preserves Spec 138; `workspace open` unchanged

## Business Outcome

After `appaloft login`, `appaloft code` resolves the team’s default enrolled Server
and Binding SHA, then native-attaches OpenCode/Pi on this laptop so the user can
configure and develop immediately. Durable Sandbox/`workspaces.open` stays on
`appaloft workspace open`.

## Ubiquitous Language

| Term | Meaning |
| --- | --- |
| Remote Agent door | Default `appaloft code`. Login + default Server + my Sandbox. |
| My Sandbox | Tenant + subject + default Server + Project Binding occupancy. One disk per person. |
| Shared Server | Enrolled Mac mini / VPS / later managed pool. Many Sandboxes. |
| Scratch | Spec 138 this-Mac session. Only `appaloft code --local`. |
| Delivery open | `appaloft workspace open`. ADR-103 Git fail-closed. |
| `ca` tree | Later `appaloft workspace` management UI. Not this slice. |

## Requirements And Acceptance Criteria

| ID | Behavior | Given | When | Then |
| --- | --- | --- | --- | --- |
| WS-REMOTE-LOGIN-001 | Login is the door | no Appaloft login | `appaloft code` | exits non-zero with login guidance; does not start Scratch. |
| WS-REMOTE-SERVER-002 | Server required | logged in, no enrolled/default Server | `appaloft code` | exits with enroll / `workspace` guidance; no Scratch; no Sandbox create. |
| WS-REMOTE-OPEN-003 | Default code is remote identity | logged in, default Server exists | `appaloft code` | CLI does not inspect laptop Git as Workspace truth; prints Remote banner; native-attaches OpenCode/Pi. Does not require Adapter/Profile/Sandbox. |
| WS-REMOTE-RESUME-004 | Same person reconnect | I already have a non-terminal Sandbox on that Server for this Binding | `appaloft workspace open` | resumes that Sandbox; does not create a duplicate unless `--new`. |
| WS-REMOTE-OCCUPY-005 | One disk each | teammate B is logged in on the same Server/Binding | B runs `appaloft workspace open` | B gets B’s Sandbox; A’s files and auth paths are not mounted. |
| WS-REMOTE-NO-UPLOAD-006 | No laptop upload | laptop tree is dirty / missing / not a repo | `appaloft code` | still remote-identifies; no file content upload; no `workspace_git_dirty`. |
| WS-REMOTE-BINDING-007 | Binding optional at CLI | logged in + Server, no Project Binding | `appaloft code` | CLI still resolves remote SHA when origin exists; missing Binding does not block native attach. |
| WS-REMOTE-PROFILE-008 | Shared harness pin later | Project default Profile pins OpenCode/Pi/omp + skill | `workspace open` starts | that Profile/Adapter/template is used. Default `code` native-attaches this-laptop OpenCode/Pi without a tenant Profile. |
| WS-REMOTE-AUTH-009 | Personal model login | no team Connection; I never signed in inside my Sandbox | Agent starts | vendor TUI may prompt **me** to log in; no teammate OAuth file is copied. |
| WS-REMOTE-LOCAL-010 | Scratch is explicit | any directory | `appaloft code --local` | Spec 138 Scratch contract; no Server/Sandbox required. |
| WS-REMOTE-OPEN-COMPAT-011 | Delivery open unchanged | `workspace open` / `workspace create` | dirty/non-git laptop | existing `workspace_git_*` fail-closed. |
| WS-REMOTE-CAPACITY-012 | No silent fallback | default Server has no capacity | `appaloft code` | fail closed; not Scratch; not another teammate’s Sandbox. |
| WS-REMOTE-DOCS-013 | Help names doors | `code --help` / Workspace docs | rendered | default `code` is remote; `--local` is Scratch; `workspace open` is delivery Git-safe; `workspace` `ca` is later. |
| WS-REMOTE-BANNER-014 | Identity before attach | remote `code` resolves | attach or `--no-attach` | stdout has one banner: `Remote · <project> · <repo@sha> · <server> · my sandbox`. No live deploy stream. Machine sleep/wake only if already on the open descriptor. |

## First Slice Scope

Slice 1 is **only the `code` door**: login + default Server + Remote banner +
native OpenCode/Pi. 001–013 except full `ca` UI and live Sandbox attach.

Out of slice 1: `workspace` as Railway `ca` tree, team Connection, Cloud managed as
default Server when no BYOS, multi-session on one Sandbox, sharing occupancy
metrics. Durable Sandbox attach remains `workspace open` and still requires an
installed Adapter + default Profile on the target control plane.

## Public Surfaces

- CLI: default `appaloft code [--no-attach] [--local]`. Path is not a Git
  locator for the default door.
- No new catalog operation. Durable remote open remains `workspaces.open` on
  `workspace open`.
- Persistence: existing Server / Binding only for the `code` door.

## Domain Ownership

- Server, Sandbox, Binding, Profile: existing public aggregates.
- CLI resolves login, default Server, Binding, and remote SHA, then native-attaches.
- Cloud: later default-Server injection and durable Sandbox Profile only.

## Error Contract

| Code | When |
| --- | --- |
| `workspace_remote_login_required` | not logged in |
| `workspace_remote_server_missing` | no default Server |
| `workspace_remote_binding_missing` | no Binding |
| existing `workspace_git_*` | `workspace open` only |
| Spec 138 scratch codes | `--local` only |

## Non-Goals

- Implementing `ca` in the same ticket as `code`.
- Shared personal OAuth.
- Dirty-tree upload.
- New Host aggregate.
- Deleting Scratch; only demote it.

## Compatibility

- Spec 138 / ADR-116: Scratch lives under `--local`.
- Users who adopted #1125 default Scratch migrate to `--local` or login+enroll.
- Expected SemVer: public minor, changelog must say default `code` is remote again.
