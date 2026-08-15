# Instant Local Scratch Test Matrix

| ID | Layer | Scenario | Expected evidence | Planned automated binding | Status |
| --- | --- | --- | --- | --- | --- |
| WS-SCRATCH-CLI-001 | CLI/unit | default `appaloft code` | No `OpenAgentWorkspaceCommand`; no Git fail-closed. | `packages/adapters/cli/test/agent-workspace-command.test.ts` | passing |
| WS-SCRATCH-EMPTY-002 | CLI/unit | empty non-git directory | Scratch resolution succeeds; no Binding/Profile/Sandbox dispatch. | `packages/adapters/cli/test/agent-workspace-command.test.ts` | passing |
| WS-SCRATCH-DIRTY-003 | CLI/unit | dirty / detached / unpushed tree | Scratch starts; no upload; no `workspace_git_dirty` on `code`. | `packages/adapters/cli/test/agent-workspace-command.test.ts` | passing |
| WS-SCRATCH-LOGGED-OUT-004 | CLI/unit | no Appaloft login | Scratch starts; no control-plane handshake. | `packages/adapters/cli/test/agent-workspace-command.test.ts` | passing |
| WS-SCRATCH-BANNER-005 | CLI/unit | resolved scratch | Banner text `Local scratch · this Mac · not saved remotely`. | `packages/adapters/cli/test/agent-workspace-command.test.ts` | passing |
| WS-SCRATCH-HARNESS-006 | CLI/unit | binary probe | OpenCode if present, else Pi, else install prompt. | `packages/adapters/cli/test/agent-workspace-command.test.ts`; `local-scratch-session.test.ts` | passing |
| WS-SCRATCH-INSTALL-007 | CLI/unit | no binary, user refuses | `workspace_scratch_install_refused`; no mutation. | `packages/adapters/cli/test/agent-workspace-command.test.ts` | passing |
| WS-SCRATCH-ATTACH-008 | CLI/integration | supported binary, attach on | Native argv spawn in selected dir; no Sandbox attach. | `packages/adapters/cli/test/agent-workspace-command.test.ts` | passing |
| WS-SCRATCH-NO-ATTACH-009 | CLI/unit | `--no-attach` | Banner + harness printed; exit without `workspaces.open`. | `packages/adapters/cli/test/agent-workspace-command.test.ts` | passing |
| WS-SCRATCH-SKILL-010 | CLI/unit | scratch launch prep | Public skill/MCP offer recorded; no TUI scrape. | `packages/adapters/cli/test/local-scratch-session.test.ts`; `agent-workspace-command.test.ts` | passing |
| WS-SCRATCH-MUTATION-011 | CLI/contract | in-session write request | Only existing catalog operations; no auto-approve. | later-slice / skill docs; slice 1 documents the rule | deferred-gap until linked session |
| WS-SCRATCH-NO-STATE-012 | CLI/unit | start and exit | Zero Sandbox/Binding/Project/Profile/Server commands. | `packages/adapters/cli/test/agent-workspace-command.test.ts` | passing |
| WS-SCRATCH-COMPAT-013 | CLI/regression | `workspace open` dirty/non-git | Existing `workspace_git_*` fail-closed unchanged. | `packages/adapters/cli/test/agent-workspace-command.test.ts` | passing |
| WS-SCRATCH-UPGRADE-014 | CLI/unit | logged-in entitled default `code` | Still scratch; no managed initializer. | `packages/adapters/cli/test/agent-workspace-command.test.ts` | passing |
| WS-SCRATCH-MANAGED-015 | application | explicit remote/managed open | Existing `workspaces.open` / no-capacity fail-closed. | existing Spec 131 / R1.1 tests remain | later-slice reconnect |
| WS-SCRATCH-PROFILE-016 | CLI/unit | first scratch without `--profile` | No Profile install/write. | `packages/adapters/cli/test/agent-workspace-command.test.ts` | passing |
| WS-SCRATCH-DOCS-017 | docs/contract | help and Workspace docs | Scratch default vs durable `workspace open`. | `packages/docs-registry/test/help-topics.test.ts`; `packages/adapters/cli/test/docs-help.test.ts` | passing |
| WS-SCRATCH-PACKAGE-018 | packaging/CLI | `appaloftdev code --help` | Help without persistence/runtime composition. | `apps/shell/test/help-without-runtime.test.ts`; source-CLI smoke | passing |

Slice 1 source-CLI acceptance after Code:

```text
appaloftdev code --help
mkdir -p /tmp/appaloft-scratch-empty && appaloftdev code /tmp/appaloft-scratch-empty --no-attach
# dirty dir and logged-out dir: same command; banner present; no Binding/Profile/Cloud
```
