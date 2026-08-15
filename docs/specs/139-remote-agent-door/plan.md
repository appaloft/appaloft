# Remote Agent Door — Plan

## Governing Sources

- [spec.md](./spec.md)
- [ADR-117](../../decisions/ADR-117-remote-agent-door.md)
- [ADR-116](../../decisions/ADR-116-instant-local-scratch-session-boundary.md) (Scratch only)
- [workspaces.open](../../commands/workspaces.open.md)
- Spec 125 / 131 / 138 remain historical; default door is this spec

## Ownership

| Piece | Owner |
| --- | --- |
| Default `code` resolver | public CLI adapter |
| Remote SHA + Binding lookup | existing public queries; no new aggregate |
| Sandbox create/resume | `workspaces.open` |
| Scratch | `code --local` only |
| Cloud default Server | later Cloud ticket |

## Architecture

Do not add a new command family.

```text
appaloft code
  if --local -> Spec 138 scratch
  if not logged in -> workspace_remote_login_required
  if no default Server -> workspace_remote_server_missing
  if no Binding -> workspace_remote_binding_missing
  resolve Binding remote SHA (ls-remote / stored canonical commit)
  OpenAgentWorkspaceCommand { repository, identity, ref, branch, commitSha }
  attach my Sandbox on that Server
```

Laptop path is unused for default `code`. `--profile` / `--new` stay durable-open
flags on the remote door and do **not** trigger Git fail-closed.

`workspace open` keeps the current local-Git preflight.

## Tests

New matrix `docs/testing/remote-agent-door-test-matrix.md`.
Flip Spec 138 tests that assert default `code` is Scratch so they use `--local`.

First-slice verification: `appaloftdev code --help` plus unit/integration on the
resolver. Live enroll+attach is later when a Server is in the session.

## Risks

- Reusing `workspaces.open` still requires a SHA. Must come from remote Binding,
  not `HEAD` of a dirty laptop.
- Preference key must include subject so two people do not resume one Sandbox.
- Do not implement `workspace` `ca` in the same PR.
