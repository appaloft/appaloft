# Remote Agent Door — Plan

## Governing Sources

- [spec.md](./spec.md)
- [ADR-118](../../decisions/ADR-118-remote-code-occupancy.md)
- [ADR-117](../../decisions/ADR-117-remote-agent-door.md) (login / Server / `--local`)
- [ADR-116](../../decisions/ADR-116-instant-local-scratch-session-boundary.md) (Scratch only)
- [workspaces.open](../../commands/workspaces.open.md)
- Spec 125 / 131 / 138 remain historical; default door is this spec

## Ownership

| Piece | Owner |
| --- | --- |
| Default `code` resolver | public CLI adapter |
| Remote SHA + Binding lookup | existing public queries |
| Occupancy create/resume | `workspaces.open` |
| `targetServerId` | public command input + placement port |
| Invisible `appaloft-remote` | Community activation initializer |
| Scratch | `code --local` only |
| Cloud default Server | later Cloud ticket; must honor `targetServerId` |

## Architecture

Do not add a new command family.

```text
appaloft code [path|git-remote]
  if --local and locator is git-remote -> workspace_scratch_remote_rejected
  if --local -> Spec 138 scratch
  if not logged in -> workspace_remote_login_required
  if no default Server -> workspace_remote_server_missing
  if locator is git-remote -> normalize HTTPS; ls-remote HEAD; never read cwd origin
  else resolve cwd origin (existing); missing origin may resume latest occupancy
  OpenAgentWorkspaceCommand {
    repository, identity, ref, branch, commitSha,
    targetServerId
  }
  occupy my Sandbox
  print Remote banner with workspaceId
  attach unless --no-attach
```

A positional git remote is classified before path resolution: `https://`,
`ssh://`, or `git@host:path`. `owner/repo` is a path.

Laptop path is unused for default `code` occupancy truth. `--profile` / `--new`
stay durable-open flags on the remote door and do **not** trigger Git fail-closed.

`workspace open` keeps the current local-Git preflight and does not require
`targetServerId`.

Community composition registers `WorkspaceActivationContextInitializerPort`.
When Binding or default Profile is missing it creates/reuses Project, Binding,
and `appaloft-remote` Adapter+Profile with no required model credential.

Placement: if `targetServerId` is set, reserve that Server only.

## Tests

Matrix `docs/testing/remote-agent-door-test-matrix.md`.

Slice-3 verification:

- unit: classify `https://` / `ssh://` / `git@` as remotes; `org/repo` as path;
- unit: `--local` + remote → `workspace_scratch_remote_rejected`;
- unit: URL of B does not resume occupancy of A;
- unit: HEAD → one `refs/heads/*`; zero/many fail closed;
- `appaloftdev code https://github.com/org/repo.git --no-attach` after login +
  enrolled Server lists a Sandbox for that identity.

## Risks

- Reusing `workspaces.open` still requires a SHA. Must come from remote
  `ls-remote`, not `HEAD` of a dirty laptop.
- Preference key already includes subject; do not add Server in this slice.
- Cloud managed-default must not override `targetServerId`.
- Do not implement `workspace` `ca`, destination discovery, or Preview here.

