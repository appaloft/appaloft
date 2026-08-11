# Workspace Control Delivery Actions Test Matrix

| ID | Layer | Scenario | Expected evidence | Status |
| --- | --- | --- | --- | --- |
| WS-TUI-DELIVERY-001 | Rust/unit | Open `d` for bounded Preview/Task/Promotion descriptors | Only status-valid exact actions render; no mutation event is emitted. | automated pass |
| WS-TUI-DELIVERY-002 | Rust + CLI/unit | Create a Preview | Port/visibility/TTL validate; one existing expose command executes with private default and authoritative readback. | automated pass |
| WS-TUI-DELIVERY-003 | Rust + CLI/unit | Revoke an exact Preview | Cancel emits nothing; confirm dispatches one revoke for a selected-detail exposure. | automated pass |
| WS-TUI-DELIVERY-004 | Rust + CLI/unit | Approve an awaiting Task | Confirm dispatches one existing approval command and refreshes Task truth. | automated pass |
| WS-TUI-DELIVERY-005 | Rust + CLI/unit | Deliver an approved Task to Git/PR | Bounded safe form values dispatch one existing deliver command after confirmation; no credential value crosses the renderer protocol. | automated pass |
| WS-TUI-DELIVERY-006 | Rust + CLI/unit | Accept or retry a Promotion | Exact selected descriptor/digest plus fresh parent idempotency dispatch the existing valid command once. | automated pass |
| WS-TUI-DELIVERY-007 | CLI/contract | Promotion has deployment/resource ids | Existing Deployment Proof query supplies verdict and bounded evidence counts; status does not fabricate proof. | automated pass |
| WS-TUI-DELIVERY-008 | Rust + CLI/PTY | Submit while Agent terminal is active or mutation is busy | Duplicate submit is blocked; same Agent Session identity remains; successful mutation refreshes bounded detail. | automated pass |
| WS-TUI-DELIVERY-009 | CLI/contract | Validation, authz, Git/provider or proof query fails | Stable safe error excludes secret, provider body, query-bearing URL and Agent output; form remains recoverable. | automated pass |
| WS-TUI-DELIVERY-010 | CLI/package | Headless delivery commands run without TTY/renderer | Existing Preview, Task, Promotion and proof commands/output remain unchanged. | regression pass |
| WS-TUI-DELIVERY-011 | docs/contract | Workspace help/docs resolve delivery controls | Both locales document private Preview, confirmations, proof readback and headless equivalents. | docs synced |
