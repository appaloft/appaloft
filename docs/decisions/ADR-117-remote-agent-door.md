# ADR-117: Remote Agent Door

Status: Accepted

Date: 2026-08-15

## Context

ADR-116 made default `appaloft code` a this-Mac Scratch session. Owner review against
Railway `code` / `ca` and Appaloft’s BYOS occupancy rejected local-first as the product
default: it hides that work should live on the team Server.

Railway `code` requires login, then attaches a remote coding environment. Railway `ca`
manages those environments. Git is for deploy and PR preview, not for opening the Agent.

Appaloft Servers are shared. A person occupies a Sandbox on that Server, not the whole
machine. Personal model OAuth must stay inside that Sandbox.

## Decision

1. Default `appaloft code` is remote **identity**. The caller must be logged in.
   The target is the team’s default enrolled Server. First slice native-attaches
   OpenCode/Pi on this laptop after that identity is resolved. Durable
   occupancy (`workspaceId = sandboxId`) stays on `appaloft workspace open`.
2. Laptop Git is not uploaded and is not Workspace truth. Repository identity
   uses the existing Project Binding and a remote SHA when origin exists.
   `appaloft workspace open` keeps ADR-103 Git fail-closed for the explicit
   delivery path.
3. `appaloft workspace` (no subcommand / control TUI) is the Railway `ca` analogue.
   That management tree is a later slice. First slice only changes the `code` door.
4. OpenCode/Pi version and Profile config become Project-shared when the user
   upgrades to `workspace open`. First-slice `code` uses the laptop’s installed
   OpenCode, else Pi, else Oh My Pi.
5. Missing login or missing Server fail closed with guidance. They never become
   Scratch. Scratch remains explicit `appaloft code --local`.
6. No new aggregate. Reuse Server, Binding, and later Sandbox/Profile. The CLI
   may resolve the remote ref for identity/banner without calling `workspaces.open`.

## Consequences

- ADR-116 remains the Scratch contract. It no longer defines the default `code` door.
- Spec 138 tests that assert default `code` is Scratch must move to `--local`.
- Cloud may present entitled managed capacity as the default Server only when no BYOS
  Server exists. It still must not fall back to this Mac.

## Rejected Alternatives

- Keep Scratch as the default door.
- One VM per person.
- Shared host OpenCode/Codex OAuth.
- Dirty-laptop upload as remote truth.
- Shipping `code` and full `ca` in one ticket.
