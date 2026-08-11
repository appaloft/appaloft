# Workspace Control Recovery And Cleanup Evidence Test Matrix

| ID | Layer | Scenario | Expected evidence | Status |
| --- | --- | --- | --- | --- |
| WS-TUI-RECOVERY-001 | CLI/unit | Selected Workspace detail loads | Existing Sandbox requested/realized isolation, attempts and suspension fields map safely. | planned |
| WS-TUI-RECOVERY-002 | CLI/contract | Tenant Snapshot list contains multiple Workspaces | One bounded query executes and only exact `sourceSandboxId` matches reach the renderer. | planned |
| WS-TUI-RECOVERY-003 | Rust/unit | Open `s` for current detail | Create and status-valid exact delete actions render without mutation. | planned |
| WS-TUI-RECOVERY-004 | Rust + CLI/unit | Create a reusable Snapshot | Explicit capability and fixed retention validate; confirmation dispatches one existing command and authoritative readback. | planned |
| WS-TUI-RECOVERY-005 | Rust + CLI/unit | Delete an exact Snapshot | Cancel emits nothing; confirm dispatches one existing delete command after latest-detail validation. | planned |
| WS-TUI-RECOVERY-006 | CLI/PTY | Snapshot action runs with active Agent terminal | Exact Session/process identity remains and no detach/restart occurs. | planned |
| WS-TUI-RECOVERY-007 | CLI + Rust/unit | Terminal/non-terminal Workspace has active/terminal Runtime and Preview combinations | Cleanup state/counts derive only from bounded current query results. | planned |
| WS-TUI-RECOVERY-008 | Rust/docs | Cleanup state is clear | UI/docs label the result bounded Workspace-owned evidence, not host/provider zero-residual proof. | planned |
| WS-TUI-RECOVERY-009 | Rust + CLI/unit | Submit while mutation is busy or success refreshes | Duplicate submit is blocked; form clears only on success and detail refreshes. | planned |
| WS-TUI-RECOVERY-010 | CLI/contract | Validation, authz, provider, mutation or readback fails | Stable safe error survives without secret, provider handle/body, URL query or Agent output. | planned |
| WS-TUI-RECOVERY-011 | CLI/package | Headless Workspace/Sandbox recovery commands run without renderer | Existing command/output behavior remains unchanged. | planned |
| WS-TUI-RECOVERY-012 | docs/contract | Workspace control help is resolved | Both locales explain `s`, bounded retention, recovery fields, cleanup evidence limits and headless equivalents. | planned |
