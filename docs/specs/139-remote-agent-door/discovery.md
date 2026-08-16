# Remote Agent Door — Grill / Discovery

## Status

- Round: Spec. Slice 1–3 shipped. Slice 4 destination discovery owner-confirmed 2026-08-16 (D16–D21).
- Date: 2026-08-16.
- Predecessor: Spec 138 / ADR-116 Instant Local Scratch shipped as public #1125; ADR-117 identity door shipped as public #1127; ADR-118 occupancy shipped; ADR-119 repo-URL locator shipped as public #1156.
- Code changes allowed: yes for slice 4 after the destination ticket is `ready-for-agent`.

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
| D16 | `deployments.plan` omitted `destinationId` resolves the same server default Destination as the `deployments.create` compatibility seam | Occupancy plan 2026-08-16 died on `destinationId is required` while create already passed that gate |
| D17 | Plan stays read-only: resolve existing Destination; never create one | Spec 013 forbids plan mutation |
| D18 | Default name is `default` | Existing `DeploymentContextDefaultsFactory` / occupancy row `dst_di9i62yldejw` |
| D19 | Missing default Destination still fail-closed | No `destinations.list` / `servers.show` destinations field this slice |
| D20 | Missing `internalPort` is the next Railway-loop gap, not this slice | Occupancy create reached `Resource network profile internalPort is required` after destination |
| D21 | No new catalog operation | Reuse existing Destination + `deployments.plan` |
| D22 | Slice 5 `workspace` as `ca` first cut is a headless occupancy tree | Live `appaloft workspace --json` still prints `renderer-unavailable` while `workspace list` + `server list` already have the data |
| D23 | Headless `workspace --json` / `--no-tui` composes existing `servers.list` + `sandboxes.list` | No new catalog operation; no teammate disk contents |
| D24 | Interactive TUI stay unchanged this slice | Spec 128 delivery palette already ships; do not rebuild Ratatui to close the Railway loop |

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

## Slice 1 (shipped)

Logged-in user, team has an enrolled Server: `appaloft code` printed a Remote banner
and native-attached this-laptop OpenCode. No Sandbox. That is **not** Railway-like.

## Slice 2 (this ticket)

Logged-in user, team has an enrolled Server:

```text
appaloft login
appaloft code --no-attach
# Remote · <project> · <repo@sha> · <server> · my sandbox · sbx_…
# EXIT 0
appaloft sandbox list
# one Sandbox for this subject
```

Not logged in → login guidance, no Scratch.
No Server → enroll guidance, no Scratch.
No capacity on that Server → fail closed, no Scratch, no other Server, no managed substitution.

Later slices after occupancy:

1. Remote identity door (slice 1, shipped).
2. Occupancy (slice 2, shipped).
3. Repo-URL locator (slice 3, shipped #1156).
4. Destination discovery (slice 4, shipped #1158).
5. **`workspace` occupancy tree** (slice 5): headless `workspace --json` lists Servers + my Sandboxes.
6. Session-native Preview / remaining first-deploy chrome.
7. GitHub as source surface / `owner/repo` shorthand.
8. Optional team Connection.
9. Cloud managed as default Server when no BYOS exists.

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
