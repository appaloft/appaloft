# ADR-116: Instant Local Scratch Session Boundary

Status: Accepted

Date: 2026-08-15

## Context

ADR-107 made `appaloft code` CLI presentation over `workspaces.open`. ADR-103 made local Git
preflight fail closed before that operation. ADR-109 / Spec 131 then made a signed-in entitled
Cloud user take `managed/platform-default` and lazily create Binding / default Profile.

That contract is correct for a durable remote Workspace. It is the wrong default for a command
named `code`. Directory-first agents (OpenCode, Pi, Claude Code, Codex) open the current folder
without Git, login, Binding or Cloud. Machine-first workspaces (Codespaces, Gitpod, Daytona) create
a remote filesystem from a known ref. Appaloft currently binds a Class A verb to a Class B
operation.

R1.1 remains historically complete. This decision revises the default entry only.

## Decision

1. Default `appaloft code [path]` opens a **Scratch session** on this Mac. Path defaults to `.`.
   Empty, dirty, detached, unpushed, non-git, logged-out and Binding-less directories are valid.
2. A Scratch session is public CLI presentation plus a local runtime coordination record. It is
   not a Sandbox, Deployment, DevelopmentSession, Server, Host, Machine, Cloud Workspace or
   operation-catalog entry. There is no `code.open`.
3. Scratch creates no Sandbox, Repository Binding, Project, Profile installation, Server or Cloud
   row. Implicit target is this Mac. `appaloft server enroll --local` remains the explicit
   `local-trusted` Server.
4. Durable Agent Workspace remains `workspaces.open`. `appaloft workspace open` and
   `workspace create` keep ADR-103 Git fail-closed: dirty, detached, missing upstream and remote
   tip mismatch fail before mutation. V1 never uploads or synchronizes local changes.
5. Logged-in + entitled users still get scratch from default `code`. Managed / remote activation
   is an explicit upgrade: `appaloft workspace open`, or an in-session request to open a remote
   Workspace. Missing managed capacity still fail-closes on that upgrade path and never silently
   becomes this Mac.
6. Default harness resolution is OpenCode if present, else Pi, else an install prompt. Claude Code
   and Codex are later explicit `--profile` or user-requested upgrades. Resolution rules may be
   named `appaloft-local` and `appaloft-remote` in docs and code; they are not persisted Profile
   installations on first scratch.
7. Scratch injects the existing public Appaloft skill and, when the harness supports it, Appaloft
   MCP. Mutations use the public operation catalog with scoped human approval. Appaloft does not
   parse vendor TUI text or add a Chat UI.
8. Remote upgrade requires commit/push of the exact SHA, or an explicit empty-remote choice. Same
   agent reconnect to a durable Workspace is a later slice and must not invent a fake
   `workspaceId`.

## Consequences

- Time-to-agent is the default door; time-to-Sandbox is an upgrade.
- Community works logged out with the local default only.
- Cloud injects entitlement, managed template and placement only on the upgrade path.
- ADR-107's “no new operation” stands. Only the default presentation target changes.
- Users who relied on R1.1 auto-managed `appaloft code` must use `workspace open` or an explicit
  upgrade. That is a documented public minor behavior change, not a silent major.

## Rejected Alternatives

- Keep `code` == `workspaces.open` and only smooth managed onboarding.
- New Host / Machine aggregate.
- New `code.open` catalog operation.
- Silent dirty-tree upload or implicit git sync.
- Silent managed → BYOS/local fallback.
- Persist default Profiles on first scratch.
- Default Claude Code / Codex.
- First-run Binding / Profile / Server wizard.
- Localhost Sandbox as the default `code` path.

## Verification

See [Instant Local Scratch](../specs/138-instant-local-scratch/spec.md) and the
[Instant Local Scratch Test Matrix](../testing/instant-local-scratch-test-matrix.md).
