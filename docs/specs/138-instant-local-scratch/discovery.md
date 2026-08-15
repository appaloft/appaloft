# Instant Local Scratch — Grill / Discovery

## Status

- Round: Grill complete; Spec accepted; first-slice Code implemented.
- Date: 2026-08-15.
- Owner decision: accepted. The originating R7 task recorded four owner decisions and forbade
  silently inverting them. Independent research did not invert those answers. Q4/Q8/Q10/Q18 are
  the same decisions applied to the default door.
- Predecessor: Spec 125 / ADR-107 (`appaloft code` as `workspaces.open` presentation) and Spec 131 /
  ADR-109 (R1.1 managed-default activation). R1.1 remains historically complete; this slice revises
  the default entry, it does not reopen R1–R6 gates.
- Code changes allowed: yes, after Ticket #1124.

## Actor And Observable Outcome

A developer in any local directory — empty, dirty, detached, unpushed, not a Git repository, not
logged in, and without Binding / Profile / Cloud — can run:

```text
appaloft code
```

and enter OpenCode or Pi on this Mac in under two seconds. The only acceptable hard failure before
attach is: no supported agent binary, and the user refuses the install prompt.

The user sees one session that can later upgrade. They do not see Sandbox ids, Binding ids, Profile
names, or a first-run wizard.

## Why This Is The Next Slice

R6 Sync is closed. The Railway Replacement program currently has no active product slice and
explicitly requires a new Grill before inventing R7. The remaining actor pain is not failover or
platform breadth. It is the front door.

Shipped R1.1 made `appaloft code` a managed Workspace activation:

- logged-in + entitled → `managed/platform-default`
- no capacity → fail closed, never silent BYOS/local
- local path is only a Git locator
- dirty / detached / unpushed / missing upstream fail before mutation
- Binding + default Profile are created or reused during activation

That contract is correct for a durable remote Workspace. It is the wrong contract for a command
named `code`.

## Research: Two Product Classes, Not One Competitor

The handoff compared Railway and Paseo. Those are useful but incomplete. Official docs for the
tools users actually type show a sharper split.

### Class A — Directory-first agents

These products treat the current directory as the session. Git is optional or advisory. Platform
login is not the door.

| Product | Official entry | Git / login at the door |
| --- | --- | --- |
| OpenCode | `cd /path/to/project && opencode` ([docs](https://opencode.ai/docs/)) | Directory is enough. Provider `/connect` happens inside the TUI. Non-git dirs are valid; session data may fall back to a global store. |
| Pi | `cd /path && pi` ([npm](https://www.npmjs.com/package/@mariozechner/pi-coding-agent)) | Filesystem tools, no Git mandate. Scratch directories are a documented usage. |
| Claude Code | `cd /path/to/your/project && claude` ([quickstart](https://code.claude.com/docs/en/quickstart)) | Directory-first. Account login is prompted on first use, not GitHub/Appaloft login. Git is used after attach, not as an entry gate. |
| Codex CLI | open a project directory and run `codex` ([docs](https://learn.chatgpt.com/docs/codex/cli)) | Local repository loop. Sign-in is ChatGPT/model auth. Git checkpoints are a later practice, not a preflight. |
| Aider | `aider [files…]` ([usage](https://aider.chat/docs/usage.html)) | Prefers a Git repo so it can commit/undo, but the command still starts from files in cwd. |

Common pattern: **open the folder, then configure**. The agent owns conversation UI. The platform,
if any, is injected later as tools.

### Class B — Machine-first workspaces

These products provision a remote filesystem from a Git ref or template. Dirty files are a
persistence problem *inside* an already created machine.

| Product | Official entry | What “open” means |
| --- | --- | --- |
| GitHub Codespaces | create from a repository branch or template ([docs](https://docs.github.com/en/codespaces/developing-in-a-codespace/creating-a-codespace-for-a-repository)) | Allocate VM/storage, clone the repo, then connect. Empty-branch create is rejected. Templates exist so a new project can publish to Git later. |
| Gitpod / Ona, Daytona, Coder | start a workspace from a repo or template | Persistent volume keeps uncommitted edits after stop. Delete loses them. This is not “start from a dirty laptop folder”. |
| Railway Code / `railway ca` | open a remote UI, login can happen later | Still a hosted environment, not `cd ~/anything`. |

Common pattern: **create a machine from a known ref, then work**. Local dirty trees are not the
source of truth.

### What Appaloft currently is

`appaloft code` is a Class A verb bound to a Class B operation:

- CLI presentation: `packages/adapters/cli/src/commands/agent-workspace.ts`
  `makeWorkspaceOpenCommand("code" | "open")` — both names share one handler.
- That handler always calls `resolveLocalGitWorkspaceContext`, then
  `OpenAgentWorkspaceCommand` / `workspaces.open`.
- Preflight (`local-git-workspace-context.ts`) fail-closes on: not a Git worktree, dirty tree,
  detached HEAD, missing upstream, remote tip mismatch, remote Git timeout.
- Spec 125 / ADR-107 made this identity explicit: `code` is presentation over `workspaces.open`.
- Spec 131 / R1.1 then made logged-in entitled users take `managed/platform-default` and lazily
  create Binding / default Profile.

So a user who types the same verb they use for OpenCode or Pi is forced through remote SHA, Binding,
Profile, entitlement and sometimes Cloud capacity before any agent appears. That is the ceremony.

Railway/Paseo only explain the hosted half. The missing comparison is OpenCode/Pi/Claude/Codex:
those are what `code` already names in the user's head.

## Facts From The Current Product

- R1–R6-core are closed. R1.1 remains a valid *upgrade* path, not the default door.
- Durable Workspace identity is still `workspaceId = sandboxId` (ADR-094). Dirty local files must
  never become that identity (ADR-103 decision 7).
- `appaloft workspace open` and `workspace create` are the explicit remote/durable surfaces.
  Their Git fail-closed rules stay.
- `appaloft server enroll --local` already registers this Mac as `local-trusted` without a Host or
  Machine aggregate (Spec 129 / ADR-108). Implicit scratch must not perform that enrollment.
- `appaloft dev` is a local DevelopmentSession over the deployment graph (Spec 132). Scratch is
  not Dev and must not reuse Deployment or Dev lifecycle.
- Public skill (`community/appaloft/skills/appaloft/**`) already says local-only CLI workflows do
  not require Appaloft login. Current `code` contradicts that skill.
- Skill CLI reference still documents `workspace open` as the primary Profile-aware entry and does
  not mention `appaloft code`. The skill is already behind the shipped command.
- Native attach already exists for OpenCode via `local-client-exec`. There is no current
  no-Sandbox, no-login, any-directory spawn path.
- Cloud must never inbound-SSH a personal Mac. No-capacity managed requests must still fail closed
  and must never silently become this Mac.

## Recommended Model

Three layers. The user sees one session upgrading, not internal ids.

1. **Scratch session** — default `appaloft code`.
   - Any directory. Dirty / no-git / detached / unpushed / logged-out are all valid.
   - Implicit target = this Mac. No Server enroll. No Sandbox, Binding, Project, Profile
     installation, or Cloud row.
   - Banner: `Local scratch · this Mac · not saved remotely`.
   - Spawn OpenCode if present, else Pi, else an install prompt. Attach is the native TUI.
   - Inject the public Appaloft skill / MCP so the user can later say login / enroll / open remote
     workspace in natural language. Mutations still require the public operation catalog and
     scoped human approval.
2. **Linked session** — same agent process, after explicit upgrade.
   - Allowed upgrades: `appaloft login`, `server enroll --local` or `ssh://...`, bind the current
     repo to a Project, materialize/edit a Profile, “open remote workspace”.
   - Cloud may inject entitlement, managed template and placement only on this path.
3. **Durable Workspace** — current `workspaces.open` semantics.
   - Remote source remains an exact remote SHA.
   - Dirty tree must not silently become Workspace truth.
   - Upgrade paths only: agent helps commit/push then open; or the user explicitly chooses an
     empty remote and syncs later.

## Accepted Grill Decisions

These answers are accepted. Do not invert them in Spec or Code.

| Question | Recommended decision | Consequence |
| --- | --- | --- |
| Q1. What actor outcome defines R7? | Any local directory enters a native Agent on this Mac in <2s, with a scratch banner, without Binding / Profile / Cloud. | Measure time-to-agent, not time-to-Sandbox. |
| Q2. Is this a reboot of Railway Replacement or a new Host aggregate? | No. R1.1 stays historically complete. No Host/Machine. Server remains the execution target. | Do not rewrite R1–R6 or add a fourth identity. |
| Q3. What is the default `appaloft code`? | Scratch. It no longer delegates to `workspaces.open`. | Spec 125 / ADR-107 presentation identity is revised. `workspace open` keeps the old contract. |
| Q4. What happens to logged-in + entitled users? | Default `code` is still scratch. Managed / remote is an explicit upgrade (“open remote workspace” or `workspace open`). | This inverts the R1.1 *default*, not the R1.1 *capability*. No silent managed attach. |
| Q5. Does scratch create durable state? | No Sandbox, Binding, Project, Profile installation, Server, or Cloud row. | Retry and uninstall leave no control-plane residue. Native agent session files may exist under the user's home / cwd per harness rules. |
| Q6. Is implicit this-Mac a Server? | No. Scratch uses implicit same-machine trust. `server enroll --local` remains the explicit `local-trusted` Server. | Cloud still cannot inbound-SSH a personal Mac. Enroll stays opt-in. |
| Q7. What if managed capacity is missing? | Fail closed on the *upgrade* path. Never silently switch a managed request to this Mac. | R1.1 no-fallback invariant is preserved where it still applies. |
| Q8. Default harness? | OpenCode if the binary is present, else Pi, else install prompt. Claude Code / Codex are later explicit `--profile` or user-requested upgrades, not the door. | Avoid a vendor login loop as the first Appaloft experience. Community stays harness-neutral. |
| Q9. Invisible defaults? | Resolution rules named `appaloft-local` and `appaloft-remote` in docs/code. Do not persist Profile installations on first scratch. Materialize an editable Profile only when the user asks to change harness / isolation / MCP. | Users never need the word “profile” on first run. `--profile` stays advanced. |
| Q10. Who owns scratch? | Public CLI adapter + a local runtime coordination record, analogous to R2a `DevelopmentSession`. Not a Sandbox, Deployment, or Cloud Workspace. | No new aggregate root. No Cloud table. |
| Q11. What stays fail-closed on Git? | Explicit remote `workspaces.open`, `workspace open`, and `workspace create`. | Dirty-tree upload and implicit git sync remain forbidden. |
| Q12. How does remote upgrade work? | Only after commit/push of the exact SHA, or an explicit empty-remote choice. Same agent may later reconnect to the durable Workspace; that reconnect is a later slice. | Slice 1 must not fake Sandbox identity or “same workspaceId”. |
| Q13. Skill / MCP? | Inject the existing public Appaloft skill and, when the harness supports it, Appaloft MCP. Do not parse vendor TUI text or add a Chat UI. | Configure-in-language without a second conversation model. |
| Q14. Mutations inside scratch? | Public operation catalog only, with scoped human approval. Auto-approve is forbidden for deploy / enroll / delete / other writes. | Matches current skill and Workspace TUI rules. |
| Q15. Community vs Cloud? | Community must work with the local default only. Cloud injects entitlement, managed template and placement only on the upgrade path. Cloud must not lock the default Profile as Cloud-only. | Public-first. No private wrapper around `code`. |
| Q16. First actor-visible slice? | Empty dir + dirty dir + logged-out dir all enter the Agent or the install prompt. No Binding / Profile / Cloud required. Later slice: scratch → login → enroll this Mac or VPS → clean push → same Agent reconnects to durable Workspace. | First ticket is local and source-CLI verifiable with `appaloftdev`. |
| Q17. Hard failure before attach? | Only: no supported agent binary and user refuses install. Network, login, Git, Binding, Profile, and Cloud are not doors. | Matches Class A agents. |
| Q18. Is a new public operation required? | No `code.open` catalog entry. Scratch is CLI presentation plus local coordination. Durable open remains `workspaces.open`. | ADR-107's “no new operation” stays; only the default presentation target changes. |
| Q19. Compatibility? | Additive revision of the default `code` path. `workspace open` semantics unchanged. Expected public SemVer impact: minor, with a documented behavior change for users who relied on R1.1 auto-managed `code`. | Help, skill, and Workspace docs must say scratch vs durable explicitly. |
| Q20. ADR? | Update ADR-107 (presentation target) and add a short public ADR for scratch vs durable Workspace. Update ADR-103 only to state that Git fail-closed applies to durable open, not default `code`. | Do not weaken ADR-103's no-upload rule. |

## Event-Storming Timeline

Candidate facts. Promote to event specs only if a durable business fact needs publication.

| Order | Fact | Command or trigger | Policy | Owner | Readback |
| --- | --- | --- | --- | --- | --- |
| 1 | Scratch requested | `appaloft code [path]` | any directory; no Git/login/Cloud required | Public CLI | banner + resolved cwd |
| 2 | Harness resolved | local binary probe | OpenCode else Pi else install prompt | Public CLI | harness name, not Profile id |
| 3 | Skill/MCP offered | scratch start | existing public skill; no vendor parse | Public CLI / skill files | injected or skipped with reason |
| 4 | Native agent attached | spawn local TUI | no Sandbox; no control-plane handshake | Harness owns UI | process started or install refused |
| 5 | Upgrade requested | user / agent asks login, enroll, bind, open remote | catalog operation + human approval | Existing public commands | existing command results |
| 6 | Durable Workspace opened | `workspaces.open` / `workspace open` | clean pushed SHA or explicit empty remote | Existing Workspace workflow | current activation + target evidence |

## Policies And Invariants

| Policy | Owner | Required result |
| --- | --- | --- |
| Scratch creates no control-plane rows | Public CLI | No Sandbox / Binding / Project / Profile / Server / Cloud write. |
| Durable source remains exact remote SHA | `workspaces.open` | Dirty local is never uploaded or treated as Workspace truth. |
| No silent managed → local fallback | Cloud policy on upgrade path | Missing capacity fails closed with retry / enroll guidance. |
| No inbound SSH to a personal Mac | Server / Worker contracts | Scratch and `local-trusted` are same-machine only. |
| Human approval for writes | Existing operation catalog | Agent may propose login / enroll / deploy; it may not auto-approve. |
| Community local default | Public composition | Logged-out Community users get `appaloft-local` only. |

## Context Map

| Context | Owns | Does not own |
| --- | --- | --- |
| Public CLI scratch presentation | default `code`, harness probe, banner, skill injection, install prompt | Sandbox lifecycle, Cloud entitlement |
| Public Workspace workflow | durable `workspaces.open`, Git fail-closed, Binding/Profile, attach to Sandbox | implicit this-Mac scratch |
| Public Server | explicit `enroll --local` / SSH / later Worker | implicit scratch target |
| Cloud activation | entitlement, managed template, placement, quota on upgrade | default door, scratch identity |
| Native Agent | conversation UI and vendor session files | Appaloft lifecycle and proof |

## Alternatives Considered

| Alternative | Decision | Reason |
| --- | --- | --- |
| Keep `code` == `workspaces.open` and only smooth managed onboarding | Rejected | Continues to use a Class A verb for a Class B door. Empty/dirty/logged-out still fail. |
| Copy Railway / Paseo first | Rejected as the primary model | Those are machine-first. The door users already know is OpenCode/Pi/Claude/Codex. |
| Copy Codespaces “create from repo, persist dirty inside the VM” | Rejected for default `code` | Correct for durable Workspace, wrong for `cd ~/anything`. |
| New Host / Machine aggregate | Rejected | Server already covers explicit local and SSH. Scratch is implicit same-machine trust. |
| New `code.open` operation | Rejected | Would duplicate presentation as domain truth. |
| Silent dirty-tree upload or implicit git sync | Rejected | Breaks ADR-103 and proof. |
| Silent managed → BYOS/local fallback | Rejected | Changes trust, cost and data location without consent. |
| Default Claude Code / Codex | Rejected for first run | Vendor account login becomes the door; Community cannot ship that as the default. |
| Persist default Profiles on first scratch | Rejected | Reintroduces Profile ceremony and Cloud-only lock risk. |
| Entry wizard for Binding / Profile / Server | Rejected | Competitor door is attach-first. |
| Make scratch a Sandbox on localhost | Rejected for slice 1 | Adds isolate/placement latency and durable ids the user did not ask for. Later isolation can reuse Sandbox after enroll. |
| First ticket includes login → enroll → remote reconnect | Rejected as slice 1 | That is the second vertical slice. Slice 1 must be source-CLI provable without Cloud. |

## First Slice Acceptance

```text
cd ~/anything          # even not a git repo
appaloft code          # <2s into OpenCode/Pi
# banner: Local scratch · this Mac · not saved remotely
# user can say: login / enroll this Mac or VPS / open remote workspace
```

Source-CLI verification after Code Round, from Cloud root, without a global `appaloft` overwrite:

```text
appaloftdev code --help
mkdir -p /tmp/appaloft-scratch-empty && appaloftdev code /tmp/appaloft-scratch-empty --no-attach
# dirty dir and logged-out dir: same command; no Binding/Profile/Cloud; banner present
# only hard failure: no OpenCode/Pi and install refused
```

`--no-attach` must still perform scratch resolution, print the banner, and exit without calling
`workspaces.open` or Git fail-closed. Attach is proven separately when a supported binary exists.

## Public / Private Split

- Public first: presentation split, scratch coordination, harness probe, banner, skill injection,
  help, ADR-107 revision, Git-preflight scope, Test Matrix.
- Cloud later and only on upgrade: entitlement, managed template, placement, quota, no-capacity
  fail-closed. No private wrapper around default `code`.
- First ticket lives in `appaloft/appaloft`. Cloud tracking issue only if the upgrade path needs
  hosted composition beyond current R1.1 ports.

## Non-Goals

- Entry wizard for Binding / Profile / Server.
- Silent dirty-tree upload or implicit git sync.
- Silent managed → BYOS/local fallback.
- Cloud-only Workspace lifecycle.
- Auto-approve deploy / enroll / delete / other writes.
- New Chat UI or vendor conversation parser.
- Third default harness, mobile, R2 Worker changes, R6 replay.
- Deleting existing `workspace open` fail-closed Git rules.
- Reopening R1.1 managed capability or R2–R6 gates.

## Open Questions For The Owner

Closed by the originating R7 task and this Spec Round:

1. Q4 accepted: logged-in entitled `appaloft code` stays scratch; managed is opt-in.
2. Q8 accepted: OpenCode else Pi else install prompt.
3. Q10 accepted: scratch is CLI-local coordination, not a Sandbox.
4. Q18/Q19 accepted: no `code.open`; public minor with documented default-door change.
5. Banner copy accepted: `Local scratch · this Mac · not saved remotely`.

## Source-Of-Truth Follow-Up After Confirmation

Public:

- `docs/specs/138-instant-local-scratch/{spec,plan,tasks}.md`
- ADR-107 update + new scratch-vs-durable ADR
- ADR-103 clarification that Git fail-closed is durable-open only
- `docs/commands/workspaces.open.md` entrypoint table
- `docs/testing/workspace-code-activation-test-matrix.md` plus a scratch matrix
- `docs/BUSINESS_OPERATION_MAP.md` and skill `cli-entrypoints.md`
- localized `agent-workspace-open` help

Cloud, after public Spec exists:

- `docs/specs/062-instant-local-scratch/` thin composition artifact
- `docs/cloud/railway-replacement-program.md`, `product-path.md`, `roadmap.md`: R1.1 historically
  complete; R7 revises the default entry

Ticket only after Spec: first public actor-visible slice as above.
