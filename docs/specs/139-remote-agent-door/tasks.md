# Remote Agent Door — Tasks

## Slice 1 (shipped)

- [x] Grill discovery
- [x] ADR-117
- [x] spec / plan / matrix
- [x] Ticket after owner ack of this spec — owner goal authorized Code
- [x] Default `code` requires login
- [x] Default Server + Binding + remote SHA identity door
- [x] `--local` keeps Scratch
- [x] `workspace open` Git fail-closed unchanged
- [x] Help / skill / changelog
- [x] Move Spec 138 default-code tests to `--local`
- [x] `appaloftdev code --help` and fail-closed smoke

## Slice 2 — occupancy

- [x] ADR-118
- [x] Ticket `ready-for-agent` — [#1128](https://github.com/appaloft/appaloft/issues/1128)
- [x] Optional `targetServerId` on `workspaces.open`
- [x] Community initializer for missing Binding / default Profile
- [x] Default `code` dispatches `workspaces.open` after remote SHA
- [x] Banner includes real `workspaceId`
- [x] `--no-attach` occupies
- [x] Two subjects do not share a preferred Sandbox
- [x] Help / skill / changelog
- [x] `appaloftdev code --no-attach` then `sandbox list`

## Slice 3 — repo-URL locator

- [x] Grill D9–D15 / ADR-119
- [x] Ticket `ready-for-agent` — tracking [#1153](https://github.com/appaloft/appaloft/issues/1153), slice [#1154](https://github.com/appaloft/appaloft/issues/1154)
- [x] Classify positional git remotes before path resolution
- [x] `ls-remote` HEAD → one `refs/heads/*`
- [x] URL of B never resumes occupancy of A
- [x] `--local` + remote fail closed
- [x] Help / skill / changelog
- [x] `appaloftdev code https://github.com/org/repo.git --no-attach`



## Slice 4 — plan default destination

- [x] Grill D16–D21 / ADR-120
- [x] Ticket `ready-for-agent` — [#1157](https://github.com/appaloft/appaloft/issues/1157)
- [x] `DeploymentContextResolver` read-only default Destination
- [x] Unit tests WS-REMOTE-DEST-030–032
- [x] `appaloftdev deployments plan` without `--destination`
- [x] Help / changelog if user-visible plan contract changes — query spec only; no CLI flag change

## Slice 5 — workspace occupancy tree

- [x] Grill D22–D24
- [x] Ticket `ready-for-agent` — [#1161](https://github.com/appaloft/appaloft/issues/1161)
- [x] Headless `workspace --json` / `--no-tui` occupancy tree
- [x] Unit tests WS-REMOTE-CA-033–035
- [x] `appaloftdev workspace --json` shows occupancy-mac + ready sandboxes

## Slice 6 — occupancy projectId

- [x] Grill D25–D27
- [x] Ticket `ready-for-agent` — [#1163](https://github.com/appaloft/appaloft/issues/1163)
- [x] Headless occupancy tree includes activation `projectId`
- [x] Unit tests WS-REMOTE-CA-036–037
- [x] `appaloftdev workspace --json` shows occupancy project ids

## Slice 7 — plan resource context

- [x] Grill D28–D30
- [x] Ticket `ready-for-agent` — [#1165](https://github.com/appaloft/appaloft/issues/1165)
- [x] `deployments.plan` omitted project/env resolve from Resource
- [x] Unit tests WS-REMOTE-CTX-038–039
- [x] `appaloftdev deployments plan --resource --server`

## Slice 8 — occupancy default Environment

- [x] Grill D31–D33
- [x] Ticket `ready-for-agent` — [#1167](https://github.com/appaloft/appaloft/issues/1167)
- [x] Occupancy activation ensures Environment `local`
- [x] Unit tests WS-REMOTE-ENV-040–041
- [x] `appaloftdev env list --project` after Hello-World occupy

## Slice 9 — occupancy default Resource

- [x] Grill D34–D36
- [x] Ticket `ready-for-agent` — [#1169](https://github.com/appaloft/appaloft/issues/1169)
- [x] Occupancy activation ensures Resource `app`
- [x] Unit tests WS-REMOTE-RES-042–043
- [x] `appaloftdev resource list --project` after Hello-World occupy


## Slice 10 — occupancy default network

- [x] Grill D37–D39
- [x] Ticket `ready-for-agent` — [#1171](https://github.com/appaloft/appaloft/issues/1171)
- [x] Occupancy activation ensures Resource `app` network `3000`
- [x] Unit tests WS-REMOTE-NET-044–045
- [x] `appaloftdev deployments plan --resource --server` after Hello-World occupy

## Slice 11 — remote-git planner evidence

- [x] Grill D40–D42
- [x] Ticket `ready-for-agent` — [#1173](https://github.com/appaloft/appaloft/issues/1173)
- [x] Remote-git auto method uses inspection
- [x] Unit tests WS-REMOTE-PLAN-046–047
- [x] `appaloftdev deployments plan --resource --server` after Hello-World occupy

## Slice 12 — remote-git inspection

- [x] Grill D43–D45
- [x] Ticket `ready-for-agent` — [#1175](https://github.com/appaloft/appaloft/issues/1175)
- [x] Remote-git sources are inspectable
- [x] Unit tests WS-REMOTE-INSPECT-048–049
- [x] `appaloftdev deployments plan` after occupying `appaloft/examples`

## Slice 13 — occupancy Preview URL

- [x] Grill D46–D48
- [x] Ticket `ready-for-agent` — [#1177](https://github.com/appaloft/appaloft/issues/1177)
- [x] Occupancy tree copies live generated access
- [x] Unit tests WS-REMOTE-PREVIEW-050–051
- [x] `appaloftdev workspace --json` after official hello create

## Slice 14 — occupancy deploy reuse

- [x] Grill D49–D51
- [x] Ticket `ready-for-agent` — [#1179](https://github.com/appaloft/appaloft/issues/1179)
- [x] `deploy <git-remote>` reuses occupancy Resource `app`
- [x] Unit tests WS-REMOTE-DEPLOY-052–053
- [x] `appaloftdev deploy https://github.com/appaloft/examples.git` after occupy

## Slice 15 — occupancy EXPOSE port

- [x] Grill D52–D54
- [x] Ticket `ready-for-agent` — [#1181](https://github.com/appaloft/appaloft/issues/1181)
- [x] Detector records a single Dockerfile EXPOSE
- [x] Occupancy Resource `app` uses that port
- [x] Unit tests WS-REMOTE-EXPOSE-054–055
- [x] `appaloftdev` occupy+plan of `traefik/whoami` is port 80

## Slice 16 — GitHub owner/repo

- [x] Grill D55–D57
- [x] Ticket `ready-for-agent` — [#1183](https://github.com/appaloft/appaloft/issues/1183)
- [x] `owner/repo` occupies GitHub HTTPS
- [x] Unit tests WS-REMOTE-URL-SHORTHAND-028/056
- [x] `appaloftdev code traefik/whoami --no-attach` after occupying examples

## Slice 17 — bare occupancy deploy

- [x] Grill D58–D60
- [x] Ticket `ready-for-agent` — [#1185](https://github.com/appaloft/appaloft/issues/1185)
- [x] Bare `deploy` reuses latest occupancy Resource `app`
- [x] Unit tests WS-REMOTE-DEPLOY-057–058
- [x] `appaloftdev deploy` after occupying `traefik/whoami`

## Slice 18 — occupancy deploy URL

- [x] Grill D61–D63
- [x] Ticket `ready-for-agent` — [#1187](https://github.com/appaloft/appaloft/issues/1187)
- [x] Successful occupancy `deploy` prints generated URL
- [x] Unit tests WS-REMOTE-DEPLOY-059–060
- [x] `appaloftdev deploy` after occupying `traefik/whoami` prints sslip URL

## Slice 19 — occupancy banner Preview URL

- [x] Grill D64–D66
- [x] Ticket `ready-for-agent` — [#1189](https://github.com/appaloft/appaloft/issues/1189)
- [x] Occupancy `code` banner includes generated URL
- [x] Unit tests WS-REMOTE-BANNER-061–062
- [x] `appaloftdev code --no-attach` after occupying+deploying `traefik/whoami` prints sslip URL

## Slice 20 — occupancy last deployment

- [x] Grill D67–D69
- [x] Ticket `ready-for-agent` — [#1191](https://github.com/appaloft/appaloft/issues/1191)
- [x] Occupancy tree copies last deployment id/status
- [x] Unit tests WS-REMOTE-DEPLOY-063–064
- [x] `appaloftdev workspace --json` after occupying+deploying `traefik/whoami` includes last deployment

## Slice 21 — occupancy tree filter

- [x] Grill D70–D72
- [x] Ticket `ready-for-agent` — [#1193](https://github.com/appaloft/appaloft/issues/1193)
- [x] Default occupancy tree omits terminated/failed
- [x] Unit tests WS-REMOTE-CA-065–066
- [x] `appaloftdev workspace --json` after occupying whoami omits terminated leftovers

## Slice 22 — occupancy help door

- [x] Grill D73–D75
- [x] Ticket `ready-for-agent` — [#1195](https://github.com/appaloft/appaloft/issues/1195)
- [x] Top-level `--help` names `code` / `workspace` / optional `deploy`
- [x] Unit tests WS-REMOTE-DOCS-067–068
- [x] `appaloftdev --help` lists occupancy doors

## Slice 23 — occupancy TUI identity

- [x] Grill D76–D78
- [x] Ticket `ready-for-agent` — [#1197](https://github.com/appaloft/appaloft/issues/1197)
- [x] TUI list copies occupancy and omits leftovers
- [x] Unit tests WS-REMOTE-CA-069–071
- [x] `appaloftdev workspace` list would show repo@sha

## Slice 24 — occupancy TUI chrome

- [x] Grill D79–D81
- [x] Ticket `ready-for-agent` — [#1199](https://github.com/appaloft/appaloft/issues/1199)
- [x] TUI detail copies Preview URL and last deployment
- [x] Unit tests WS-REMOTE-CA-072–074
- [x] `appaloftdev workspace` detail would show occupancy URL

## Slice 25 — occupancy TUI PR chrome

- [x] Grill D82–D84
- [x] Ticket `ready-for-agent` — [#1201](https://github.com/appaloft/appaloft/issues/1201)
- [x] TUI detail copies matching preview-environment PR
- [x] Unit tests WS-REMOTE-CA-075–077
- [x] `appaloftdev workspace` detail would show PR #n

## Slice 26 — occupancy TUI production chrome

- [x] Grill D85–D87
- [x] Ticket `ready-for-agent` — [#1203](https://github.com/appaloft/appaloft/issues/1203)
- [x] TUI detail copies durable-domain Production URL
- [x] Unit tests WS-REMOTE-CA-078–080
- [x] `appaloftdev workspace` detail would show Production

## Slice 27 — occupancy banner PR chrome

- [x] Grill D88–D90
- [x] Ticket `ready-for-agent` — [#1205](https://github.com/appaloft/appaloft/issues/1205)
- [x] `code` banner copies matching preview-environment PR
- [x] Unit tests WS-REMOTE-BANNER-081–083
- [x] `appaloftdev code --no-attach` would show PR #n

## Slice 28 — occupancy PR URL chrome

- [x] Grill D91–D93
- [x] Ticket `ready-for-agent` — [#1207](https://github.com/appaloft/appaloft/issues/1207)
- [x] TUI detail copies GitHub PR URL
- [x] Unit tests WS-REMOTE-CA-084–086
- [x] `appaloftdev workspace` detail would show github.com/.../pull/n

## Slice 29 — occupancy open-PR door

- [x] Grill D94–D96
- [x] Ticket `ready-for-agent` — [#1209](https://github.com/appaloft/appaloft/issues/1209)
- [x] TUI `o` opens selected GitHub PR URL
- [x] Unit tests WS-REMOTE-CA-087–089
- [x] `appaloftdev workspace` `o` would open github.com/.../pull/n

## Slice 30 — occupancy open-preview door

- [x] Grill D97–D99
- [x] Ticket `ready-for-agent` — [#1211](https://github.com/appaloft/appaloft/issues/1211)
- [x] TUI `p` / `P` open Preview / Production
- [x] Unit tests WS-REMOTE-CA-090–092
- [x] `appaloftdev workspace` `p` would open occupancy Preview

## Slice 31 — occupancy compare-PR door
- [x] Grill D100–D102
- [x] Ticket `ready-for-agent` — [#1213](https://github.com/appaloft/appaloft/issues/1213)
- [x] TUI `c` opens GitHub compare or existing PR
- [x] Unit tests WS-REMOTE-CA-093–095
- [x] `appaloftdev workspace` `c` would open github.com/.../compare/...

## Slice 32 — occupancy delivery prefills

- [x] Grill D103–D105
- [x] Ticket `ready-for-agent` — [#1215](https://github.com/appaloft/appaloft/issues/1215)
- [x] TUI Deliver Task prefills occupancy branch / PR title
- [x] Unit tests WS-REMOTE-CA-096–098
- [x] `appaloftdev workspace` `d` would open a prefilled Deliver Task form

## Slice 33 — occupancy commit prefill

- [x] Grill D106–D108
- [x] Ticket `ready-for-agent` — [#1217](https://github.com/appaloft/appaloft/issues/1217)
- [x] TUI Deliver Task prefills occupancy commit
- [x] Unit tests WS-REMOTE-CA-099–100
- [x] `appaloftdev workspace` `d` would show Deliver occupancy <shortSha>

## Slice 34 — occupancy banner compare

- [x] Grill D109–D111
- [x] Ticket `ready-for-agent` — [#1219](https://github.com/appaloft/appaloft/issues/1219)
- [x] `code` banner copies GitHub compare when no PR exists
- [x] Unit tests WS-REMOTE-BANNER-101–103
- [x] `appaloftdev code --no-attach` would show github.com/.../compare/...

## Slice 35 — occupancy banner wrap

- [x] Grill D112–D114
- [x] Ticket `ready-for-agent` — [#1221](https://github.com/appaloft/appaloft/issues/1221)
- [x] `code` banner wraps Preview / Compare / PR onto their own lines
- [x] Unit tests WS-REMOTE-BANNER-104–106
- [x] `appaloftdev code --no-attach` would print compare on its own line

## Slice 36 — occupancy code `--open`

- [x] Grill D115–D117
- [x] Ticket `ready-for-agent` — [#1223](https://github.com/appaloft/appaloft/issues/1223)
- [x] `code --open` opens Preview, else PR, else compare
- [x] Unit tests WS-REMOTE-OPEN-107–109
- [x] `appaloftdev code --no-attach --open` would open occupancy Preview

## Slice 37 — occupancy `--open-target`

- [x] Grill D118–D120
- [x] Ticket `ready-for-agent` — [#1225](https://github.com/appaloft/appaloft/issues/1225)
- [x] `code --open-target preview\|pr\|compare` opens that URL only
- [x] Unit tests WS-REMOTE-OPEN-110–112
- [x] `appaloftdev code --no-attach --open-target pr` would open occupancy PR

## Slice 38 — occupancy production open

- [x] Grill D121–D123
- [x] Ticket `ready-for-agent` — [#1227](https://github.com/appaloft/appaloft/issues/1227)
- [x] `code` banner / `--open-target production` copy Production
- [x] Unit tests WS-REMOTE-BANNER-113 / WS-REMOTE-OPEN-114–115
- [x] `appaloftdev code --no-attach --open-target production` would open Production

## Slice 39 — occupancy banner labels

- [x] Grill D124–D126
- [x] Ticket `ready-for-agent` — [#1229](https://github.com/appaloft/appaloft/issues/1229)
- [x] `code` banner labels Preview / Production / Compare
- [x] Unit tests WS-REMOTE-BANNER-116–118
- [x] `appaloftdev code --no-attach` would print Preview · / Production ·

## Slice 40 — occupancy door hint

- [x] Grill D127–D129
- [x] Ticket `ready-for-agent` — [#1231](https://github.com/appaloft/appaloft/issues/1231)
- [x] `code` names `--open-target` and `workspace` keys
- [x] Unit tests WS-REMOTE-HINT-119–121
- [x] `appaloftdev code --no-attach` would print `--open-target` / `workspace` keys

## Slice 41 - occupancy available-door hint

- [x] Grill D130-D132
- [x] Ticket `ready-for-agent` - [#1233](https://github.com/appaloft/appaloft/issues/1233)
- [x] `code` names only occupancy doors that exist
- [x] Unit tests WS-REMOTE-HINT-122-124
- [x] `appaloftdev code --no-attach` would omit missing `--open-target`s

## Slice 42 - occupancy TUI available-door footer

- [x] Grill D133-D135
- [x] Ticket `ready-for-agent` - [#1235](https://github.com/appaloft/appaloft/issues/1235)
- [x] `workspace` footer names only occupancy doors that exist
- [x] Unit tests WS-REMOTE-CA-125-127
- [x] `appaloftdev workspace` would omit missing occupancy keys

## Slice 43 - occupancy Cloud-compat error

- [x] Grill D136-D138
- [x] Ticket `ready-for-agent` - [#1237](https://github.com/appaloft/appaloft/issues/1237)
- [x] `code` names unstructured `targetServerId` rejection
- [x] Unit tests WS-REMOTE-COMPAT-128-130
- [x] `appaloftdev code --no-attach` would name the enrolled Server

## Slice 44 - occupancy resume keeps preferred Profile

- [x] Grill D139-D141
- [x] Ticket `ready-for-agent` - [#1239](https://github.com/appaloft/appaloft/issues/1239)
- [x] default `code` resumes my Sandbox when only the default Profile changed
- [x] Unit tests WS-REMOTE-RESUME-131-133
- [x] `appaloftdev code --no-attach` would resume the preferred Sandbox

## Slice 45 - leftover occupancy EXPOSE / git-on-control-plane

- [x] Grill D142-D148: do not reopen R7 default Scratch
- [ ] Ticket `ready-for-agent`
- [x] Leftover occupancy-default 3000 upgrades to a single remote Dockerfile EXPOSE
- [x] Unit tests WS-REMOTE-EXPOSE-054 leftover upgrade
- [ ] `appaloftdev code --no-attach` of `traefik/whoami` after leftover 3000 becomes port 80
- [x] Cloud web image keeps `git` in Dockerfile/readiness

## Later

- [ ] Interactive `workspace` TUI as Railway `ca` navigator
- [ ] Team Connection
- [ ] Cloud managed as default Server
- [ ] Session-native PR chrome
