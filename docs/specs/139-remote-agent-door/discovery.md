# Remote Agent Door — Grill / Discovery

## Status

- Round: Code. Owner-confirmed by goal: login → remote code → workspace.
- Date: 2026-08-15.
- Predecessor: Spec 138 / ADR-116 Instant Local Scratch shipped as public #1125.
- Code changes allowed: yes for the remote `code` door. `workspace` as `ca` remains later.

## Actor And Observable Outcome

A teammate sits down at any laptop, already allowed on the team's enrolled Server
(a Mac mini or VPS):

```text
appaloft login
appaloft code
```

They land in **their** Sandbox on that Server, running the team's pinned OpenCode
(or Pi) version, with Project skill/repo already injected. They edit and write
without caring which host path or Sandbox id they are on. Disconnect and
`appaloft code` again wakes the same Sandbox.

`appaloft workspace` is the Railway `ca` tree: Servers, other people's occupancy
counts (not their disks), my Sandboxes, sleep/wake, pick Project.

Deploy, Git preview and production URLs stay existing catalog operations, invoked
from inside the Agent or Workspace TUI — they are not the `code` door.

## Why The Default Door Changes Again

Spec 138 made `appaloft code` a this-Mac Scratch session so dirty/no-git/logged-out
directories could enter an Agent. Owner review against Railway then found that
local-first is the more confusing door: Railway `code` is a remote machine;
`ca` manages those machines; login happens first; Git is for deploy/preview, not
for opening the Agent.

Appaloft is BYOS. The team shares one Server. Occupancy is one person per
Sandbox on that Server, not one VM per person.

## Settled Decisions

| ID | Decision | Source |
| --- | --- | --- |
| D1 | Default `appaloft code` is remote. Login first, like Railway. Local Scratch is no longer the product default. | Owner 2026-08-15 |
| D2 | `code` attaches/creates **my** Sandbox on the team's default Server. `workspace` is the `ca` management tree. Both are primary entries. | Owner |
| D3 | Server is shared (Mac mini / VPS / Cloud managed pool). Person occupies a Sandbox, not the whole machine. Do not share one Sandbox disk. | Owner |
| D4 | OpenCode/Pi **version and Profile config** (harness, skill, repo, MCP) are Project-shared via default Profile / Adapter pin. | Owner |
| D5 | Model **subscriptions default to personal login inside my Sandbox**. Team Connection is optional later. One person's Codex/Claude OAuth file is never inherited by teammates. | Owner |
| D6 | Repo is the Project Binding, materialized **on the Server**. Laptop dirty tree is not uploaded and is not Workspace truth. | Owner |
| D7 | No capacity / no Server still fail closed. Never silently switch to this Mac Scratch. Scratch remains explicit `code --local` (or equivalent) only. | Owner + ADR-116 non-goal preserved |
| D8 | Deploy and Git/PR preview stay existing operations. `code` does not become `deploy`. | Owner + Railway docs |

## Rejected

- Keep Scratch as the default door (owner: more confusing than Railway login-first).
- One person one physical machine (BYOS team box cannot do that).
- Share `~/.codex/auth.json` / Claude setup-token from the Server home with anyone who can attach.
- Make `workspace open` accept a dirty laptop tree as remote truth.
- New Host/Machine aggregate.
- Silent managed → BYOS → Scratch fallback.

## Mapping To Railway

| Railway | Appaloft |
| --- | --- |
| `railway login` then `railway code` | `appaloft login` then `appaloft code` |
| Cloud Agent VM (personal disk) | My Sandbox on a shared Server |
| `railway ca` | `appaloft workspace` |
| Project / Environment | Project / Environment (existing) |
| `railway up` / GitHub | existing deploy + source-link |
| PR Environments | existing Cloud product-grade preview |
| Skills sync from laptop | Project/Profile skill injection on the Server |
| Personal `auth.json` copied to my VM | Personal login inside my Sandbox; optional later team Connection |

## First Slice (after Spec + Ticket)

Logged-in user, team has an enrolled Server:

```text
appaloft login
appaloft code
# Remote · <project> · <repo@sha> · <server> · my sandbox
# OpenCode, else Pi, else Oh My Pi
# no Adapter / Profile / Sandbox required
# no laptop Git fail-closed, no dirty upload
```

Not logged in → login guidance, no Scratch.
No Server → enroll / pick Server via `workspace`, no Scratch.
Durable Sandbox attach stays `appaloft workspace open`.
Later slices are **not this ticket**. Complete Railway-like chain, one vertical each:

1. **Remote `code` door** (this spec). Login + default Server + native OpenCode/Pi.
2. **Occupancy**. Preference key is subject+Server+Binding. Teammate never resumes my disk.
3. **`workspace` as `ca`**. Same TUI (Spec 126) grows a navigator: Server → my Sandboxes →
   Project/Environment. No new lifecycle. Spec 126 explicitly deferred `ca`; this reopens
   presentation only.
4. **Deployment as first-class in that TUI**. List/show/logs/rollback of existing
   `deployments.*` / Resource / proof. Today TUI only surfaces Deployment as Promotion
   aftermath of an Agent Task (Spec 128). Catalog already treats Deployment as a first-class
   aggregate; the gap is the shell, not a new deploy engine.
5. **GitHub as source surface**. Binding, default branch, open PR, product-grade preview
   (Spec 046) appear in the same navigator. GitHub App / PR comments stay Cloud enablement.
6. **Optional team Connection**. Spec 123 / Cloud 053. Personal OAuth remains default.
7. **Cloud managed as default Server** when no BYOS exists. No Scratch fallback.

Do not implement 3–7 in the same PR as 1.

## Delivery chrome (owner 2026-08-15)

Cmux-style “this session is PR #928” is correct *context*. It is not a new GitHub aggregate
and not something `code` scrapes from the vendor TUI.

- `code` keeps one identity banner (project / repo@sha / server / my sandbox). Optional later:
  `PR #n` when Binding + current branch already resolve to an open PR via existing source
  queries. No live deploy stream inside OpenCode.
- `workspace` is the first-class navigator for GitHub PR, Preview URL, production URL, and
  Deployment proof. All reads/writes stay on existing catalog: Binding, source-events,
  Spec 046 preview, `deployments.*`, route/domain queries, Spec 128 delivery palette.
- After remote develop, deploy is `appaloft deploy` / Agent skill / `workspace` `d` — same
  `deployments.create`. Preview vs production domain is existing access readback.

Do not parse Pi/OpenCode output to discover PRs. Do not copy host `gh` state as product truth.

## Open Questions (do not block first Spec)

- Exact flag name for leftover Scratch (`--local` vs `code local`). Cosmetic.
- Whether first-time personal model login is in-TUI OpenCode `/connect` only, or Appaloft also wraps token paste. Prefer vendor TUI.
- Cloud-only: whether entitled managed capacity appears as the default Server when no BYOS Server exists. Must not silently become this Mac.

## Non-Goals For The Next Spec

- Reopening R1–R6.
- Deleting Scratch implementation; only demote it from the default door.
- Sharing personal OAuth as a product feature.
- New Chat UI or vendor TUI parser.
- Making durable SHA Workspace the `code` default.
