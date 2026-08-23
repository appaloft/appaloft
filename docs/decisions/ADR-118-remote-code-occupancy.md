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
   capacity or another Server. Durable `workspace open` / `workspace create`
   pass that id from `--server` or, when omitted, from the same enrolled BYOS
   Server `code` already uses. Managed-default applies only when no registered
   BYOS Server exists. A registered BYOS Server must not be blocked by a
   managed-target requirement.
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
8. Occupancy may offer allowlisted laptop HOME skill directories into my
   Sandbox through the existing occupy `WriteSandboxFile` path. Railway-aligned
   roots are `~/.claude/skills`, `~/.codex/skills`, `~/.grok/skills`, and
   `~/.agents/skills`. Appaloft also offers `~/.cursor/skills` and
   `~/.config/opencode/skills` because those are the roots Appaloft users
   actually use; they are beyond Railway's documented cloud-agent skill sync.
   Copy is add-only and only for immediate child directories that contain
   `SKILL.md`. Skill-tree copy does not copy `mcp.json`, tokens, cookies, `.env`,
   editor plugin binaries, or files larger than 10MB. First-party Appaloft skill
   offer stays. This is not a new command and is not the local Agent door.
9. Occupy may write **my** laptop vendor credential onto **my** occupancy HOME
   through the same `WriteSandboxFile` path. Grok uses `~/.grok/auth.json`. Codex
   uses `~/.codex/auth.json`. Claude uses a setup-token (`APPALOFT_HOME/claude-setup-token`,
   `~/.claude/setup-token`, or laptop `CLAUDE_CODE_OAUTH_TOKEN` written as a file),
   never the Claude chat cookie. User-facing aliases are `--opencode` / `--pi` /
   `--omp` (ours) and `--claude` / `--codex` / `--grok` (Railway-aligned). They are
   mutually exclusive. `--claude` / `--grok` map onto the OpenCode occupancy
   harness. `--codex` launches the Codex occupancy harness on the remote Sandbox
   (managed-terminal `codex`), the same way Railway `code --codex` launches Codex
   on the cloud agent VM; the laptop only attaches. `--harness opencode|pi|omp|codex`
   is compatibility only. Occupancy OpenCode/Codex agent versions are pinned and
   installed onto the Sandbox at occupy time so the remote binary matches the pin
   (currently OpenCode 1.18.21 and Codex 0.149.0). Default follows the saved
   `APPALOFT_HOME/occupancy-agent.json` preference, then what is signed in or
   installed on this laptop. Never print token values. Never put long-lived
   secrets into occupancy env vars or `mcp.json`. Teammate disks stay isolated.
   This is not `appaloft setup agent`.
10. Occupy-door **Preparing disk** treats origin HTTP 502/503, Cloudflare
    bad-gateway, and incomplete origin responses as an automatic retry of the
    same occupy command, not as a TUI tear-down. For folder.local `--pi` /
    `--server`, that command is `OpenAgentWorkspaceCommand` executed through
    `executeFolderLocalWorkspaceOpen` → `createRemoteSandbox` (`sandboxes.create`
    on the enrolled Server, for example hostinger). It is not a second
    `POST /api/workspaces/open` and not a persist/workdir fallback. The Cloud
    Agents wait panel stays up and that occupy keeps retrying until a live
    session is bound (attach + terminal-ready) or the occupy deadline expires.
    This is occupy-door recovery only and does not replay other commands, drop
    `targetServerId`, change Cloud admission, or expose Occupancy. The
    wait-panel disk step is marked retrying while those retries run. A
    4-attempt helper burst is not a terminal exhaust while the deadline still
    remains: do not `leaveWorkspaceTuiOnce`, do not print
    `Opening folder.local/...`, and do not attach `folder.local`
    `repositoryIdentity` to a 502 remap in a way that formats that breadcrumb.
    The humanized WS-REMOTE-COMPAT-222 sentence may appear on the wait panel
    during retry. Do not leave alt-screen just to print it. Do not print the
    Appaloft error-contract sentence while alt-screen is still up. A hang
    inside an in-flight occupy open is abortable (Ctrl-C / quit / deadline),
    not a silent Preparing disk stay. If the deadline expires or occupy never
    binds a live session, fail closed: leave alt-screen once, print a human
    Cloud-unreachable / disk-prep sentence, do not print
    `Opening folder.local/...`, and exit non-zero. Ctrl-C / quit on the wait
    panel while never attached aborts the in-flight open and is not success.
11. Default `appaloft code` treats
    `workspace_open_partial_recovery_required` as an occupy-door recovery
    branch. It retries `workspaces.open` once with the same resolved
    repository, commit, Profile, Server, and vendor selection plus
    `forceNew: true`. The partial Sandbox is retained for inspection or later
    cleanup; the retry creates an isolated replacement and must not terminate,
    rewrite, or hide that existing identity. This applies to both Git-backed
    and `folder.local` occupancy. Lower-level `appaloft workspace open` /
    `workspace create` keep their fail-closed partial-recovery contract, and a
    failed replacement still returns its structured error. A TTY `code` run
    stays on the preparing panel until the replacement succeeds or fails.

## Consequences

- ADR-117 decision 1 and 6 are superseded for occupancy: the door may no
  longer resolve identity without calling `workspaces.open`.
- Spec 139 first-slice tests that assert default `code` does not dispatch
  `workspaces.open` must flip to occupancy.
- Cloud may keep managed-default only when no BYOS Server is registered.
  `code` and `workspace open` / `workspace create` pass the enrolled Server as
  `targetServerId` (`--server` pins it). They must not demand managed capacity
  when that BYOS Server is already registered.
- Expected public SemVer: minor. Catalog/SDK/CLI input gains one optional field.

## Rejected Alternatives

- Keep identity-only `code` and tell users to run `workspace open`.
- Add Server to the preferred unique key in the same ticket as occupancy.
- Silent dirty-laptop upload as remote truth.
- Sharing host OpenCode/Codex OAuth, MCP config, tokens, cookies, or `.env`
  with teammates or as occupancy env vars. Writing my laptop vendor
  `auth.json` / Claude setup-token onto my occupancy HOME is accepted.
- Inventing a setup command or letting the Sandbox read laptop HOME.
- Implementing `workspace` `ca` in the same ticket.
- Letting Cloud managed placement override the Server the door already chose.
