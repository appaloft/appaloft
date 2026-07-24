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
| AGENT-WS-LIFE-007 | application/provider/CLI/Web | lifecycle delegation | pause/resume preserves Sandbox identity; Workspace terminate first terminates subordinate Agent Runtimes and then removes exact owned Sandbox runtime. | execution Sandbox lifecycle/reconciliation tests; CLI and Web Workspace tests | passed |
| AGENT-WS-OPEN-008 | adapter/application | OpenCode managed Run | Run uses the Sandbox-private server, emits bounded neutral events and cancellation stops the client process. | OpenCode adapter tests; Agent Runtime application tests | passed |
| AGENT-WS-START-009 | core/application | harness startup lifecycle | Startup failure persists explicit failed state; terminate invokes harness cleanup. | core and application Agent Runtime tests | passed |
| AGENT-OPENCODE-011 | adapter contract | pinned OpenCode runtime | Version/template admission, private-network listener without a host port, server marker recovery, attach argv and JSON translation are deterministic. | `packages/adapters/runtime/test/opencode-sandbox-agent-harness.test.ts` | passed |
| AGENT-WS-CLI-012 | CLI integration | public Workspace command | CLI dispatches only canonical public commands/queries and prints a combined descriptor. | `packages/adapters/cli/test/agent-workspace-command.test.ts` | passed |
| AGENT-WS-SDK-013 | SDK contract | public Workspace handle | SDK composes generated operations, propagates ids and reports partial-create Sandbox id. | `packages/sdk/test/agent-workspace-handles.test.ts` | passed |
| AGENT-WS-SOURCE-014 | CLI/SDK/Web | repository materialization | Validated credential-free HTTPS repository and refs execute as argv through provider-enforced egress before Runtime creation; partial failure keeps the Sandbox id. | CLI/SDK Workspace tests; `apps/web/src/lib/console/agent-workspace.test.ts`; `AGENT-WS-EGRESS-019` provider coverage | passed |
| AGENT-WS-CONNECT-015 | CLI/Web/terminal | managed reconnect | `workspace connect` and the Sandbox-scoped Console terminal use the managed Terminal Session gateway without host SSH credentials. | CLI Workspace tests; terminal session tests; `apps/web/src/lib/console/agent-workspace.test.ts` | passed |
| AGENT-WS-ATTACH-016 | application/SDK/CLI/Web/Cloud gateway | scoped native attach | OpenCode Runtime/model access is refreshed and attach receives only a private gateway URL expiring within one hour; unsupported providers fail closed. | `packages/application/test/sandbox-agent-runtime.test.ts`; `packages/sdk/test/agent-workspace-handles.test.ts`; CLI Workspace tests; `apps/sandbox-gateway/test/app.test.ts`; Cloud Sandbox gateway tests | passed |
| AGENT-WS-WEB-017 | Web | public Workspace Console | List/detail, lifecycle, terminal, previews and capability-driven Runtime actions dispatch canonical public operations. | `apps/web/src/lib/console/agent-workspace.test.ts` | passed |
| AGENT-ADAPTER-018 | application/adapter | capability catalog | Pi, OpenCode and custom command adapters publish neutral template, interaction, persistence, health and task capabilities. | `packages/application/test/sandbox-agent-runtime.test.ts`; command/Pi/OpenCode harness tests | passed |
| AGENT-WS-EGRESS-019 | Docker provider/Cloud gateway | controlled repository egress | Sandbox remains on an internal network; authenticated proxy admits only exact domain/CIDR plus port rules, rejects reserved destinations and is revoked during cleanup. | `packages/adapters/runtime/test/docker-sandbox-provider.test.ts`; `apps/sandbox-gateway/test/egress-proxy.test.ts`; Cloud composition tests | passed |
| AGENT-WS-HTTP-020 | HTTP/SDK running server | complete Agent Workspace route mount | Harness discovery, native attach and every Agent Task operation are mounted on the real HTTP server and enter product-session authentication instead of falling through to a Web or 404 response. | `packages/sdk/test/sandbox-agent-delivery-running-server.test.ts` | passed |
