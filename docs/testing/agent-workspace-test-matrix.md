# Agent Workspace Test Matrix

## Contract

These rows prove the public Agent Workspace entry workflow over canonical Sandbox, Agent Runtime,
Terminal Session and Sandbox Port operations.

| Test ID | Layer | Scenario | Expected result | Automated binding | Status |
| --- | --- | --- | --- | --- | --- |
| AGENT-WS-FLOW-001 | CLI/SDK | Pi Workspace create | One Sandbox create and one Pi Runtime create; `workspaceId = sandboxId`. | CLI and SDK Workspace tests | passed |
| AGENT-WS-FLOW-002 | CLI/SDK | OpenCode Workspace create | One Sandbox create and one OpenCode Runtime create with the admitted template. | CLI and SDK Workspace tests | passed |
| AGENT-WS-FLOW-003 | CLI/SDK | list/show composition | Sandbox lifecycle and subordinate Runtime descriptors are returned without a Workspace repository. | CLI and SDK Workspace tests | passed |
| AGENT-WS-TERM-004 | application/runtime | detach and reconnect | Client detach preserves PTY; later attach receives bounded replay and live output. | `packages/adapters/runtime/test/terminal-sessions.test.ts`; HTTP/CLI terminal tests | passed |
| AGENT-WS-PREVIEW-005 | application/provider | expiring development port | Existing Sandbox port operation returns/revokes one safe exact exposure. | execution Sandbox tests; dependent provider gateway tests | passed |
| AGENT-WS-ISOLATION-006 | application/provider | two Workspaces | Distinct Sandbox ids imply distinct runtime handles, process/file scopes and exposure ids. | execution Sandbox application/provider tests | passed |
| AGENT-WS-LIFE-007 | application/provider | lifecycle delegation | pause/resume preserves Sandbox identity; terminate removes exact owned runtime. | execution Sandbox lifecycle/reconciliation tests | passed |
| AGENT-WS-OPEN-008 | adapter/application | OpenCode managed Run | Run uses loopback server, emits bounded neutral events and cancellation stops the client process. | OpenCode adapter tests; Agent Runtime application tests | passed |
| AGENT-WS-START-009 | core/application | harness startup lifecycle | Startup failure persists explicit failed state; terminate invokes harness cleanup. | core and application Agent Runtime tests | passed |
| AGENT-OPENCODE-011 | adapter contract | pinned OpenCode runtime | Version/template admission, server marker recovery, attach argv and JSON translation are deterministic. | `packages/adapters/runtime/test/opencode-sandbox-agent-harness.test.ts` | passed |
| AGENT-WS-CLI-012 | CLI integration | public Workspace command | CLI dispatches only canonical public commands/queries and prints a combined descriptor. | `packages/adapters/cli/test/agent-workspace-command.test.ts` | passed |
| AGENT-WS-SDK-013 | SDK contract | public Workspace handle | SDK composes generated operations, propagates ids and reports partial-create Sandbox id. | `packages/sdk/test/agent-workspace-handles.test.ts` | passed |
