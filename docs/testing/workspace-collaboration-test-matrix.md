# Workspace Collaboration Test Matrix

## Contract

These rows prove public multi-Agent and team coordination over existing Workspace, Terminal Session,
Agent Runtime, Source Artifact and Preview owners.

| Test ID | Layer | Scenario | Expected result | Automated binding | Status |
| --- | --- | --- | --- | --- | --- |
| COLLAB-CREATE-001 | core/application | Create collaboration | Creator owns one collaboration whose first Lane references an existing Workspace. | `packages/core/test/workspace-collaboration.test.ts`; `packages/application/test/workspace-collaboration.test.ts` | automated |
| COLLAB-LANE-002 | core/application | Add isolated Lane | Second distinct Workspace reference is added without provisioning side effects. | `packages/core/test/workspace-collaboration.test.ts`; `packages/application/test/workspace-collaboration.test.ts` | automated |
| COLLAB-MEMBER-003 | core/application | Participant roles | Role updates preserve at least one owner and tenant-safe identities. | `packages/core/test/workspace-collaboration.test.ts`; `packages/application/test/workspace-collaboration.test.ts` | automated |
| COLLAB-LEASE-004 | core/persistence | Exclusive writer | Concurrent acquisition yields one winner with monotonic generation. | `packages/core/test/workspace-collaboration.test.ts`; `packages/application/test/workspace-collaboration.test.ts`; `packages/persistence/pg/test/workspace-collaboration-repository.test.ts` | automated |
| COLLAB-TRANSFER-005 | core/application | Transfer writer | Explicit transfer fences the previous holder and generation. | `packages/core/test/workspace-collaboration.test.ts`; `packages/adapters/runtime/test/terminal-sessions.test.ts` | automated |
| COLLAB-OBSERVE-006 | runtime/HTTP | Read-only observer | Observer receives live/replayed PTY output and cannot input, resize or close. | `packages/adapters/runtime/test/terminal-sessions.test.ts`; `packages/adapters/http-elysia/test/terminal-sessions.test.ts` | automated |
| COLLAB-RECONNECT-007 | runtime/HTTP | Writer reconnect | Detach preserves PTY and current lease can reconnect. | `packages/adapters/runtime/test/terminal-sessions.test.ts` | automated |
| COLLAB-NATIVE-008 | application/adapter | Native attach | Current writer can obtain native attach capability; viewer cannot. | `packages/application/test/workspace-collaboration.test.ts` | automated |
| COLLAB-HANDOFF-009 | core/application | Candidate offer | Available Source Artifact ownership and digest are verified before offer. | `packages/core/test/workspace-collaboration.test.ts`; `packages/application/test/workspace-collaboration.test.ts` | automated |
| COLLAB-REVIEW-010 | core/application | Candidate resolution | Reviewer accepts/rejects exactly once with safe actor metadata. | `packages/core/test/workspace-collaboration.test.ts`; `packages/application/test/workspace-collaboration.test.ts` | automated |
| COLLAB-PREVIEW-011 | application/Web | Preview association | Existing expiring descriptors are surfaced without duplicate lifecycle. | `apps/web/src/lib/console/agent-workspace.test.ts` | automated |
| COLLAB-AUDIT-012 | application/persistence | Safe audit | State changes emit safe metadata and omit content/secrets. | `packages/application/test/workspace-collaboration.test.ts`; operation audit catalog coverage | automated |
| COLLAB-SURFACE-013 | catalog/CLI/SDK/Web | Public parity | Every client dispatches canonical public operations. | `packages/adapters/cli/test/agent-workspace-command.test.ts`; `packages/orpc/test/workspace-collaboration.http.test.ts`; `packages/sdk/test/agent-workspace-handles.test.ts`; `apps/web/src/lib/console/agent-workspace.test.ts` | automated |
| COLLAB-CLOUD-014 | Cloud policy/runtime | Hosted organization policy | Organization isolation and role policy wrap public operations. | `packages/cloud-authz/test/cloud-casl-authz.test.ts`; `packages/cloud-admission/test/cloud-admission.test.ts` in `appaloft-cloud` | automated |
