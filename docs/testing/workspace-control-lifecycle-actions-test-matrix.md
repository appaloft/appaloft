# Workspace Control Lifecycle Actions Test Matrix

| ID | Layer | Scenario | Expected evidence | Status |
| --- | --- | --- | --- | --- |
| WS-TUI-ACTION-001 | Rust/unit | Open actions for each Workspace status | Only valid public lifecycle actions render. | planned |
| WS-TUI-ACTION-002 | CLI/unit | Pause a ready Workspace | One `PauseSandboxCommand`; detach precedes mutation; bounded readback follows. | planned |
| WS-TUI-ACTION-003 | CLI/unit | Resume a paused Workspace | One `ResumeSandboxCommand`; bounded readback follows. | planned |
| WS-TUI-ACTION-004 | Rust/unit | Select terminate | No mutation event until explicit confirm; cancel restores navigation. | planned |
| WS-TUI-ACTION-005 | CLI/unit | Confirm termination | Active runtimes terminate before the Workspace, matching headless order. | planned |
| WS-TUI-ACTION-006 | CLI/PTY | Mutate with active viewport | Exact terminal detaches before pause/terminate and is not relaunched implicitly. | planned |
| WS-TUI-ACTION-007 | CLI/contract | Action succeeds or selected Workspace becomes terminal | Existing list/detail queries supply the next view; no local lifecycle cache exists. | planned |
| WS-TUI-ACTION-008 | CLI/contract | Command or refresh fails | Stable safe error contains no secret, provider handle or Agent output. | planned |
| WS-TUI-ACTION-009 | CLI/package | Headless lifecycle commands run | Existing subcommands and structured output remain unchanged. | planned |

