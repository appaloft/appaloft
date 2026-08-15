# Remote Agent Door Test Matrix

Governing spec: [139-remote-agent-door](../specs/139-remote-agent-door/spec.md).

| ID | Kind | Status | Proof |
| --- | --- | --- | --- |
| WS-REMOTE-LOGIN-001 | unit / CLI | automated | `remote-code-session.test.ts`, `agent-workspace-command.test.ts` |
| WS-REMOTE-SERVER-002 | unit | automated | `remote-code-session.test.ts` |
| WS-REMOTE-OPEN-003 | CLI | automated + `appaloftdev` | default `code` prints Remote banner and native-attaches; no `workspaces.open` |
| WS-REMOTE-RESUME-004 | later | deferred | subject+Server+Binding occupancy on `workspace open` |
| WS-REMOTE-OCCUPY-005 | later | deferred | second subject gets another Sandbox |
| WS-REMOTE-NO-UPLOAD-006 | CLI | automated | local Git fail-closed not used |
| WS-REMOTE-BINDING-007 | unit / smoke | automated + `appaloftdev` | missing Binding still native-attaches |
| WS-REMOTE-BANNER-014 | CLI | automated | identity banner, no deploy HUD |
| WS-REMOTE-PROFILE-008 | CLI | automated | default `code` does not require tenant Profile |
| WS-REMOTE-AUTH-009 | later | deferred | no teammate OAuth copy |
| WS-REMOTE-LOCAL-010 | CLI | automated + `appaloftdev` | `--local` Scratch |
| WS-REMOTE-OPEN-COMPAT-011 | smoke | `appaloftdev workspace open` | non-git still `workspace_git_*` |
| WS-REMOTE-CAPACITY-012 | later | deferred | no-capacity ≠ Scratch |
| WS-REMOTE-DOCS-013 | help | automated + `appaloftdev code --help` | remote default + `--local` |
