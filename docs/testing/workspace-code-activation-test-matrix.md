# Workspace Code Activation Test Matrix

Historical Spec 125 rows. After ADR-117 / Spec 139, default `appaloft code` is the
remote identity door (`docs/testing/remote-agent-door-test-matrix.md`). These
`WS-CODE-*` rows now govern `appaloft workspace open` only.

| ID | Layer | Scenario | Expected evidence | Planned automated binding | Status |
| --- | --- | --- | --- | --- | --- |
| WS-CODE-CLI-001 | CLI/unit | `appaloft workspace open` defaults path to `.` | Top-level durable command resolves repository context without an internal Workspace id. | `packages/adapters/cli/test/agent-workspace-command.test.ts` | passing |
| WS-CODE-PARITY-002 | CLI/contract | `workspace open` remains the durable `workspaces.open` path | Default `code` no longer constructs `workspaces.open`; durable open/create still do. | `packages/adapters/cli/test/agent-workspace-command.test.ts`; `packages/application/test/operation-catalog-boundary.test.ts` | passing |
| WS-CODE-LOCAL-003 | CLI/integration | No remote control-plane target is selected | Existing resolver chooses local dispatch without remote handshake, SSH state sync or target registration. | `packages/adapters/cli/test/control-plane-client.test.ts` | passing |
| WS-CODE-PREFLIGHT-004 | CLI/unit | Dirty, detached, missing/mismatched upstream, unpushed repository, or remote Git timeout | Existing Git error and guidance return before application dispatch. Remote inspection prints progress and fails closed on timeout. | `packages/adapters/cli/test/local-git-workspace-context.test.ts`; `packages/adapters/cli/test/agent-workspace-command.test.ts` | passing |
| WS-CODE-PROFILE-005 | CLI/application | Explicit or Project-default Agent Workspace Profile | Existing exact Profile resolution runs; no second preference file is written. | `packages/adapters/cli/test/agent-workspace-command.test.ts`; `packages/application/test/agent-workspace-open-preflight.test.ts` | passing |
| WS-CODE-ATTACH-006 | CLI/terminal | Managed-terminal or native attach capability is returned | Existing native Agent interface opens without name branching, shell injection or terminal scraping. | `packages/adapters/cli/test/agent-workspace-command.test.ts` | passing |
| WS-CODE-RESUME-007 | CLI/application | Matching preferred Workspace and Terminal Session exist | Repeated activation resumes the same Workspace/Runtime and bounded replay path. | `packages/adapters/cli/test/agent-workspace-command.test.ts`; `packages/application/test/agent-workspace-open.test.ts` | passing |
| WS-CODE-OPTIONS-008 | CLI/unit | `--profile`, `--new` or `--no-attach` is supplied to `workspace open` | Options map exactly to existing Workspace open input and invalid combinations fail before mutation. | `packages/adapters/cli/test/agent-workspace-command.test.ts` | passing |
| WS-CODE-ERROR-009 | CLI/contract | Pre-effect or post-identity failure occurs | Existing structured error/evidence passes through with no secret, raw host or credential disclosure. | `packages/adapters/cli/test/agent-workspace-command.test.ts` | passing |
| WS-CODE-COMPAT-010 | CLI/regression | Existing Workspace commands are invoked | `workspace open/create/list/show/connect/attach/...` keep their current registration and behavior. | `packages/adapters/cli/test/agent-workspace-command.test.ts` | passing |
| WS-CODE-PACKAGE-011 | packaging/CLI | Supported packaged artifact is executed | `appaloft code --help` starts without persistence/runtime composition and documents the first-slice options. | `apps/shell/test/help-without-runtime.test.ts`; host release-bundle smoke | passing |
| WS-CODE-DOCS-012 | docs/contract | Workspace activation help is resolved | Both locales and traceability resolve `agent-workspace-open`, `appaloft code`, compatibility command, prerequisites and recovery. | `packages/docs-registry/test/help-topics.test.ts`; `packages/adapters/cli/test/docs-help.test.ts`; docs build/link checks | passing |

## Future Workspace Control TUI Spike Gates

These rows were the disposable renderer-selection gates and are not production acceptance for the
`appaloft code` Code Round. Spec 126 selected the replaceable Rust/Ratatui frontend after the
OpenTUI candidate failed its released-API and bounded-teardown gates; final production evidence is
owned by `docs/testing/workspace-control-tui-test-matrix.md`.

| ID | Layer | Scenario | Required evidence | Status |
| --- | --- | --- | --- | --- |
| WS-TUI-SPIKE-001 | spike/packaging | Candidate frontend enters the supported release bundle | Runnable supported macOS/Linux artifacts use the real release path. | selection complete: OpenTUI rejected; Spec 126 Ratatui six-target release evidence passed |
| WS-TUI-SPIKE-002 | spike/PTY | Native Agent alternate screen is embedded | Agent-owned PTY renders without terminal scraping or a duplicated conversation model. | selection complete: OpenTUI public renderable unavailable; Spec 126 `WS-TUI-EMBED-004` passed with Ratatui |
| WS-TUI-SPIKE-003 | spike/terminal | Resize, mouse, paste, focus and signals are exercised | Input ownership and terminal restoration are deterministic. | selection complete: candidate evidence recorded in #1024; production evidence moved to `WS-TUI-FOCUS-005` and `WS-TUI-TERMINAL-012` |
| WS-TUI-SPIKE-004 | spike/rendering | CJK, emoji and wide characters render | Cursor position and width behavior remain correct. | selection complete: candidate passed; production Unicode/VT evidence is `WS-TUI-TERMINAL-012` |
| WS-TUI-SPIKE-005 | spike/reconnect | Transport disconnects and reconnects | Bounded replay resumes without restarting a healthy Agent process. | selection complete: production evidence moved to `WS-TUI-RECONNECT-007` |
| WS-TUI-SPIKE-006 | spike/terminal-matrix | Supported terminal applications are exercised | Required interactions pass on the documented terminal matrix. | selection complete; production host matrix remains governed by `WS-TUI-TERMINAL-012` |
| WS-TUI-SPIKE-007 | spike/fallback | TUI startup is unavailable | `--no-tui` and headless/machine-readable Workspace operations remain usable. | selection complete: candidate passed; production evidence is `WS-TUI-FALLBACK-009` |
| WS-TUI-SPIKE-008 | spike/focus-mode | Embedded Agent is maximized and returned | The same live Session/PTY and Agent process survive embedded to native full-screen round-trip. | selection complete: production evidence moved to `WS-TUI-FULLSCREEN-006` |
| WS-TUI-SPIKE-009 | spike/soak | Agent produces sustained and burst output | 30-60 minute soak remains within recorded CPU/memory/input-latency limits with no screen corruption. | candidate inconclusive and rejected; it does not govern the selected frontend. Production correctness remains governed by Spec 126 and `WS-TUI-TERMINAL-012` |
