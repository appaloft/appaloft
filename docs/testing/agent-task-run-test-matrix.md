# Agent Task Run Test Matrix

| Test ID | Layer | Scenario | Expected result | Automated binding | Status |
| --- | --- | --- | --- | --- | --- |
| AGENT-TASK-RUN-001 | application/SDK/CLI/Web | submit and follow | One Agent Run id is the Task Run id; durable work continues after observer disconnect and Console follows bounded redacted events. | `packages/application/test/agent-task-run.test.ts`; `packages/application/test/sandbox-agent-runtime.test.ts`; `packages/sdk/test/agent-workspace-handles.test.ts`; `packages/adapters/cli/test/agent-workspace-command.test.ts`; `apps/web/src/lib/console/agent-workspace.test.ts` | automated |
| AGENT-TASK-RESUME-002 | application/SDK | resume finalization | Same Run and protected task state continue idempotently; a failed finalization stores a safe retryable reason. | `packages/application/test/agent-task-run.test.ts`; `packages/sdk/test/agent-workspace-handles.test.ts` | automated |
| AGENT-TASK-CHECK-003 | application | argv checks | Bounded results persist; required failure blocks approval. | `packages/application/test/agent-task-run.test.ts` | automated |
| AGENT-TASK-DIFF-004 | application | Git evidence | Status/stat/patch, redaction and truncation metadata persist. | `packages/application/test/agent-task-run.test.ts` | automated |
| AGENT-TASK-PREVIEW-005 | application/provider | Development Preview | Background start and exact TTL-scoped exposure are returned. | `packages/application/test/agent-task-run.test.ts` | automated |
| AGENT-TASK-ARTIFACT-006 | application | immutable review | Source Artifact digest and Candidate Preview bind exact source. | `packages/application/test/agent-task-run.test.ts` | automated |
| AGENT-TASK-APPROVE-007 | application/security | external approval | Approval is idempotent; Sandbox runtime identity is rejected. | `packages/application/test/agent-task-run.test.ts` | automated |
| AGENT-TASK-PR-008 | application/SDK/CLI | pull-request delivery | Approved changes deliver once with an operation-scoped Git author; integration credentials arrive only through bounded stdin, and failure remains retryable and secret-safe. | `packages/application/test/agent-task-run.test.ts`; `packages/sdk/test/agent-workspace-handles.test.ts`; `packages/adapters/cli/test/agent-workspace-command.test.ts` | automated |
| AGENT-TASK-CANCEL-009 | application/CLI | cancel | Underlying active Agent Run is cancelled; exact preview access is revoked and no delivery occurs. | `packages/application/test/agent-task-run.test.ts`; `packages/adapters/cli/test/agent-workspace-command.test.ts` | automated |
| AGENT-TASK-WEB-010 | Web | task experience | Public Console renders live bounded Agent events, task list, checks, changes, previews, approval and delivery recovery. | `apps/web/src/lib/console/agent-workspace.test.ts`; composed Cloud browser verified the authenticated desktop/mobile Workspace entry and Pi/OpenCode catalog | passed |

2026-07-24 composed Cloud browser evidence also covered a fresh OpenCode Workspace Task Run from
submission through the scoped model gateway, bounded native events, a passing argv check, protected
Git evidence, external approval and exact Workspace/model-capability cleanup. Pull-request delivery
remains covered by the automated integration-auth/SDK/CLI/application boundary rather than a
production GitHub write.
