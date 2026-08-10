# Workspace Control TUI Test Matrix

| ID | Layer | Scenario | Expected evidence | Planned binding | Status |
| --- | --- | --- | --- | --- | --- |
| WS-TUI-ENTRY-001 | CLI/unit | Interactive `appaloft workspace` has no subcommand | Renderer starts after target resolution with no mutation. | CLI command tests | planned |
| WS-TUI-QUERY-002 | CLI/contract | Shell loads and refreshes Workspaces | Only bounded existing operation facade calls occur; no repository/TUI store exists. | CLI control-presentation tests + import boundary | planned |
| WS-TUI-DETAIL-003 | CLI/unit | User selects a Workspace | Existing safe Workspace/Profile/Server/Runtime/Terminal/Preview/Task fields render without invented truth. | presentation snapshot/state tests | planned |
| WS-TUI-HANDOFF-004 | CLI/PTY | Selected Adapter supports attach | Outer renderer releases the terminal before the unchanged native attach bridge owns I/O; no output parser exists. | fake attach + PTY integration | planned |
| WS-TUI-RETURN-005 | CLI/PTY | Native attach returns or disconnects | Terminal restores and exact Workspace state refreshes without open/create mutation. | PTY lifecycle tests | planned |
| WS-TUI-RECONNECT-006 | CLI/integration | Healthy Workspace/Session is attached again | Existing exact identity and bounded replay semantics are reused. | existing attach tests + control-shell integration | planned |
| WS-TUI-ERROR-007 | CLI/contract | Query, renderer, handoff or refresh fails | Stable safe error survives, renderer cleanup runs once, Agent output/secrets are absent. | failure injection + terminal state assertions | planned |
| WS-TUI-FALLBACK-008 | CLI/package | No TTY, `--no-tui`, structured output or missing renderer asset | Renderer module is not initialized; existing headless commands/help remain usable. | help-without-runtime + packaged fallback smoke | planned |
| WS-TUI-CAPABILITY-009 | CLI/unit | Pi/OpenCode/future Adapter descriptors differ | Action selection derives only from declared attach capabilities. | descriptor matrix tests | planned |
| WS-TUI-PACKAGE-010 | release | macOS arm64/x64 and Linux arm64/x64 artifacts start | Native assets embed/load and cleanup safely; missing assets fail with fallback guidance. | release workflow matrix | planned; host spike partial |
| WS-TUI-TERMINAL-011 | manual/PTY | Resize, focus, paste, mouse, signals and Unicode across supported terminals | Outer shell and full-screen handoff preserve terminal ownership/restoration. | opt-in terminal matrix | planned; host outer-shell partial |
| WS-TUI-DOCS-012 | docs/contract | Workspace help is searched | Both locales explain control shell, code activation, native handoff and fallback. | docs registry + built link checks | planned |

## Research Evidence

OpenTUI 0.5.1 throwaway commit `26713855` and
[issue #1024](https://github.com/appaloft/appaloft/issues/1024) provide host-only evidence. They do
not satisfy the production release or terminal matrix and do not authorize an embedded Agent pane.
