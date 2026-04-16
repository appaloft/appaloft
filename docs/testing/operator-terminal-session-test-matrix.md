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

| Case | Input/read state | Expected command behavior | Expected gateway behavior | Expected result |
| --- | --- | --- | --- | --- |
| Server terminal | Existing server with terminal-capable target | Resolve server and credential context | Open login shell on target | `ok(session descriptor)` |
| Resource terminal latest deployment | Resource has latest observable deployment with workspace metadata | Resolve latest deployment and workspace | Open shell in project workspace | `ok(session descriptor)` |
| Resource terminal selected deployment | `deploymentId` belongs to resource | Resolve selected deployment and workspace | Open shell in selected deployment workspace | `ok(session descriptor)` |
| Deployment mismatch | `deploymentId` belongs to another resource | Reject during context resolution | Gateway not called | `terminal_session_context_mismatch` |
| Resource image-only deployment | Runtime has no source workspace | Reject during workspace resolution | Gateway not called | `terminal_session_workspace_unavailable` |
| Unsafe relative directory | Relative directory has `..`, URL, absolute path, or shell fragment | Reject during validation | Gateway not called | `validation_error` |
| Hosted mode disabled | Runtime mode disallows direct shell | Reject during policy gate | Gateway not called | `terminal_session_policy_denied` |
| Unsupported provider | Target provider has no terminal adapter | Resolve context then fail open | Gateway returns not-configured/unsupported error | `terminal_session_not_configured` or `terminal_session_unsupported` |
| Secret-bearing credential | SSH private key is required to connect | Key is passed only to adapter boundary | No secret appears in result/error/log details | `ok` or sanitized `err` |

## Workspace Matrix

| Placement | Expected workspace behavior |
| --- | --- |
| Local host process | Uses metadata `workdir`; optional relative directory is resolved below it. |
| Local Docker Compose | Uses metadata `workdir` or execution `workingDirectory`; compose file path is not treated as cwd. |
| Local remote-Git Dockerfile build | Uses deployment source directory plus source `baseDirectory` once. |
| Generic SSH Git source | Uses `<remoteRuntimeRoot>/ssh-deployments/<deploymentId>/source` plus source `baseDirectory` once. |
| Generic SSH uploaded local folder | Uses recorded `remoteWorkdir`. |
| Resource renamed after deployment | Workspace resolution still uses deployment metadata, not resource name or slug. |
| Concurrent deployments for same resource | Each selected deployment resolves to its own deployment-id workspace. |

## Transport Matrix

| Case | Frame behavior | Expected cleanup |
| --- | --- | --- |
| Output line | Backend emits bytes | Web/CLI receives output frame in order. |
| User input | Client sends input frame | Backend PTY receives bytes. |
| Resize | Client sends dimensions | Backend PTY resize is invoked when supported. |
| Heartbeat idle | No data for interval | Heartbeat may be sent; session remains open. |
| Client closes | WebSocket closes or CLI exits | Backend PTY/SSH/process is closed. |
| Backend exits | Shell exits normally | Closed frame is emitted; session is removed. |
| Backend fails | PTY/SSH errors after open | Structured error frame is emitted; backend is closed. |

## Entrypoint Matrix

| Entrypoint | Case | Expected behavior |
| --- | --- | --- |
| Web resource page | User opens terminal tab/action | Uses `terminal-sessions.open` with resource scope and attaches returned WebSocket. |
| Web server page | User opens terminal action | Uses `terminal-sessions.open` with server scope and attaches returned WebSocket. |
| Web navigation | User leaves the page | Session closes without rendering normal cancellation as an error. |
| CLI server | `terminal open --server <serverId>` | Opens interactive session and restores local TTY on close. |
| CLI resource | `resource terminal <resourceId>` | Opens latest resource workspace session and restores local TTY on close. |
| HTTP/WebSocket | Client disconnects | Abort propagates and backend resources close. |

## Current Implementation Notes And Migration Gaps

Focused application use-case tests exist for latest resource workspace resolution, server
relative-directory rejection, selected deployment context mismatch, unsafe relative directory
validation, and no-deployment workspace unavailable errors.

Runtime adapter, HTTP/WebSocket, interactive CLI, and Web E2E tests remain follow-up coverage.

## Open Questions

- Should the first Web E2E test use a fake terminal gateway, local PTY, or generic SSH fixture?
