# Remote Agent Door — Grill / Discovery

## Status

- Round: Spec. Slice 1–32 shipped. Slice 33 occupancy commit prefill owner-confirmed 2026-08-16 (D106–D108).
- Date: 2026-08-16.
- Predecessor: occupancy delivery prefills shipped as public #1216.
- Code changes allowed: yes for slice 33 after the occupancy-commit-prefill ticket is `ready-for-agent`.
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
| D25 | Slice 6 occupancy tree exposes activation `projectId` | Live `workspace --json` lists repo@sha but Agent still cannot deploy without guessing `prj_*` |
| D26 | Reuse `sandboxes.list` `activation.project.projectId`; no new catalog field | `workspace list` already returns it |
| D27 | Do not invent Resource / Environment / Destination on the tree | Occupancy is not a Resource; first-deploy still uses existing `deploy` / `resources.create` |
| D28 | Slice 7 `deployments.plan` omitted project/env resolve from Resource | Live plan still required four ids after occupancy projectId shipped |
| D29 | Server stays required | Resource does not own a Server; occupancy Server is a later default |
| D30 | `deployments.create` input stays explicit | Plan is the Railway inspect door; create remains fail-closed on omitted ids |
| D31 | Slice 8 occupancy activation ensures one Environment named `local` | Hello-World occupancy created Project/Binding only; `env list` is empty so deploy cannot start |
| D32 | Reuse existing Environment named `local`; create only when missing | `environments.create` conflicts; do not treat conflict as success |
| D33 | Do not add Environment to activation evidence this slice | Tree still exposes projectId only; Resource remains a later deploy step |
| D34 | Slice 9 occupancy ensures Resource slug `app` on Environment `local` | Hello-World now has `env_ky8ro1a8cy5l` but `resource list` is empty |
| D35 | Reuse existing Resource `app`; create only when missing | `resources.create` slug-conflicts; do not treat conflict as success |
| D36 | Created Resource source is `remote-git` of the occupancy repo; no network/runtime profile | Slice 9 shipped; `internalPort` is now slice 10 |
| D37 | Slice 10 occupancy default network is product `internalPort 3000`, `http`, `reverse-proxy` | Live plan on `res_vhmyk4zutvnd` is blocked `missing-internal-port`. This is the documented Appaloft default, not repo detection. Hello-World has no Dockerfile or start command. |
| D38 | Missing network on existing Resource `app` is filled via `resources.configure-network`; existing network is reused | Do not overwrite a user-configured port. |
| D39 | Do not invent runtime/start this slice | Slice 10 shipped; planner lie is now slice 11 |
| D40 | Slice 11 remote-git / git-* auto method uses the same inspection as local sources | Live Hello-World create accepted a dockerfile plan with `detectedFiles: []`, then failed `open Dockerfile`. `autoDeploymentMethodFor` hardcodes `remoteGit -> dockerfile`. |
| D41 | Missing Dockerfile / start / static evidence fail-closed; do not invent Dockerfile | Plan and create must block before package. Existing explicit `runtime.strategy=dockerfile` still wins. |
| D42 | Do not invent Hello-World start or static publish this slice | Slice 11 shipped; README-only stays blocked |
| D43 | Slice 12 occupancy remote-git / git-* sources are inspectable | Live `appaloft/examples` occupy created Resource `app` but plan `detectedFiles: []`. `canBeEnrichedFromSourceInspection` excludes remote-git; detector only reads local paths. |
| D44 | Detector shallow-clones the remote, keeps remote kind, attaches inspection | Reuse existing `discoverLocalWorkspace`. Single deployable root may set `source.baseDirectory`. |
| D45 | Multiple deployable roots fail-closed on `source.baseDirectory` | `appaloft/examples` is a monorepo. Do not invent `hello/`. Preview of official hello requires explicit baseDirectory this slice. |
| D46 | Slice 13 occupancy tree exposes live Preview URL from existing `resources.list` | Live occupy+create of official hello succeeded (`dep_mh73nchmktot`). Container `/health` is 200. Generated host is 200 through Traefik. `resource list` already has `accessSummary.latestGeneratedAccessRoute`. `workspace --json` still has no URL. |
| D47 | Only occupancy Resource slug `app` with a succeeded generated route | Durable/production domain is later. Do not invent sslip. Do not scrape vendor TUI. |
| D48 | Missing or failed access stays omitted | Tree still prints servers and occupancies. List-resources failure does not fail the tree. Interactive TUI and `code` banner stay unchanged this slice. |
| D49 | Slice 14 `appaloft deploy <git-remote>` reuses occupancy Resource `app` | Live `deploy https://github.com/appaloft/examples.git` after occupy+create still prompts for Deployment method. Occupancy already has Project / Environment `local` / Resource `app` / default Server. |
| D50 | Reuse Binding + Environment `local` + Resource slug `app` + default Server; call existing `deployments.create` | Do not create a second Resource. Do not invent method/Dockerfile. Destination still omitted so plan/create resolve Server `default`. |
| D51 | Missing occupancy Resource: interactive stays on the existing prompt path; non-interactive fail-closed | Do not invent Resource/`app`. No Binding or no `app` is not a silent create. |
| D52 | Slice 15 occupancy network uses a single Dockerfile `EXPOSE` when present | Live `code` + `deploy` of `traefik/whoami` created `dep_19e01i9s0nkp` and failed `docker_health_check_failed` on published 3000. Dockerfile is `EXPOSE 80`. Occupancy still writes `internalPort 3000`. |
| D53 | No `EXPOSE` or more than one distinct `EXPOSE` keeps 3000 | Do not invent 80. Do not pick the first of many. |
| D54 | Existing non-3000 network is reused; occupancy-default 3000 may be replaced by a single `EXPOSE` | User-configured ports stay. The slice-10 default is not a user choice. |
| D55 | Slice 16 `owner/repo` is a GitHub HTTPS locator | Live `code traefik/whoami` after occupying `examples` resumed examples. WS-REMOTE-URL-SHORTHAND-028 currently treats `org/repo` as a local path. Railway/GitHub users type `owner/repo`. |
| D56 | Expand only `owner/repo` to `https://github.com/owner/repo.git` | Same `ls-remote` HEAD contract as HTTPS. No `/tree/` parsing. No GitLab/Bitbucket host inference. |
| D57 | Existing local path `owner/repo` still wins if that directory exists | Do not steal a real relative directory named `org/repo`. |
| D58 | Slice 17 bare `appaloft deploy` reuses the latest occupancy Resource `app` | Live `code traefik/whoami` then `deploy` fails `pathOrSource is required`. Railway `up` after the workspace exists does not ask for a path. |
| D59 | Latest non-terminal occupancy wins; same Binding → `local` → `app` → default Server path as slice 14 | Do not invent a Resource. Destination stays omitted. |
| D60 | No occupancy / no Resource `app` fail-closed when non-interactive | Interactive prompt path unchanged. Do not fall back to cwd `.`. |
| D61 | Slice 18 successful occupancy `deploy` prints the generated access URL | Live `appaloft deploy` after occupying whoami returns only `{"id":"dep_*"}`. `deployments.show` and `workspace --json` already have `http://app-sc156jw98k.127.0.0.1.sslip.io`. Railway `up` prints the URL. |
| D62 | URL comes from existing `publicPreviewUrlsFromDeploymentSummary` after sync create | Same generated route as slice 13. Do not invent sslip. Do not scrape vendor TUI. First URL only. |
| D63 | Missing or failed route still prints `dep_*` and exits 0 | `--require-preview-url` stays the hard gate. Do not fail a succeeded deploy because chrome is missing. |
| D64 | Slice 19 `code` banner appends occupancy Preview URL when Resource `app` already has succeeded generated access | Live `code --no-attach` after deploy still prints only `Remote · project · repo@sha · server · my sandbox`. `workspace --json` already has `preview.url`. Railway `ca` / session chrome shows the URL without a second command. |
| D65 | URL is the same generated access as slice 13 / 18 | Copy from occupancy Resource `app` `accessSummary.latestGeneratedAccessRoute`. Do not invent sslip. Do not scrape vendor TUI. One banner line. |
| D66 | Missing generated URL keeps the existing banner | Do not fail occupy. Interactive TUI / PR number stay later. |
| D67 | Slice 20 occupancy tree copies Resource `app` last deployment id/status | Live `workspace --json` has `preview.url` but no `dep_*`. Agent still guesses the latest create. `resource list` already has `lastDeploymentId` / `lastDeploymentStatus`. |
| D68 | Copy only those two fields from occupancy Resource `app` | Same list already used for Preview URL. Do not invent a deployment. Do not add a live stream. |
| D69 | Missing last deployment stays omitted | Tree still prints servers and occupancies. Interactive TUI / PR number stay later. |
| D70 | Slice 21 default occupancy tree omits `terminated` and `failed` Sandboxes | Live `workspace --json` lists ~25 rows; most are `terminated` leftovers. Railway `ca` shows current workspaces. |
| D71 | Keep `ready`, `provisioning`, and other non-terminal statuses | Do not hide a Sandbox that can still be attached. `code` resume still uses `selectResumeOccupancy`. |
| D72 | No new flag this slice | `workspace list` remains the full catalog. Interactive TUI / PR chrome stay later. |
| D73 | Slice 22 top-level `--help` names `login` / `code` / `workspace` / `deploy` | Live `appaloftdev --help` still lists `workspace open` and `deploy <path>` as the door. Railway users type `login` then `code` then `up`. |
| D74 | Keep durable `workspace open` / `workspace create` as later lines | Do not delete the Git-safe delivery door. Do not invent a wizard. |
| D75 | `deploy` help line is optional locator | Bare `deploy` already reuses occupancy. Required `<path>` is a lie. |
| D76 | Slice 23 TUI workspace list shows occupancy repo@sha when present | Live TTY `workspace` still paints `sbx_*`. Railway `ca` names the current repo. `workspace --json` already has occupancy identity. |
| D77 | TUI list omits `terminated` / `failed` leftovers | Same D70 policy. `workspace list` stays the full catalog. |
| D78 | Preview URL / last deploy / PR number stay out of this TUI list | JSON tree already has preview + last deployment. Do not pull Resource list into the TUI protocol this slice. |
| D79 | Slice 24 TUI detail copies occupancy Preview URL and last deployment | Live TUI detail still paints Recovery / `sbx_*`. JSON tree already has `preview.url` and `deployment`. Railway `ca` shows the current URL. |
| D80 | Missing preview or last deployment stays omitted | Do not invent sslip or `dep_*`. Resource list failure stays lean. |
| D81 | PR number stays out; list stays identity-only | Same D78. `d` delivery palette already exists. Do not add a new command. |
| D82 | Slice 25 TUI detail copies open PR from existing `preview-environments.list` | Delivery chrome already said `workspace` is the PR navigator. Do not scrape `gh` or vendor TUI. |
| D83 | Match occupancy repo + branch/headSha; missing PR stays omitted | Do not invent `#n`. Multiple matches take the newest listed item. |
| D84 | No PR create/update this slice; `code` banner stays unchanged | Session-native PR in OpenCode stays later. List stays identity-only. |
| D85 | Slice 26 TUI detail copies Resource `app` `latestDurableDomainRoute` as Production | Delivery chrome already said `workspace` navigates production URL. Railway `ca` shows the live domain. |
| D86 | Missing durable domain stays omitted | Do not promote sslip / generated preview to Production. |
| D87 | Preview stays generated access; Production stays durable domain | No new command. List stays identity-only. |
| D88 | Slice 27 `code` banner appends `PR #n` from the same preview-environment matcher | Live `code --no-attach` still has Preview URL only. Cmux / Railway session chrome names the current PR. |
| D89 | Missing or foreign PR stays omitted | Same D83. Do not scrape `gh` or vendor TUI. |
| D90 | One banner line; no PR create | Session-native OpenCode PR chrome and create-PR navigator stay later. |
| D91 | Slice 28 occupancy PR chrome includes a GitHub URL | Live TUI / banner only say `PR #n`. Railway `ca` opens the PR. Compose `https://github.com/{owner}/{repo}/pull/{n}` from occupancy identity + preview-environment number. |
| D92 | Non-GitHub occupancy stays number-only | Do not invent gitlab/self-hosted hosts this slice. Missing URL stays omitted. |
| D93 | No browser launch / create-PR this slice | Print the URL in TUI detail. Banner stays one line with `PR #n`. Open-in-browser stays later. |
| D94 | Slice 29 TUI `o` opens the selected occupancy GitHub PR URL | Railway `ca` opens the current PR. URL already exists on detail. Reuse login `open` / `xdg-open`. |
| D95 | Only `https://github.com/{owner}/{repo}/pull/{n}` | Reject missing URL, non-https, non-github, or URL that does not match occupancy chrome. No create-PR. |
| D96 | CI / `APPALOFT_CLI_OPEN_BROWSER=false` prints the URL and does not spawn | Same login fail-soft. Footer names `o open PR`. |
| D97 | Slice 30 TUI `p` opens Preview URL; `P` opens Production URL | Railway `ca` opens the current URL. Same `openUrl` as `o`. Create-PR stays later. |
| D98 | Only the selected occupancy chrome URL | Reject missing URL or URL that is not the selected Preview/Production. No invented sslip. |
| D99 | Same CI / `APPALOFT_CLI_OPEN_BROWSER=false` fail-soft as `o` | Footer names `p preview` / `P production`. |
| D100 | Slice 31 TUI `c` opens GitHub compare for occupancy branch | Railway `ca` create-PR starts from the current branch. No GitHub write. Existing `o` still opens an already-open PR. |
| D101 | Only `https://github.com/{owner}/{repo}/compare/{branch}?expand=1` | Reject missing branch, non-github occupancy, or URL that is not that compare form. If occupancy already has a GitHub PR URL, `c` opens that pull URL instead. |
| D102 | Same CI / `APPALOFT_CLI_OPEN_BROWSER=false` fail-soft as `o` | Footer names `c compare`. Catalog `task deliver --pull-request-*` stays the write path. |
| D103 | Slice 32 TUI `d` Deliver Task prefills occupancy branch | Railway `ca` starts from the current branch. Remote stays `origin`. No auto-submit. |
| D104 | Missing occupancy PR also prefills PR title from occupancy branch | Existing PR leaves title/body/base empty so deliver does not invent a second PR. |
| D105 | Missing occupancy / empty branch stays blank | No invented `feat/...`. Catalog `task deliver --pull-request-*` stays the write path. |
| D106 | Slice 33 TUI Deliver Task prefills commit from occupancy short SHA | Railway `ca` starts from current work. Message is `Deliver occupancy <shortSha>`. No auto-submit. |
| D107 | Short SHA is the first 7 hex chars of occupancy commitSha | Missing / non-hex / shorter-than-7 SHA stays blank. Do not invent a commit. |
| D108 | Existing occupancy PR still leaves PR fields blank | Branch + commit still prefill. Catalog `task deliver --pull-request-*` stays the write path. |

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
5. `workspace` occupancy tree (slice 5, shipped #1162).
6. Occupancy `projectId` (slice 6, shipped #1164).
7. Plan resource context (slice 7, shipped #1166).
8. Occupancy default Environment (slice 8, shipped #1168).
9. Occupancy default Resource (slice 9, shipped #1170).
10. Occupancy default network (slice 10, shipped #1172).
11. Remote-git planner evidence (slice 11, shipped #1174).
12. Remote-git inspection (slice 12, shipped #1176).
13. Occupancy Preview URL (slice 13, shipped #1178).
14. Occupancy deploy reuse (slice 14, shipped #1180).
15. Occupancy EXPOSE port (slice 15, shipped #1182).
16. GitHub `owner/repo` (slice 16, shipped #1184).
17. Bare occupancy deploy (slice 17, shipped #1186).
18. Occupancy deploy URL (slice 18, shipped #1188).
19. Occupancy banner Preview URL (slice 19, shipped #1190).
20. Occupancy last deployment (slice 20, shipped #1192).
21. Occupancy tree filter (slice 21, shipped #1194).
22. Occupancy help door (slice 22, shipped #1196).
23. Occupancy TUI identity (slice 23, shipped #1198).
24. Occupancy TUI chrome (slice 24, shipped #1200).
25. Occupancy TUI PR chrome (slice 25, shipped #1202).
26. Occupancy TUI production chrome (slice 26, shipped #1204).
27. Occupancy banner PR chrome (slice 27, shipped #1206).
28. Occupancy PR URL chrome (slice 28, shipped #1208).
29. Occupancy open-PR door (slice 29, shipped #1210).
30. Occupancy open-preview door (slice 30, shipped #1212).
31. Occupancy compare-PR door (slice 31, shipped #1214).
32. Occupancy delivery prefills (slice 32, shipped #1216).
33. **Occupancy commit prefill** (slice 33): TUI Deliver Task prefills occupancy commit message.
34. Interactive `workspace` TUI as Railway `ca` navigator (catalog create-PR write).
35. Optional team Connection.
36. Cloud managed as default Server when no BYOS exists.

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
