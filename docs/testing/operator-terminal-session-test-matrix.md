# Operator Terminal Session Test Matrix

## Normative Contract

Tests for `terminal-sessions.open` must verify that operator terminals are explicit, authorized,
scope-aware, workspace-aware, bidirectional, cancellable, and separate from runtime logs.

## Global References

This test matrix inherits:

- [ADR-022: Operator Terminal Session Boundary](../decisions/ADR-022-operator-terminal-session-boundary.md)
- [terminal-sessions.open Command Spec](../commands/terminal-sessions.open.md)
- [Operator Terminal Session Workflow Spec](../workflows/operator-terminal-session.md)
- [Operator Terminal Session Error Spec](../errors/terminal-sessions.md)
- [Operator Terminal Session Implementation Plan](../implementation/operator-terminal-session-plan.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)

## Test Layers

| Layer | Focus |
| --- | --- |
| Command schema | Scope union, ids, dimensions, safe relative directory. |
| Command handler/use case | Context resolution, policy gate, workspace resolution, gateway delegation. |
| Terminal gateway fake | Open, output/input frames, resize, close, failure, cancellation. |
| Runtime adapter | Local PTY and generic-SSH PTY command construction without leaking credentials. |
| HTTP/WebSocket | Command admission plus bidirectional frame attach and disconnect cleanup. |
| CLI | TTY raw mode, input/output bridge, Ctrl-C cleanup, structured errors. |
| Web resource/server pages | Owner-scoped terminal affordance, attach/close, i18n error rendering. |

## Given / When / Then Template

```md
Given:
- Scope:
- Resource/server/deployment state:
- Runtime target:
- Workspace metadata:
- Entrypoint:

When:
- The caller opens a terminal and optionally sends input/resize/close frames.

Then:
- Command input:
- Policy/context/workspace resolution:
- Gateway call:
- Transport frames:
- Cleanup behavior:
- Error mapping:
```

## Command And Service Matrix

| Test ID | Preferred automation | Case | Input/read state | Expected command behavior | Expected gateway behavior | Expected result |
| --- | --- | --- | --- | --- | --- | --- |
| TERM-SESSION-CMD-001 | integration | Server terminal | Existing server with terminal-capable target | Resolve server and credential context | Open login shell on target | `ok(session descriptor)` |
| TERM-SESSION-CMD-002 | integration | Resource terminal latest deployment | Resource has latest observable deployment with workspace metadata | Resolve latest deployment and workspace | Open shell in project workspace | `ok(session descriptor)` |
| TERM-SESSION-CMD-003 | integration | Resource terminal selected deployment | `deploymentId` belongs to resource | Resolve selected deployment and workspace | Open shell in selected deployment workspace | `ok(session descriptor)` |
| TERM-SESSION-CMD-004 | integration | Deployment mismatch | `deploymentId` belongs to another resource | Reject during context resolution | Gateway not called | `terminal_session_context_mismatch` |
| TERM-SESSION-CMD-005 | integration | Resource image-only deployment | Runtime has no source workspace | Reject during workspace resolution | Gateway not called | `terminal_session_workspace_unavailable` |
| TERM-SESSION-CMD-006 | integration | Unsafe relative directory | Relative directory has `..`, URL, absolute path, or shell fragment | Reject during validation | Gateway not called | `validation_error` |
| TERM-SESSION-CMD-007 | integration | Hosted mode disabled | Runtime mode disallows direct shell | Reject during policy gate | Gateway not called | `terminal_session_policy_denied` |
| TERM-SESSION-CMD-008 | integration | Unsupported provider | Target provider has no terminal adapter | Resolve context then fail open | Gateway returns not-configured/unsupported error | `terminal_session_not_configured` or `terminal_session_unsupported` |
| TERM-SESSION-CMD-009 | integration | Secret-bearing credential | SSH private key is required to connect | Key is passed only to adapter boundary | No secret appears in result/error/log details | `ok` or sanitized `err` |

## Workspace Matrix

| Test ID | Preferred automation | Placement | Expected workspace behavior |
| --- | --- | --- | --- |
| TERM-SESSION-WORKSPACE-001 | unit | Local host process | Uses metadata `workdir`; optional relative directory is resolved below it. |
| TERM-SESSION-WORKSPACE-002 | unit | Local Docker Compose | Uses metadata `workdir` or execution `workingDirectory`; compose file path is not treated as cwd. |
| TERM-SESSION-WORKSPACE-003 | unit | Local remote-Git Dockerfile build | Uses deployment source directory plus source `baseDirectory` once. |
| TERM-SESSION-WORKSPACE-004 | unit | Generic SSH Git source | Uses `<remoteRuntimeRoot>/ssh-deployments/<deploymentId>/source` plus source `baseDirectory` once. |
| TERM-SESSION-WORKSPACE-005 | unit | Generic SSH uploaded local folder | Uses recorded `remoteWorkdir`. |
| TERM-SESSION-WORKSPACE-006 | unit | Resource renamed after deployment | Workspace resolution still uses deployment metadata, not resource name or slug. |
| TERM-SESSION-WORKSPACE-007 | unit | Concurrent deployments for same resource | Each selected deployment resolves to its own deployment-id workspace. |

## Transport Matrix

| Test ID | Preferred automation | Case | Frame behavior | Expected cleanup |
| --- | --- | --- | --- | --- |
| TERM-SESSION-TRANSPORT-001 | integration | Output line | Backend emits bytes | Web/CLI receives output frame in order. |
| TERM-SESSION-TRANSPORT-002 | integration | User input | Client sends input frame | Backend PTY receives bytes. |
| TERM-SESSION-TRANSPORT-003 | integration | Resize | Client sends dimensions | Backend PTY resize is invoked when supported. |
| TERM-SESSION-TRANSPORT-004 | integration | Heartbeat idle | No data for interval | Heartbeat may be sent; session remains open. |
| TERM-SESSION-TRANSPORT-005 | integration | Client closes | WebSocket closes or CLI exits | Backend PTY/SSH/process is closed. |
| TERM-SESSION-TRANSPORT-006 | integration | Backend exits | Shell exits normally | Closed frame is emitted; session is removed. |
| TERM-SESSION-TRANSPORT-007 | integration | Backend fails | PTY/SSH errors after open | Structured error frame is emitted; backend is closed. |

## Entrypoint Matrix

| Test ID | Preferred automation | Entrypoint | Case | Expected behavior |
| --- | --- | --- | --- | --- |
| TERM-SESSION-ENTRY-001 | e2e-preferred | Web resource page | User opens terminal tab/action | Uses `terminal-sessions.open` with resource scope and attaches returned WebSocket. |
| TERM-SESSION-ENTRY-002 | e2e-preferred | Web server page | User opens terminal action | Uses `terminal-sessions.open` with server scope and attaches returned WebSocket. |
| TERM-SESSION-ENTRY-003 | e2e-preferred | Web navigation | User leaves the page | Session closes without rendering normal cancellation as an error. |
| TERM-SESSION-ENTRY-004 | e2e-preferred | CLI server | `terminal open --server <serverId>` | Opens interactive session and restores local TTY on close. |
| TERM-SESSION-ENTRY-005 | e2e-preferred | CLI resource | `resource terminal <resourceId>` | Opens latest resource workspace session and restores local TTY on close. |
| TERM-SESSION-ENTRY-006 | e2e-preferred | HTTP/WebSocket | Client disconnects | Abort propagates and backend resources close. |

## Current Implementation Notes And Migration Gaps

Focused application use-case tests exist for latest resource workspace resolution, server
relative-directory rejection, selected deployment context mismatch, unsafe relative directory
validation, and no-deployment workspace unavailable errors.

Runtime adapter, HTTP/WebSocket, interactive CLI, and Web E2E tests remain follow-up coverage.

## Open Questions

- Should the first Web E2E test use a fake terminal gateway, local PTY, or generic SSH fixture?
