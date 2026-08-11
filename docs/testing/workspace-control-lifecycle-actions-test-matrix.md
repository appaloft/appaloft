# Workspace Control Lifecycle Actions Test Matrix

| ID | Layer | Scenario | Expected evidence | Status |
| --- | --- | --- | --- | --- |
| WS-TUI-ACTION-001 | Rust/unit | Open actions for each Workspace status | Only valid public lifecycle actions render. | automated pass |
| WS-TUI-ACTION-002 | CLI/unit | Pause a ready Workspace | One `PauseSandboxCommand`; detach precedes mutation; bounded readback follows. | automated pass |
| WS-TUI-ACTION-003 | CLI/unit | Resume a paused Workspace | One `ResumeSandboxCommand`; bounded readback follows. | automated pass |
| WS-TUI-ACTION-004 | Rust/unit | Select terminate | No mutation event until explicit confirm; cancel restores navigation. | automated pass |
| WS-TUI-ACTION-005 | CLI/unit | Confirm termination | Active runtimes terminate before the Workspace, matching headless order. | automated pass |
| WS-TUI-ACTION-006 | CLI/PTY | Mutate with active viewport | Exact terminal detaches before pause/terminate and is not relaunched implicitly. | automated pass |
| WS-TUI-ACTION-007 | CLI/contract | Action succeeds or selected Workspace becomes terminal | Existing list/detail queries supply the next view; no local lifecycle cache exists. | automated pass |
| WS-TUI-ACTION-008 | CLI/contract | Command or refresh fails | Stable safe error contains no secret, provider handle or Agent output. | existing safe-error regression pass |
| WS-TUI-ACTION-009 | CLI/package | Headless lifecycle commands run | Existing subcommands and structured output remain unchanged. | automated regression pass |

## Implementation Evidence

Ticket [#1031](https://github.com/appaloft/appaloft/issues/1031) binds the Rust action/confirmation
state, authenticated renderer protocol and Bun-parent operation dispatch to this matrix. Focused
Rust/CLI/renderer tests, public `lint:ci`, `typecheck`, full `test`, full `build`, docs registry and
binary-bundle boundary tests pass. The full suite was rerun outside the sandbox so real loopback and
PTY tests exercised their intended host boundary; the real Ratatui PTY test also passed in isolation.
