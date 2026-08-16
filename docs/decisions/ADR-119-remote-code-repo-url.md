# ADR-119: Remote Code Repo-URL Locator

Status: Accepted

Date: 2026-08-16

## Context

ADR-118 made default `appaloft code` occupy my Sandbox from a remote SHA.
The door still discovers that remote from the laptop worktree (`git remote
origin` + `ls-remote`). Empty, non-git, and no-origin directories fail
`workspace_remote_repository_missing` unless a resumable occupancy already
exists — and that resume may pick the latest occupancy of a *different*
repository.

Codespaces (`gh codespace create -r OWNER/REPO`) and Gitpod
(`gitpod.io/#<repo-url>`) open from a repo URL with no local clone.
`workspaces.open` already accepts a credential-free HTTPS locator. The gap
is only the `code` presentation locator.

Owner Grill 2026-08-16 (Cloud
`docs/specs/063-remote-agent-door/next-door-discovery.md` D9–D15) kept
occupancy as the default door and chose repo-URL occupancy as the next
slice. Scratch stays `--local`. Empty/logged-out stays fail-closed.

## Decision

1. The `code` positional argument is a **locator**, not always a path.
   Values that parse as a git remote (`https://`, `ssh://`, `git@host:path`)
   are remotes. Everything else remains a local path used only to discover
   `origin`. The laptop tree is still never uploaded.
2. A remote locator occupies that `repositoryIdentity`. Resume matches only
   the same identity. The latest occupancy of another repository is not
   used. `--new` still creates a distinct occupancy of the requested repo.
3. When the URL has no branch, resolve the remote default branch with
   `ls-remote` `HEAD` to exactly one `refs/heads/*`. Zero or many heads
   fail closed. This slice does not parse GitHub `/tree/<branch>` URLs or
   `owner/repo` shorthand.
4. `--local` plus a remote locator fail closed. Scratch is this-Mac only.
5. Login, default Server, `targetServerId`, Binding initializer, no-capacity
   fail-closed, and `workspace open` Git fail-closed are unchanged.
6. No new catalog operation. CLI normalizes the remote to credential-free
   HTTPS, then dispatches existing `workspaces.open`.

## Consequences

- Spec 139 WS-REMOTE-RESUME-004 / WS-REMOTE-NO-UPLOAD-006 must distinguish
  cwd-origin discovery from an explicit remote locator.
- Help, skill `cli-entrypoints.md`, and `agent.scratch` / workspace docs
  must name `appaloft code <git-remote-url>`.
- Expected public SemVer: minor presentation change. No catalog field.

## Rejected Alternatives

- `--repo` as the only URL door.
- Hard-coded `main`.
- Resume latest occupancy when the URL names another repository.
- GitHub `owner/repo` shorthand as a default host.
- Flipping the default door back to Scratch.
- Uploading a dirty laptop tree because no clone exists.
