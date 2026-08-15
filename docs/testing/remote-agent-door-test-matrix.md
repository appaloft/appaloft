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
| WS-REMOTE-MCP-DISCOVERY-021 | application / runtime | automated | first-party occupancy MCP unions list/show/create discovery tools; tenant MCP unchanged | `packages/application/test/sandbox-agent-mcp-access.test.ts`; `packages/server/test/community-remote-default-profile.test.ts` |


