# Remote Agent Door Test Matrix

Governing spec: [139-remote-agent-door](../specs/139-remote-agent-door/spec.md).

| ID | Kind | Status | Proof |
| --- | --- | --- | --- |
| WS-REMOTE-LOGIN-001 | unit / CLI | automated | `remote-code-session.test.ts`, `agent-workspace-command.test.ts` |
| WS-REMOTE-SERVER-002 | unit | automated | `remote-code-session.test.ts` |
| WS-REMOTE-OPEN-003 | CLI / application | this slice | default `code` dispatches `workspaces.open` with remote SHA + `targetServerId` |
| WS-REMOTE-RESUME-004 | application | this slice | same subject resumes preferred Sandbox |
| WS-REMOTE-OCCUPY-005 | application / persistence | this slice | second subject gets another preferred Sandbox |
| WS-REMOTE-NO-UPLOAD-006 | CLI | automated | local Git fail-closed not used on `code` |
| WS-REMOTE-BINDING-007 | application / smoke | this slice | missing Binding is initialized, then occupy |
| WS-REMOTE-BANNER-014 | CLI | this slice | identity banner includes `workspaceId` |
| WS-REMOTE-PROFILE-008 | application / runtime | this slice | missing default Profile installs `appaloft-remote` with optional `model-api`; OpenCode occupancy starts without a required model-api binding |
| WS-REMOTE-AUTH-009 | runtime / CLI | automated | no model binding starts vendor-login OpenCode; `COMMUNITY_REMOTE_DEFAULT_NETWORK_POLICY` includes `opencode.ai`; `sandbox template create --network-policy remote-default` registers that exact allowlist; mismatched occupancy templates fail closed with that recovery command; teammate OAuth is not copied | `packages/server/test/community-remote-default-profile.test.ts`; `packages/adapters/cli/test/execution-sandbox-command.test.ts`; `packages/core/test/execution-sandbox-template.test.ts` |
| WS-REMOTE-LOCAL-010 | CLI | automated + `appaloftdev` | `--local` Scratch |
| WS-REMOTE-OPEN-COMPAT-011 | smoke | `appaloftdev workspace open` | non-git still `workspace_git_*` |
| WS-REMOTE-TEMPLATE-019 | application / runtime | automated | reserved `stp_appaloft_remote_opencode` is ensured on occupancy create; matching reuse; mismatch fail-closed; Cloud/Community register OpenCode without env | `packages/application/test/execution-sandbox-operations.test.ts`; `apps/cloud-runtime/test/cloud-execution-sandbox-api.test.ts`; `apps/cloud-runtime/test/cloud-workspace-activation-context-initializer.test.ts` |

| WS-REMOTE-CAPACITY-012 | application | this slice | no-capacity ≠ Scratch ≠ other Server |
| WS-REMOTE-DOCS-013 | help | this slice | occupy default + `--local` |
| WS-REMOTE-TARGET-015 | application | this slice | `targetServerId` is reserved |
| WS-REMOTE-NO-ATTACH-016 | CLI + `appaloftdev` | this slice | occupy without attach; sandbox list non-empty |
| WS-REMOTE-SKILL-017 | CLI / runtime | automated | occupancy OpenCode serve config includes workspace skill paths; `appaloft-remote` declares optional `appaloft-tools`; native attach uses `mcp remote-stdio` against the selected control plane without wrapping `APPALOFT_CONTROL_PLANE_MODE=none`, and isolates `XDG_CONFIG_HOME` from a broken host `opencode.json` | `packages/adapters/cli/test/local-scratch-session.test.ts` |

| WS-REMOTE-RESUME-SERVE-018 | application | this slice | resume `code --no-attach` calls `ensureRuntime` so OpenCode serve is healthy |
| WS-REMOTE-RESUME-EGRESS-020 | application | automated | ready allowlist occupancy resume reapplies stored egress; gateway failure fail-closes | `packages/application/test/execution-sandbox-operations.test.ts` |
| WS-REMOTE-MCP-DISCOVERY-021 | application / runtime | automated | first-party occupancy MCP unions list/create/configure/plan/create/show/proof/timeline/preview/deliver tools; tenant MCP unchanged | `packages/application/test/sandbox-agent-mcp-access.test.ts`; `packages/server/test/community-remote-default-profile.test.ts` |
| WS-REMOTE-GITHUB-DELIVERY-022 | runtime | automated | occupancy OpenCode serve injects GitHub token as GH_TOKEN; argv stays clean | `packages/adapters/runtime/test/opencode-sandbox-agent-harness.test.ts` |
| WS-REMOTE-MCP-TENANT-023 | HTTP / MCP | automated | occupancy `/mcp` remaps product-session org to hosted tenant before `sandbox_ports_expose` | `packages/adapters/http-elysia/test/mcp-http.test.ts` |
| WS-REMOTE-URL-024 | CLI / unit + `appaloftdev` | automated | positional `https://` / `ssh://` / `git@` occupies without a local clone | `packages/adapters/cli/test/remote-code-session.test.ts`; live `appaloftdev code https://github.com/octocat/Hello-World.git --no-attach` → `sbx_hdphcqv7jazu` |
| WS-REMOTE-URL-HEAD-025 | CLI / unit | automated | remote HEAD maps to one `refs/heads/*`; zero/many fail closed | `packages/adapters/cli/test/remote-code-session.test.ts` |
| WS-REMOTE-URL-WINS-026 | CLI / unit | automated | URL of B does not resume occupancy of A | `packages/adapters/cli/test/remote-code-session.test.ts` |
| WS-REMOTE-URL-LOCAL-027 | CLI / unit + `appaloftdev` | automated | `--local` + git-remote fail closed | `packages/adapters/cli/test/agent-workspace-command.test.ts`; live `workspace_scratch_remote_rejected` |
| WS-REMOTE-URL-SHORTHAND-028 | CLI / unit | automated | `org/repo` is a local path, not github.com | `packages/adapters/cli/test/remote-code-session.test.ts` |
| WS-REMOTE-URL-DOCS-029 | help | automated | `code --help` / skill name the URL door | `packages/adapters/cli/test/docs-help.test.ts`; `appaloftdev code --help` |
| WS-REMOTE-DEST-030 | application + `appaloftdev` | automated | omitted `deployments.plan` destinationId uses Server `default` | `packages/application/test/deployment-plan-preview.test.ts`; live occupancy plan without `--destination` |
| WS-REMOTE-DEST-031 | application | automated | resource pin wins when present | `packages/application/test/deployment-plan-preview.test.ts` |
| WS-REMOTE-DEST-032 | application | automated | missing Server `default` fail-closed; plan creates nothing | `packages/application/test/deployment-plan-preview.test.ts` |
| WS-REMOTE-CA-033 | CLI / unit + `appaloftdev` | this slice | headless `workspace --json` prints occupancy tree | `packages/adapters/cli/test/agent-workspace-command.test.ts`; live `appaloftdev workspace --json` |
| WS-REMOTE-CA-034 | CLI / unit | this slice | `--no-tui` prints the same tree and does not start TUI | `packages/adapters/cli/test/agent-workspace-command.test.ts` |
| WS-REMOTE-CA-035 | CLI / unit | this slice | interactive `workspace` still starts TUI | `packages/adapters/cli/test/agent-workspace-command.test.ts` |
| WS-REMOTE-CA-036 | CLI / unit + `appaloftdev` | this slice | occupancy tree includes activation `projectId` | `packages/adapters/cli/test/agent-workspace-command.test.ts`; live `appaloftdev workspace --json` |
| WS-REMOTE-CA-037 | CLI / unit | this slice | missing activation invents no projectId | `packages/adapters/cli/test/agent-workspace-command.test.ts` |
| WS-REMOTE-CTX-038 | application + `appaloftdev` | this slice | omitted plan project/env resolve from Resource | `packages/application/test/deployment-plan-preview.test.ts`; live plan `--resource --server` |
| WS-REMOTE-CTX-039 | application | this slice | omitted resourceId fail-closed | `packages/application/test/deployment-plan-preview.test.ts` |
| WS-REMOTE-ENV-040 | application + `appaloftdev` | this slice | occupancy creates Environment `local` when missing | `packages/application/test/community-workspace-activation-context-initializer.test.ts`; live `env list` |
| WS-REMOTE-ENV-041 | application | this slice | existing `local` Environment is reused | `packages/application/test/community-workspace-activation-context-initializer.test.ts` |
| WS-REMOTE-RES-042 | application + `appaloftdev` | this slice | occupancy creates Resource `app` when missing | `packages/application/test/community-workspace-activation-context-initializer.test.ts`; live `resource list` |
| WS-REMOTE-RES-043 | application | this slice | existing Resource `app` is reused | `packages/application/test/community-workspace-activation-context-initializer.test.ts` |
| WS-REMOTE-NET-044 | application + `appaloftdev` | this slice | occupancy default network is `3000` / `http` / `reverse-proxy` | `packages/application/test/community-workspace-activation-context-initializer.test.ts`; live `deployments plan --resource --server` |
| WS-REMOTE-NET-045 | application | this slice | existing Resource network is reused | `packages/application/test/community-workspace-activation-context-initializer.test.ts` |
| WS-REMOTE-PLAN-046 | runtime + `appaloftdev` | this slice | remote-git without Dockerfile fail-closed | `packages/adapters/runtime/test/runtime-plan-resolver.test.ts`; live `deployments plan --resource --server` |
| WS-REMOTE-PLAN-047 | runtime | this slice | remote-git Dockerfile evidence still wins | `packages/adapters/runtime/test/runtime-plan-resolver.test.ts` |
| WS-REMOTE-INSPECT-048 | filesystem + `appaloftdev` | this slice | remote-git occupancy inspects a single-app remote | `packages/adapters/filesystem/test/source-detector.test.ts`; live occupy of a root-Dockerfile repo |
| WS-REMOTE-INSPECT-049 | filesystem + `appaloftdev` | this slice | monorepo remote-git asks for baseDirectory | `packages/adapters/filesystem/test/source-detector.test.ts`; live `deployments plan` on occupied `appaloft/examples` |
| WS-REMOTE-PREVIEW-050 | CLI + `appaloftdev` | this slice | occupancy tree copies live generated Preview URL | `packages/adapters/cli/test/agent-workspace-command.test.ts`; live `workspace --json` after hello create |
| WS-REMOTE-PREVIEW-051 | CLI | this slice | missing generated access stays omitted | `packages/adapters/cli/test/agent-workspace-command.test.ts` |
| WS-REMOTE-DEPLOY-052 | CLI + `appaloftdev` | this slice | occupancy deploy reuses Resource `app` | `packages/adapters/cli/test/deployment-create-command.test.ts`; live `deploy <git-remote>` after occupy |
| WS-REMOTE-DEPLOY-053 | CLI | this slice | missing occupancy Resource stays fail-closed when non-interactive | `packages/adapters/cli/test/deployment-create-command.test.ts` |
| WS-REMOTE-EXPOSE-054 | filesystem + application + `appaloftdev` | this slice | occupancy uses a single Dockerfile EXPOSE | `packages/adapters/filesystem/test/source-detector.test.ts`; `packages/application/test/community-workspace-activation-context-initializer.test.ts`; live occupy of `traefik/whoami` |
| WS-REMOTE-EXPOSE-055 | filesystem + application | this slice | missing or multiple EXPOSE keeps 3000 | `packages/adapters/filesystem/test/source-detector.test.ts`; `packages/application/test/community-workspace-activation-context-initializer.test.ts` |
| WS-REMOTE-URL-SHORTHAND-028 | CLI + `appaloftdev` | this slice | `owner/repo` occupies GitHub HTTPS | `packages/adapters/cli/test/remote-code-session.test.ts`; live `code traefik/whoami` after occupying examples |
| WS-REMOTE-URL-SHORTHAND-056 | CLI | this slice | existing local `owner/repo` directory stays a path | `packages/adapters/cli/test/remote-code-session.test.ts` |
| WS-REMOTE-DEPLOY-057 | CLI + `appaloftdev` | this slice | bare `deploy` reuses latest occupancy Resource `app` | `packages/adapters/cli/test/deployment-create-command.test.ts`; live `deploy` after occupying whoami |
| WS-REMOTE-DEPLOY-058 | CLI | this slice | bare `deploy` without occupancy fail-closed when non-interactive | `packages/adapters/cli/test/deployment-create-command.test.ts` |
| WS-REMOTE-DEPLOY-059 | CLI + `appaloftdev` | this slice | occupancy `deploy` prints generated access URL | `packages/adapters/cli/test/deployment-create-command.test.ts`; live `deploy` after occupying whoami |
| WS-REMOTE-DEPLOY-060 | CLI | this slice | missing generated URL stays omitted | `packages/adapters/cli/test/deployment-create-command.test.ts` |
| WS-REMOTE-BANNER-061 | CLI + `appaloftdev` | this slice | occupancy `code` banner includes generated access URL | `packages/adapters/cli/test/remote-code-session.test.ts`; live `code --no-attach` after occupying+deploying whoami |
| WS-REMOTE-BANNER-062 | CLI | this slice | missing generated access keeps existing banner | `packages/adapters/cli/test/remote-code-session.test.ts` |
| WS-REMOTE-DEPLOY-063 | CLI + `appaloftdev` | this slice | occupancy tree includes last deployment id/status | `packages/adapters/cli/test/agent-workspace-command.test.ts`; live `workspace --json` after occupying+deploying whoami |
| WS-REMOTE-DEPLOY-064 | CLI | this slice | missing last deployment stays omitted | `packages/adapters/cli/test/agent-workspace-command.test.ts` |
| WS-REMOTE-CA-065 | CLI + `appaloftdev` | this slice | occupancy tree omits terminated/failed leftovers | `packages/adapters/cli/test/agent-workspace-command.test.ts`; live `workspace --json` after occupying whoami |
| WS-REMOTE-CA-066 | CLI | this slice | `workspace list` still includes terminated/failed | `packages/adapters/cli/test/agent-workspace-command.test.ts` |
| WS-REMOTE-DOCS-067 | CLI + `appaloftdev` | this slice | top-level help names occupancy door | `packages/adapters/cli/test/standalone-control-plane.test.ts` or equivalent; live `appaloftdev --help` |
| WS-REMOTE-DOCS-068 | CLI | this slice | top-level deploy locator is optional | same help test |
| WS-REMOTE-CA-069 | TUI / unit | this slice | TUI list uses occupancy repo@sha | `workspace-control-presentation.test.ts`; workspace-control-tui |
| WS-REMOTE-CA-070 | TUI / unit | this slice | TUI list omits terminated/failed | same presentation test |
| WS-REMOTE-CA-071 | TUI / unit | this slice | missing occupancy stays lean | same presentation test |
| WS-REMOTE-CA-072 | TUI / unit | this slice | TUI detail copies Preview URL | `workspace-control-presentation.test.ts`; workspace-control-tui |
| WS-REMOTE-CA-073 | TUI / unit | this slice | TUI detail copies last deployment | same presentation test |
| WS-REMOTE-CA-074 | TUI / unit | this slice | missing TUI chrome stays omitted | same presentation test |
| WS-REMOTE-CA-075 | TUI / unit | this slice | TUI detail copies matching PR | `workspace-control-presentation.test.ts`; workspace-control-tui |
| WS-REMOTE-CA-076 | TUI / unit | this slice | missing PR stays omitted | same presentation test |
| WS-REMOTE-CA-077 | TUI / unit | this slice | foreign PR stays out | same presentation test |
| WS-REMOTE-CA-078 | TUI / unit | this slice | TUI detail copies Production URL | `occupancy-chrome.test.ts`; workspace-control-tui |
| WS-REMOTE-CA-079 | TUI / unit | this slice | missing Production stays omitted | same chrome test |
| WS-REMOTE-CA-080 | TUI / unit | this slice | generated preview is not Production | same chrome test |
| WS-REMOTE-BANNER-081 | CLI / unit | this slice | `code` banner copies matching PR | `remote-code-session.test.ts` |
| WS-REMOTE-BANNER-082 | CLI / unit | this slice | missing banner PR stays omitted | same banner test |
| WS-REMOTE-BANNER-083 | CLI / unit | this slice | foreign banner PR stays out | same banner test |
| WS-REMOTE-CA-084 | TUI / unit | this slice | TUI detail copies GitHub PR URL | `occupancy-chrome.test.ts`; workspace-control-tui |
| WS-REMOTE-CA-085 | TUI / unit | this slice | non-GitHub PR stays number-only | same chrome test |
| WS-REMOTE-CA-086 | TUI / unit | this slice | missing PR URL stays omitted | same chrome test |
| WS-REMOTE-CA-087 | TUI / unit | this slice | `o` opens selected GitHub PR URL | `workspace-control-presentation.test.ts`; workspace-control-tui |
| WS-REMOTE-CA-088 | TUI / unit | this slice | missing PR open stays lean | same presentation test |
| WS-REMOTE-CA-089 | TUI / unit | this slice | foreign open-PR stays rejected | same presentation test |
| WS-REMOTE-CA-090 | TUI / unit | this slice | `p` opens selected Preview URL | `workspace-control-presentation.test.ts`; workspace-control-tui |
| WS-REMOTE-CA-091 | TUI / unit | this slice | `P` opens selected Production URL | same presentation test |
| WS-REMOTE-CA-092 | TUI / unit | this slice | missing preview/production open stays lean | same presentation test |
| WS-REMOTE-CA-093 | TUI / unit | this slice | `c` opens GitHub compare for occupancy branch | `occupancy-chrome.test.ts`; `workspace-control-presentation.test.ts`; workspace-control-tui |
| WS-REMOTE-CA-094 | TUI / unit | this slice | existing PR compare stays on pull URL | same presentation test |
| WS-REMOTE-CA-095 | TUI / unit | this slice | missing compare stays lean | same presentation test |




