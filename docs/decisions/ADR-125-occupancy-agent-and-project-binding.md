# ADR-125: Occupancy Agent Identity And Project Binding

Status: Accepted

Date: 2026-08-23

## Context

Owner review of live `appaloftdev code --codex` plus Railway Cloud Agents 5.43.1
(`railway code --codex`, `railway ca`) found three language errors:

1. Appaloft occupy names the Sandbox `repo@short-sha` (`appaloft-cloud@b2b06f5`).
   Two disks of the same commit collide. Railway's handle is a generated
   adjective-noun agent name (`supportive-balance`), unique for the life of
   that VM. [ADR-124](./ADR-124-sandbox-display-name.md) already rejected
   occupancy `owner/repo@sha` as a TUI title, then still used it as the
   create-time display name.
2. Banner leads with `prj_*`. Users cannot tell agent, Project, and git apart.
   Railway's user-facing object is the **Cloud Agent** (the VM). Codex/Grok
   is the coding agent *on* that VM. Disconnect ends the session; the agent
   remains (`railway ca sleep <name>` stops compute).
3. `repository_binding_project_conflict` treats a git remote as exclusive
   Project ownership. Railway hangs git on a **Service**, not the Project.
   Appaloft Resource is already that Service. Occupy then collapses
   origin → one Project → Resource slug `app`, so Project becomes a repo
   alias. [ADR-122](./ADR-122-railway-like-folder-onboarding.md) already
   says git is correspondence; folder link / `project use` switches Project.

Railway `ca` home is not `appaloft workspace`:

| Railway `ca` home | Appaloft today |
| --- | --- |
| Prompt + enter launches a task | missing; `code` attaches the vendor TUI |
| New Session on an existing agent | missing as a first-class door |
| New Cloud Agent in the target project | `code --new` |
| Manage Cloud Agents across projects | `appaloft workspace` (incomplete `ca` tree) |
| `^t` Target Project | origin / folder link infers Project |
| `shift+tab` coding agent | `--codex` / `--claude` / `--grok` |

`workspace` ≈ Railway **Manage Cloud Agents**. `code` ≈ `railway code`.
The `ca` home (prompt / new session / target project) is a later slice.

## Decision

1. User-facing occupancy object is an **Agent**. Storage identity remains
   `Sandbox` / `sandboxId` (`sbx_*`). CLI/TUI/help say `agent <display-name>`.
   They do not say Occupancy. JSON may still include `workspaceId`.
2. Agent display name is a unique generated kebab (`SandboxDisplayName.generate`)
   or an explicit `name`. Git `repo@short-sha` is metadata on the banner and
   occupancy record, not the handle. Folder directory names remain allowed
   for `folder.local` occupancy. ADR-124 create order is amended: explicit
   name, then folder directory, then generate. Do not resolve git identity
   to `repo@sha` as the persisted name.
3. Disconnect / session end leaves the Agent running. Sleep/pause is an
   explicit command (`workspace pause` / later `ca` `s`). Destroy is
   terminate. Do not equate exit with delete.
4. **Project** is a stack (environments, many Resources, members). **Resource**
   is the deployable (Railway Service). Git/source belongs on Resource.
   **Repository Binding** is an index of which Projects a
   `repositoryIdentity` occupies. One identity may have many active Binding
   rows, one per Project. Occupy with a folder-linked / requested `projectId`
   binds that Project without moving other rows. Occupy without a requested
   Project reuses the oldest active Binding. `repository_binding_project_conflict`
   is removed.
5. `code` door stays origin / URL / this-folder (ADR-118 / ADR-119 / ADR-122).
   It does not become a Project picker. `^t` Target Project stays on the
   future `ca` home, not on default `code`.
6. Occupy may still create Project + Environment `local` + Resource `app` as
   **bootstrap** when missing. That cardinality is not a product invariant.
   A Project may have many Resources. The same repo may be the source of
   more than one Resource.

## Consequences

- Banner shape: `Remote · agent <name> · <repositoryIdentity>@<sha> · <server> · <projectId>`.
  Agent name is first. `prj_*` is last-resort metadata, not the handle.
- `workspace show` uses the unique kebab. `repo@sha` is no longer a selector.
- Spec 139 WS-REMOTE-BANNER-014 and ADR-124 decision 2 are superseded for
  naming and banner order.
- D6 "Repo is the Project Binding" is superseded for exclusivity. Repo remains
  the occupy locator.
- Railway `ca` home (prompt, New Session, Target Project) is out of this
  slice. Track it as a later spec after this language lands.

## Rejected Alternatives

- Making `code` a Project picker. Humans sit in a folder / git remote.
- Replacing `sbx_*` ids with kebab ids.
- Cloning the Railway `ca` home TUI in the same change as the language fix.
