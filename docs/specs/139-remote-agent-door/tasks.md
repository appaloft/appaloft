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

## Later

- [ ] Interactive `workspace` TUI as Railway `ca` navigator
- [ ] Team Connection
- [ ] Cloud managed as default Server
- [ ] Session-native PR chrome
