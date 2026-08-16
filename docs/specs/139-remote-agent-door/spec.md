# Remote Agent Door

## Status

- Round: Spec
- Artifact state: slice 1–21 shipped; slice 22 occupancy help door accepted 2026-08-16
- Discovery: [discovery.md](./discovery.md)
- Governing decision: ADR-120 plan default destination; ADR-119 locates; ADR-118 occupies; ADR-117 remains the login/Server/`--local` door; ADR-116 remains Scratch-only; ADR-103 stays on explicit `workspace open` Git fail-closed
- Code changes allowed: yes for slice 22 after the occupancy-help-door ticket is `ready-for-agent`
- Compatibility: public minor. Top-level CLI help names occupancy doors; no new catalog field

## Business Outcome

After `appaloft login`, `appaloft code` occupies **my Sandbox** on the team’s default
enrolled Server. Source is the remote SHA. The locator may be a git remote URL or a
local path used only to discover `origin`. The laptop tree is not uploaded.
`--local` remains this-Mac Scratch. Explicit `workspace open` keeps ADR-103 Git fail-closed.


## Ubiquitous Language

| Term | Meaning |
| --- | --- |
| Remote Agent door | Default `appaloft code`. Login + default Server + my Sandbox occupancy. |
| My Sandbox | Tenant + subject + Project Binding occupancy. `workspaceId = sandboxId`. |
| Shared Server | Enrolled Mac mini / VPS / later managed pool. Door passes `targetServerId`. |
| Scratch | Spec 138 this-Mac session. Only `appaloft code --local`. |
| Delivery open | `appaloft workspace open`. ADR-103 Git fail-closed. Unchanged managed-default policy. |
| `ca` tree | Later `appaloft workspace` management UI. Not this slice. |
| Repo-URL locator | Positional `https://` / `ssh://` / `git@host:path`. Occupies that `repositoryIdentity` from remote HEAD. |

## Requirements And Acceptance Criteria

| ID | Behavior | Given | When | Then |
| --- | --- | --- | --- | --- |
| WS-REMOTE-LOGIN-001 | Login is the door | no Appaloft login | `appaloft code` | exits non-zero with login guidance; does not start Scratch. |
| WS-REMOTE-SERVER-002 | Server required | logged in, no enrolled/default Server | `appaloft code` | exits with enroll / `workspace` guidance; no Scratch; no Sandbox create. |
| WS-REMOTE-OPEN-003 | Default code occupies | logged in, default Server exists | `appaloft code` | CLI does not inspect laptop Git as Workspace truth; dispatches `workspaces.open` with remote SHA + `targetServerId`; prints Remote banner with real `workspaceId`; attaches via existing handoff. |
| WS-REMOTE-RESUME-004 | Same person reconnect | I already have a non-terminal preferred Sandbox | `appaloft code` from any directory, including another Git origin, **without** an explicit remote locator | resumes that Sandbox; cwd origin is not Workspace truth unless `--new`. An explicit remote locator uses WS-REMOTE-URL-024. |
| WS-REMOTE-OCCUPY-005 | One disk each | teammate B is logged in on the same Server/Binding | B runs `appaloft code` | B gets B’s Sandbox; A’s files and auth paths are not mounted. |
| WS-REMOTE-NO-UPLOAD-006 | No laptop upload | laptop tree is dirty / missing / not a repo | `appaloft code` | still occupies from remote SHA when origin exists; no file content upload; no `workspace_git_dirty`. Missing origin and no explicit remote locator resumes the latest non-terminal occupancy when one exists; otherwise fail-closes `workspace_remote_repository_missing`. |
| WS-REMOTE-BINDING-007 | Binding optional at CLI | logged in + Server, no Project Binding | `appaloft code` | Community initializer creates/reuses Project + Binding + invisible `appaloft-remote` Profile; occupancy proceeds. |
| WS-REMOTE-PROFILE-008 | Shared harness pin | Project has no default Profile | `appaloft code` occupies | initializer installs OpenCode-else-Pi `appaloft-remote` with optional `model-api` and no required model credential. Unbound compile still starts vendor-login. Existing default Profile is reused, never overwritten. |
| WS-REMOTE-AUTH-009 | Personal model login | no team Connection; I never signed in inside my Sandbox | Agent starts | vendor TUI may prompt **me** to log in; occupancy egress allowlist includes `opencode.ai` so unbound OpenCode vendor-login is not blocked by the sandbox proxy. No teammate OAuth file is copied. |
| WS-REMOTE-LOCAL-010 | Scratch is explicit | any directory | `appaloft code --local` | Spec 138 Scratch contract; no Server/Sandbox required. |
| WS-REMOTE-OPEN-COMPAT-011 | Delivery open unchanged | `workspace open` / `workspace create` | dirty/non-git laptop | existing `workspace_git_*` fail-closed. Bare `workspace open` does not require `targetServerId`. |
| WS-REMOTE-CAPACITY-012 | No silent fallback | default Server has no capacity | `appaloft code` | fail closed; not Scratch; not another teammate’s Sandbox; not a different Server; not managed substitution. |
| WS-REMOTE-DOCS-013 | Help names doors | `appaloft --help` / `code --help` / Workspace docs | rendered | default `code` occupies my Sandbox; `--local` is Scratch; `workspace` is occupancy tree; `workspace open` is delivery Git-safe; bare `deploy` reuses occupancy. |
| WS-REMOTE-BANNER-014 | Identity after occupy | `workspaces.open` succeeds | attach or `--no-attach` | stdout has one banner: `Remote · <project> · <repo@sha> · <server> · my sandbox · <workspaceId>` and optional ` · <preview-url>` when Resource `app` already has succeeded generated access. No live deploy stream. |
| WS-REMOTE-TARGET-015 | Door Server is placement | door selected Server S | `code` dispatches open | command includes `targetServerId=S`; placement reserves S. |
| WS-REMOTE-NO-ATTACH-016 | Occupy without attach | `--no-attach` | `appaloft code --no-attach` | Sandbox is created or resumed; CLI does not attach; exit 0; `sandbox list` shows my occupancy. |
| WS-REMOTE-SKILL-017 | Occupancy offers Appaloft skill | occupancy OpenCode starts or attaches | harness config is prepared | Sandbox serve offers `/workspace/skills` and `/workspace/.agents/skills`; `appaloft-remote` declares optional `appaloft-tools` so a later first-party MCP Connection can bind into occupancy serve. Unbound occupancy still starts without serve MCP. Native attach offers the public Appaloft skill plus `appaloft mcp remote-stdio` when a control plane is selected, or `mcp stdio` for local-only Scratch. Occupancy attach must not wrap remote-stdio with `APPALOFT_CONTROL_PLANE_MODE=none`. Attach sets an isolated `XDG_CONFIG_HOME` so a broken host `opencode.json` cannot reject the injected MCP. Vendor TUI text is not parsed. |

| WS-REMOTE-RESUME-SERVE-018 | Resume restarts serve | preferred Sandbox exists but OpenCode serve is gone | `appaloft code --no-attach` | occupancy resumes the same workspaceId and `ensureRuntime` starts serve before exit 0. |
| WS-REMOTE-TEMPLATE-019 | Occupancy template is automatic | login + Server, no `APPALOFT_OPENCODE_SANDBOX_TEMPLATE_ID` | `appaloft code --no-attach` | Community/Cloud register OpenCode against reserved `stp_appaloft_remote_opencode`, ensure that tenant template with `COMMUNITY_REMOTE_DEFAULT_NETWORK_POLICY`, then occupy. Explicit env still pins a different template id. Mismatch fail-closes; no local/BYOS fallback. |
| WS-REMOTE-RESUME-EGRESS-020 | Ready occupancy resume reapplies egress | preferred allowlist Sandbox is already `ready` | `appaloft code --no-attach` | resume probes the provider runtime, then reapplies the stored allowlist via `updateNetworkPolicy` so a replaced Sandbox Gateway still has the occupancy egress policy. Gateway 5xx fail-closes; deny-mode Sandboxes skip reapply. |
| WS-REMOTE-MCP-DISCOVERY-021 | Occupancy can discover deploy ids and deliver | occupancy OpenCode/Pi has first-party `appaloft-tools` | Agent prepares serve, deploys, or opens a PR | first-party binding always includes `projects_list`, `environments_list`, `environments_create`, `resources_list`, `resources_show`, `resources_create`, `resources_configure_source`, `resources_configure_runtime`, `resources_configure_network`, `resources_configure_access`, `servers_list`, `deployments_list`, `deployments_plan`, `deployments_create`, `deployments_show`, `deployments_proof`, `deployments_timeline`, `preview_environments_list`, `preview_environments_show`, `sandbox_ports_expose`, and `sandboxes_agent_tasks_deliver`. Tenant MCP Connections are unchanged. Invisible `appaloft-remote` default lists the same tools. |
| WS-REMOTE-GITHUB-DELIVERY-022 | Occupancy can push and open a PR | occupancy OpenCode serve starts and IntegrationAuth has a GitHub token | Agent runs `gh` / `git push` or Task deliver | serve process receives `GH_TOKEN` on stdin, never argv. Missing token still starts occupancy. Tenant MCP unchanged. |
| WS-REMOTE-MCP-TENANT-023 | Occupancy first-party MCP can see my Sandbox | occupancy OpenCode has `appaloft-tools` and I occupy `sbx_*` | Agent calls `sandbox_ports_expose` / later preview tools with that sandboxId | `/mcp` remaps the product-session organization through `TenantContextResolver` before dispatch, same as oRPC. Missing remap must not 404 a tenant-visible Sandbox. |
| WS-REMOTE-URL-024 | Positional git remote occupies | logged in + default Server; cwd is empty / not a repo | `appaloft code https://github.com/org/repo.git --no-attach` (or `ssh://` / `git@host:path`) | CLI does not require a local clone; normalizes to credential-free HTTPS; `ls-remote` HEAD → exactly one `refs/heads/*`; dispatches `workspaces.open` with that SHA + `targetServerId`; Remote banner uses that identity. |
| WS-REMOTE-URL-HEAD-025 | Default branch from remote HEAD | URL has no branch | door resolves ref | `ls-remote HEAD` maps to one `refs/heads/*`. Zero or many heads fail closed (`workspace_remote_default_ref_unavailable` / `workspace_git_ref_ambiguous`). No GitHub `/tree/` parsing. |
| WS-REMOTE-URL-WINS-026 | URL wins over other occupancy | I have a non-terminal occupancy of repo A | `appaloft code <git-remote-of-B> --no-attach` | occupies or resumes B only; does not resume A. |
| WS-REMOTE-URL-LOCAL-027 | Scratch rejects remotes | any state | `appaloft code --local https://github.com/org/repo.git` | fail closed; Scratch is this-Mac only. |
| WS-REMOTE-URL-SHORTHAND-028 | GitHub owner/repo occupies | logged in + Server; `owner/repo` is not a local directory | `appaloft code owner/repo --no-attach` | occupies `https://github.com/owner/repo.git` via the same HEAD contract as WS-REMOTE-URL-024; does not resume another occupancy. |
| WS-REMOTE-URL-SHORTHAND-056 | Existing local path wins | cwd has a directory `owner/repo` | `appaloft code owner/repo` | treated as a local path, not github.com. |
| WS-REMOTE-URL-DOCS-029 | Help names the URL door | `code --help` / Workspace docs / skill | rendered | `appaloft code <git-remote>` occupies that repo without a clone; `--local` stays Scratch. |
| WS-REMOTE-DEST-030 | Plan omitted destination | logged in + Server; resource has no destination pin; Server has Destination named `default` | Agent/CLI `deployments.plan` without `destinationId` | preview uses that Destination; does not create Destination; does not fail `destinationId is required`. |
| WS-REMOTE-DEST-031 | Resource pin wins | resource `defaultDestinationId` is set | `deployments.plan` omits destinationId | preview uses the pinned Destination when it belongs to the selected Server. |
| WS-REMOTE-DEST-032 | Missing default fail-closed | Server has no Destination named `default` and resource has no pin | `deployments.plan` omits destinationId | fail-closed `destinationId is required`; no Destination created. |
| WS-REMOTE-CA-033 | Headless occupancy tree | logged in + Server; occupancies exist | `appaloft workspace --json` | stdout is `appaloft.workspace-occupancy/v1` with Servers and my Sandboxes; no `renderer-unavailable` empty shell. |
| WS-REMOTE-CA-034 | `--no-tui` same tree | same | `appaloft workspace --no-tui` | same occupancy tree; TUI does not start. |
| WS-REMOTE-CA-035 | Interactive TUI unchanged | TTY + supported terminal | `appaloft workspace` | existing Workspace control TUI starts; no occupancy-tree JSON. |
| WS-REMOTE-CA-036 | Occupancy projectId | occupancy activation exists | `appaloft workspace --json` | occupancy row includes `projectId` from `activation.project.projectId`. |
| WS-REMOTE-CA-037 | Missing activation stays lean | Sandbox has no activation | `appaloft workspace --json` | row has workspaceId/status/occupancy only; no invented projectId. |
| WS-REMOTE-CTX-038 | Plan resource context | Resource exists; project/env omitted | `deployments.plan --resource --server` | preview uses Resource project/env; destination still default. |
| WS-REMOTE-CTX-039 | Missing resource fail-closed | plan omits resourceId | `deployments.plan --server` | fail-closed; no invented Resource. |
| WS-REMOTE-ENV-040 | Occupancy default Environment | occupancy creates a Project with no Environment | `appaloft code --no-attach` then `env list --project <id>` | one Environment named `local` exists. |
| WS-REMOTE-ENV-041 | Existing local reused | Project already has Environment `local` | second occupancy of same repo | no second Environment; create is not called. |
| WS-REMOTE-RES-042 | Occupancy default Resource | occupancy Project has Environment `local` and no Resource `app` | `appaloft code --no-attach` then `resource list --project <id>` | one Resource slug `app` exists with remote-git source. |
| WS-REMOTE-RES-043 | Existing app reused | Environment already has Resource `app` | second occupancy of same repo | no second Resource; create is not called. |
| WS-REMOTE-NET-044 | Occupancy default network | occupancy Resource `app` has no network profile | `appaloft code --no-attach` then `resource show` / `deployments.plan --resource --server` | Resource has `internalPort 3000`, `http`, `reverse-proxy`; plan no longer reports `missing-internal-port`. |
| WS-REMOTE-NET-045 | Existing network reused | Resource `app` already has a network profile | second occupancy of same repo | configure-network is not called; existing port is kept. |
| WS-REMOTE-PLAN-046 | Remote-git without Dockerfile fail-closed | occupancy Resource source is remote-git; inspection has no dockerfile/start/static evidence | `deployments.plan --resource --server` | readiness blocked; planner does not invent `Dockerfile`. |
| WS-REMOTE-PLAN-047 | Remote-git Dockerfile evidence still wins | inspection detects dockerfile | `deployments.plan` | plannerKey `dockerfile`; path comes from inspection, not a hardcoded default. |
| WS-REMOTE-INSPECT-048 | Remote-git occupancy inspects the remote tree | occupancy Resource source is remote-git of a single-app repo with root Dockerfile | `deployments.plan --resource --server` | `detectedFiles` includes dockerfile; plannerKey `dockerfile`. |
| WS-REMOTE-INSPECT-049 | Monorepo remote-git fail-closed | occupancy Resource source is `appaloft/examples` with multiple deployable roots | `deployments.plan --resource --server` | blocked on `source.baseDirectory`; does not invent `hello/`. |
| WS-REMOTE-PREVIEW-050 | Occupancy Preview URL | occupancy Project has Resource `app` with succeeded generated access | `appaloft workspace --json` | occupancy row includes `preview.url` from `resources.list` `accessSummary.latestGeneratedAccessRoute`. |
| WS-REMOTE-PREVIEW-051 | Missing Preview stays omitted | occupancy has projectId but Resource `app` has no succeeded generated route | `appaloft workspace --json` | row has projectId; no invented `preview`. |
| WS-REMOTE-DEPLOY-052 | Occupancy deploy reuse | occupancy Project has Environment `local` and Resource `app`; default Server exists | `appaloft deploy https://github.com/appaloft/examples.git` | CLI does not prompt for method; dispatches `deployments.create` with occupancy project/env/resource/server. |
| WS-REMOTE-DEPLOY-053 | Missing occupancy Resource stays fail-closed when non-interactive | git-remote has no Binding or no Resource `app`; no TTY | `appaloft deploy <git-remote>` | exits non-zero `workspace_occupancy_resource_missing`; no invented Resource. |
| WS-REMOTE-EXPOSE-054 | Occupancy uses single EXPOSE | occupancy remote has one Dockerfile `EXPOSE` | `appaloft code --no-attach` then `resource show` / `deployments.plan` | Resource `internalPort` is that EXPOSE; plan execution port matches. |
| WS-REMOTE-EXPOSE-055 | Missing or multiple EXPOSE keeps 3000 | occupancy remote has no EXPOSE or more than one distinct EXPOSE | `appaloft code --no-attach` | Resource stays `internalPort 3000`. |
| WS-REMOTE-DEPLOY-057 | Bare occupancy deploy | latest occupancy has Environment `local` and Resource `app` | `appaloft deploy` | no pathOrSource prompt; dispatches `deployments.create` for that occupancy. |
| WS-REMOTE-DEPLOY-058 | Bare deploy without occupancy fail-closed | no non-terminal occupancy or no Resource `app`; no TTY | `appaloft deploy` | exits non-zero `workspace_occupancy_resource_missing`; does not treat cwd as source. |
| WS-REMOTE-DEPLOY-059 | Occupancy deploy prints generated URL | occupancy Resource `app` has a succeeded generated access route | `appaloft deploy` | stdout includes that URL after `deployments.create`. |
| WS-REMOTE-DEPLOY-060 | Missing generated URL stays omitted | occupancy deploy succeeds but no public access route | `appaloft deploy` | still prints deployment id; exit 0; no invented URL. |
| WS-REMOTE-BANNER-061 | Occupancy banner includes Preview URL | occupancy Resource `app` has succeeded generated access | `appaloft code --no-attach` | banner includes that URL. |
| WS-REMOTE-BANNER-062 | Missing Preview stays omitted from banner | occupancy has projectId but Resource `app` has no succeeded generated route | `appaloft code --no-attach` | existing identity banner; no invented URL. |
| WS-REMOTE-DEPLOY-063 | Occupancy last deployment | occupancy Resource `app` has `lastDeploymentId` | `appaloft workspace --json` | occupancy row includes that id and status. |
| WS-REMOTE-DEPLOY-064 | Missing last deployment stays omitted | occupancy has projectId but Resource `app` has no last deployment | `appaloft workspace --json` | row has projectId; no invented `deployment`. |
| WS-REMOTE-CA-065 | Default occupancy tree omits leftovers | logged in + Server; occupancies include terminated/failed | `appaloft workspace --json` | occupancies omit `terminated` and `failed`; ready/provisioning remain. |
| WS-REMOTE-CA-066 | workspace list stays complete | same occupancies | `appaloft workspace list` | still includes terminated/failed rows. |
| WS-REMOTE-DOCS-067 | Top-level help names occupancy door | any checkout | `appaloft --help` | usage includes `appaloft code` and `appaloft workspace` before durable `workspace open`. |
| WS-REMOTE-DOCS-068 | Top-level deploy locator is optional | any checkout | `appaloft --help` | deploy line is not a required `<path>`. |
| WS-REMOTE-CA-069 | TUI list uses occupancy identity | TTY + occupancy has repositoryIdentity | `appaloft workspace` | list row shows repo@short-sha, not only `sbx_*`. |
| WS-REMOTE-CA-070 | TUI list omits leftovers | TTY + occupancies include terminated/failed | `appaloft workspace` | TUI workspaces omit `terminated` and `failed`. |
| WS-REMOTE-CA-071 | Missing occupancy stays lean | Sandbox has no occupancy | TUI workspaces message | row keeps workspaceId/status; no invented repo. |
| WS-REMOTE-CA-072 | TUI detail copies Preview URL | occupancy Resource `app` has succeeded generated access | TUI detail | shows that URL. |
| WS-REMOTE-CA-073 | TUI detail copies last deployment | occupancy Resource `app` has lastDeploymentId | TUI detail | shows that id and status. |
| WS-REMOTE-CA-074 | Missing TUI chrome stays omitted | occupancy has projectId but Resource `app` has no preview/deploy | TUI detail | no invented URL or `dep_*`. |
| WS-REMOTE-CA-075 | TUI detail copies PR number | occupancy repo matches a preview-environment PR | TUI detail | shows `PR #n`. |
| WS-REMOTE-CA-076 | Missing PR stays omitted | occupancy has repo/branch but no preview-environment | TUI detail | no invented PR. |
| WS-REMOTE-CA-077 | Foreign PR stays out | preview-environment belongs to another repo | TUI detail | does not copy that PR. |
| WS-REMOTE-CA-078 | TUI detail copies Production URL | occupancy Resource `app` has `latestDurableDomainRoute` | TUI detail | shows that URL as Production. |
| WS-REMOTE-CA-079 | Missing Production stays omitted | occupancy has generated preview only | TUI detail | no invented Production URL. |
| WS-REMOTE-CA-080 | Preview is not Production | Resource has both generated and durable routes | TUI detail | Preview stays generated; Production stays durable. |
| WS-REMOTE-BANNER-081 | Code banner copies PR number | occupancy repo+sha match a preview-environment | `appaloft code --no-attach` | banner includes `PR #n`. |
| WS-REMOTE-BANNER-082 | Missing banner PR stays omitted | occupancy has no matching preview-environment | `appaloft code --no-attach` | existing banner; no invented PR. |
| WS-REMOTE-BANNER-083 | Foreign banner PR stays out | preview-environment belongs to another repo | `appaloft code --no-attach` | does not copy that PR. |
| WS-REMOTE-CA-084 | TUI detail copies GitHub PR URL | occupancy is `github.com/owner/repo` and PR matches | TUI detail | shows `https://github.com/owner/repo/pull/n`. |
| WS-REMOTE-CA-085 | Non-GitHub PR stays number-only | occupancy identity is not github.com | TUI detail | has `PR #n`; no invented host URL. |
| WS-REMOTE-CA-086 | Missing PR URL stays omitted | occupancy has no matching preview-environment | TUI detail | no invented pull URL. |
| WS-REMOTE-CA-087 | TUI `o` opens GitHub PR URL | selected detail has github pull URL | `o` | presentation launches that exact URL. |
| WS-REMOTE-CA-088 | Missing PR open stays lean | selected detail has no pull URL | `o` | no browser spawn; no invented URL. |
| WS-REMOTE-CA-089 | Foreign open-PR stays rejected | event URL is not the selected occupancy PR | `open-pr` | no browser spawn. |
| WS-REMOTE-CA-090 | TUI `p` opens Preview URL | selected detail has occupancy Preview URL | `p` | presentation launches that exact URL. |
| WS-REMOTE-CA-091 | TUI `P` opens Production URL | selected detail has occupancy Production URL | `P` | presentation launches that exact URL. |
| WS-REMOTE-CA-092 | Missing preview/production open stays lean | selected detail has no matching URL | `p` / `P` | no browser spawn. |
| WS-REMOTE-CA-093 | TUI `c` opens GitHub compare | selected occupancy has GitHub repo + branch and no PR URL | `c` | presentation launches `https://github.com/{owner}/{repo}/compare/{branch}?expand=1`. |
| WS-REMOTE-CA-094 | Existing PR compare stays on pull URL | selected occupancy already has GitHub PR URL | `c` | presentation launches that pull URL, not compare. |
| WS-REMOTE-CA-095 | Missing compare stays lean | missing branch / non-github occupancy | `c` | no browser spawn; no invented compare. |
| WS-REMOTE-CA-096 | Deliver Task prefills occupancy branch | selected occupancy has a branch | `d` Deliver Task | form branch is that occupancy branch; remote stays `origin`. |
| WS-REMOTE-CA-097 | Missing occupancy PR prefills PR title | occupancy has a branch and no PR | `d` Deliver Task | form PR title is that occupancy branch. |
| WS-REMOTE-CA-098 | Existing occupancy PR leaves PR fields blank | occupancy already has a PR | `d` Deliver Task | title/body/base stay empty. |
| WS-REMOTE-CA-099 | Deliver Task prefills occupancy commit | selected occupancy has a hex commitSha ≥ 7 | `d` Deliver Task | commit is `Deliver occupancy <shortSha>`. |
| WS-REMOTE-CA-100 | Missing occupancy SHA leaves commit blank | missing / non-hex / short SHA | `d` Deliver Task | commit stays empty; no invented SHA. |
| WS-REMOTE-BANNER-101 | Occupancy banner copies GitHub compare | occupancy has GitHub repo + branch and no PR | `appaloft code --no-attach` | banner includes `https://github.com/{owner}/{repo}/compare/{branch}?expand=1`. |
| WS-REMOTE-BANNER-102 | Existing PR banner stays PR-only | occupancy already has PR #n | `appaloft code --no-attach` | banner shows `PR #n` and no compare URL. |
| WS-REMOTE-BANNER-103 | Missing compare stays omitted | missing branch / non-github occupancy | `appaloft code --no-attach` | banner stays lean. |
| WS-REMOTE-BANNER-104 | Occupancy banner wraps Preview / Compare | occupancy has Preview + GitHub compare and no PR | `appaloft code --no-attach` | identity first line; Preview and compare each on their own following line. |
| WS-REMOTE-BANNER-105 | Existing PR wrap stays PR-only | occupancy already has PR #n | `appaloft code --no-attach` | second line is `PR #n` plus pull URL when available; no compare line. |
| WS-REMOTE-BANNER-106 | Lean banner stays one line | missing Preview / Compare / PR | `appaloft code --no-attach` | identity line only. |
| WS-REMOTE-OPEN-107 | `code --open` prefers Preview | occupancy has Preview URL | `appaloft code --no-attach --open` | presentation launches that Preview URL. |
| WS-REMOTE-OPEN-108 | `code --open` falls back to PR then compare | no Preview | `appaloft code --no-attach --open` | existing PR opens pull URL; otherwise GitHub compare. |
| WS-REMOTE-OPEN-109 | Missing occupancy open stays lean | no Preview / PR / compare | `appaloft code --no-attach --open` | no browser spawn. |
| WS-REMOTE-OPEN-110 | `--open-target preview` opens Preview only | occupancy has Preview | `appaloft code --no-attach --open-target preview` | presentation launches that Preview URL. |
| WS-REMOTE-OPEN-111 | `--open-target pr` opens pull URL only | occupancy has GitHub PR | `appaloft code --no-attach --open-target pr` | presentation launches that pull URL, not Preview. |
| WS-REMOTE-OPEN-112 | Missing chosen target stays lean | chosen target has no URL | `appaloft code --no-attach --open-target compare` | no fallback; no browser spawn. |
| WS-REMOTE-BANNER-113 | Occupancy banner copies Production | occupancy has durable Production URL | `appaloft code --no-attach` | Production follows Preview on its own line. |
| WS-REMOTE-OPEN-114 | `--open-target production` opens Production only | occupancy has Production | `appaloft code --no-attach --open-target production` | presentation launches that Production URL, not Preview. |
| WS-REMOTE-OPEN-115 | Missing Production target stays lean | no durable Production URL | `appaloft code --no-attach --open-target production` | no fallback; no browser spawn. |
| WS-REMOTE-BANNER-116 | Occupancy banner labels Preview / Production | occupancy has Preview + Production | `appaloft code --no-attach` | lines are `Preview · <url>` and `Production · <url>`. |
| WS-REMOTE-BANNER-117 | Occupancy banner labels Compare | occupancy has GitHub compare and no PR | `appaloft code --no-attach` | compare line is `Compare · <url>`. |
| WS-REMOTE-BANNER-118 | Existing PR line stays `PR #n` | occupancy already has PR #n | `appaloft code --no-attach` | PR line stays `PR #n · <url>`; no Compare line. |
| WS-REMOTE-HINT-119 | Occupancy door hint follows the banner | remote `code --no-attach` | `appaloft code --no-attach` | one line names `--open-target` and `workspace` `p`/`P`/`o`/`c`. |
| WS-REMOTE-HINT-120 | Occupancy door hint stays before the model hint | remote `code --no-attach` | `appaloft code --no-attach` | door hint prints, then the existing model hint. |
| WS-REMOTE-HINT-121 | Scratch `--local` stays unlabeled | `--local` scratch session | `appaloft code --local --no-attach` | no occupancy door hint. |
| WS-REMOTE-HINT-122 | Available-door hint lists only present URLs | occupancy has Preview + PR | `appaloft code --no-attach` | hint names `preview`/`p` and `pr`/`o`, not production or compare. |
| WS-REMOTE-HINT-123 | Existing PR omits compare from the hint | occupancy has GitHub PR | `appaloft code --no-attach` | hint has `pr`/`o`, not `compare`/`c`. |
| WS-REMOTE-HINT-124 | No available door stays lean | no Preview / Production / PR / compare | `appaloft code --no-attach` | no occupancy door hint. |
| WS-REMOTE-CA-125 | TUI footer lists only present occupancy doors | occupancy has Preview + PR | `appaloft workspace` | footer names `p preview` and `o open PR`, not production or compare. |
| WS-REMOTE-CA-126 | Existing PR omits compare from the TUI footer | occupancy has GitHub PR | `appaloft workspace` | footer has `o open PR`, not `c compare`. |
| WS-REMOTE-CA-127 | No available door keeps a lean TUI footer | no Preview / Production / PR / compare | `appaloft workspace` | footer keeps lifecycle / delivery / recovery / focus, no occupancy door keys. |

## Slice Scope

Slice 1-41 shipped.

Slice 42 (this ticket): `appaloft workspace` names only the occupancy doors that exist.

In slice 42:

- TUI footer lists only present Preview / Production / PR / compare;
- existing PR omits compare from the footer;
- no available door stays lean.

Out of slice 42: catalog create-PR write, team Connection, Cloud managed default Server.


## Public Surfaces

- CLI: default `appaloft code [path|git-remote] [--no-attach] [--local]`. A git remote is a locator, not a local path.
- Catalog: no new field. Existing `workspaces.open` already takes credential-free HTTPS.
- Persistence: existing Server / Binding / Profile / `workspace_open_entries`.
- No new aggregate or Cloud table.


## Domain Ownership

- Server, Sandbox, Binding, Profile: existing public aggregates.
- CLI resolves login, default Server, and remote SHA (from cwd origin **or** positional git remote), then dispatches `workspaces.open`.
- Community initializer owns invisible `appaloft-remote`.
- Cloud: later default-Server injection when no BYOS exists. Must honor `targetServerId` and must not override it with managed capacity. Slice 3 needs no Cloud change.

## Error Contract

| Code | When |
| --- | --- |
| `workspace_remote_login_required` | not logged in |
| `workspace_remote_server_missing` | no default Server |
| `workspace_remote_repository_missing` | no Git origin, no explicit remote locator, and no resumable occupancy |
| `workspace_remote_default_ref_unavailable` | remote HEAD does not map to one `refs/heads/*` |
| `workspace_git_ref_ambiguous` | remote HEAD maps to more than one head |
| `workspace_scratch_remote_rejected` | `--local` with a git-remote locator |
| `workspace_open_target_server_unavailable` | `targetServerId` is not tenant-visible or not reservable |
| existing `workspace_git_*` | `workspace open` / `workspace create` only |
| Spec 138 scratch codes | `--local` path Scratch only |

Missing Binding is not a `code` hard failure. The initializer creates or reuses it.

## Non-Goals

- Implementing `ca` in the same ticket as occupancy or URL locator.
- Shared personal OAuth.
- Dirty-tree upload.
- New Host aggregate.
- Deleting Scratch; only keep it behind `--local`.
- Adding Server to the preferred unique index.
- Cloud managed as default Server when no BYOS exists.
- `destinations.list` or expanding `servers.show` with destinations.
- Parsing GitHub `/tree/` URLs or inferring non-GitHub hosts from `owner/repo`.

## Compatibility

- Spec 138 / ADR-116: Scratch lives under `--local`.
- ADR-117 identity-only attach is superseded by ADR-118 occupancy.
- ADR-119 extends the occupancy locator; it does not change Sandbox identity.
- ADR-120 lets omitted `deployments.plan` destinationId resolve Server `default`.
- Users who adopted cwd-origin `code` keep that path. URL is additive.
- Expected SemVer: public minor. Changelog must say omitted plan destination resolves Server `default`.

