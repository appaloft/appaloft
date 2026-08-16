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
- [ ] Classify positional git remotes before path resolution
- [ ] `ls-remote` HEAD → one `refs/heads/*`
- [ ] URL of B never resumes occupancy of A
- [ ] `--local` + remote fail closed
- [ ] Help / skill / changelog
- [ ] `appaloftdev code https://github.com/org/repo.git --no-attach`


## Later

- [ ] `appaloft workspace` as Railway `ca`
- [ ] Team Connection
- [ ] Cloud managed as default Server
- [ ] GitHub `owner/repo` shorthand
- [ ] Destination discovery / session-native Preview

