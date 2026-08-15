# ADR-118: Remote Code Occupancy

Status: Accepted

Date: 2026-08-15

## Context

ADR-117 made default `appaloft code` a remote **identity** door: login + default
enrolled Server + Remote banner, then native-attach OpenCode/Pi on this laptop.
Durable occupancy stayed on `appaloft workspace open`.

That first slice is shipped (`4f237698`). Owner review against the long-running
login → code → workspace goal rejected identity-only as shippable Railway-like
behavior: the banner says `my sandbox` but no Sandbox exists, teammates cannot
isolate disks, and reconnect cannot wake the same occupancy.

`workspaces.open` already create-or-resumes `workspaceId = sandboxId` with
preference key tenant + subject + Project + Repository Identity + branch. It
does not accept a Server id. Cloud placement may choose managed capacity when
no saved policy exists, even if the CLI door already selected a BYOS Server.
Community composition has no activation initializer, so missing Binding or
default Profile fail closed.

Laptop Git fail-closed on `workspace open` remains correct. Default `code`
must not use laptop HEAD as Workspace truth.

## Decision

1. Default `appaloft code` occupies **my Sandbox**. After the ADR-117 door
   resolves login, default Server, Binding (optional), and remote SHA, the CLI
   dispatches existing `workspaces.open` with that remote SHA. It does not
   launch this-laptop Scratch. `--local` remains Scratch.
2. `workspaces.open` gains an optional `targetServerId`. When present, placement
   must reserve that tenant-visible Server and must not substitute managed
   capacity or another Server. When absent, existing R1.1 / ADR-109 target
   policy is unchanged (`workspace open` stays managed-default when entitled).
3. Preference key stays tenant + subject + Project + Repository Identity +
   branch. Subject already isolates disks. Do not add Server to the unique
   preferred index in this slice. Resume returns the preferred Sandbox even if
   it already lives on another Server; `--new` creates a distinct occupancy.
4. Community composition registers a public activation initializer that, only
   when Binding or Project default Profile is missing, creates or reuses a
   Project, Binding, and invisible `appaloft-remote` Adapter + Profile
   (OpenCode if the template supports it, else Pi). The Profile has no required
   model credential; `model-api` is optional so a later Connection can bind
   without replacing the Adapter. Unbound occupancy still starts vendor-login.
   Personal vendor login stays inside the Sandbox.
5. Laptop Git fail-closed remains only on explicit `workspace open` /
   `workspace create`. Default `code` continues to resolve the remote SHA with
   `ls-remote` and never uploads the laptop tree.
6. The Remote banner is printed only after `workspaces.open` succeeds, and
   includes the real `workspaceId`. `--no-attach` still occupies; it does not
   attach. Missing login, Server, remote repository, capacity, or refused
   Agent install fail closed and never become Scratch.
7. `appaloft workspace` as Railway `ca`, team Connection, and Cloud managed as
   the default Server when no BYOS exists remain later slices.

## Consequences

- ADR-117 decision 1 and 6 are superseded for occupancy: the door may no
  longer resolve identity without calling `workspaces.open`.
- Spec 139 first-slice tests that assert default `code` does not dispatch
  `workspaces.open` must flip to occupancy.
- Cloud may keep managed-default for bare `workspace open`. `code` must pass
  the door’s Server as `targetServerId`.
- Expected public SemVer: minor. Catalog/SDK/CLI input gains one optional field.

## Rejected Alternatives

- Keep identity-only `code` and tell users to run `workspace open`.
- Add Server to the preferred unique key in the same ticket as occupancy.
- Silent dirty-laptop upload as remote truth.
- Sharing host OpenCode/Codex OAuth.
- Implementing `workspace` `ca` in the same ticket.
- Letting Cloud managed placement override the Server the door already chose.
