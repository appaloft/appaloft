# Workspace Activation Target Evidence Test Matrix

| ID | Level | Binding | Status |
| --- | --- | --- | --- |
| WS-ACT-CONTEXT-001 | application | `packages/application/test/agent-workspace-open-preflight.test.ts` | passing |
| WS-ACT-CONTEXT-002 | application | `packages/application/test/agent-workspace-open-preflight.test.ts` | passing |
| WS-ACT-TARGET-003 | application/contract | `packages/application/test/agent-workspace-open-preflight.test.ts`; `packages/application/test/agent-workspace-open.test.ts` | passing |
| WS-ACT-LOCAL-004 | application/CLI | `packages/application/test/agent-workspace-open-preflight.test.ts` | passing |
| WS-ACT-RESUME-005 | application/persistence | `packages/application/test/agent-workspace-open.test.ts`; `packages/persistence/pg/test/profile-aware-workspace-open-repository.test.ts` | passing |
| WS-ACT-LEGACY-006 | persistence/migration | `packages/persistence/pg/test/profile-aware-workspace-open-repository.test.ts` | passing |
| WS-ACT-SAFE-007 | application/HTTP/SDK/CLI | `packages/application/test/agent-workspace-open.test.ts`; `packages/orpc/test/profile-aware-workspace.http.test.ts`; `packages/sdk/test/agent-workspace-handles.test.ts`; `packages/adapters/cli/test/workspace-control-presentation.test.ts` | passing |
| WS-ACT-PARITY-008 | API/SDK/CLI/TUI | `packages/application/test/execution-sandbox-cqrs.test.ts`; `packages/orpc/test/profile-aware-workspace.http.test.ts`; `packages/sdk/test/agent-workspace-handles.test.ts`; `packages/adapters/cli/test/workspace-control-presentation.test.ts`; `apps/workspace-control-tui/src/lib.rs` | passing |
