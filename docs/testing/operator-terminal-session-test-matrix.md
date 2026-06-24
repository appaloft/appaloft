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
| TERM-SESSION-WORKSPACE-008 | unit | Source locator fallback | Rejects URL-like or SSH-style Git `workingDirectory` values when no adapter workspace metadata exists. |

## Transport Matrix

| Test ID | Preferred automation | Case | Frame behavior | Expected cleanup |
| --- | --- | --- | --- | --- |
| TERM-SESSION-TRANSPORT-001 | integration | Output line | Backend emits bytes | Web/CLI receives output frame in order. |
| TERM-SESSION-TRANSPORT-002 | integration | User input | Client sends input frame | Backend PTY receives bytes. |
| TERM-SESSION-TRANSPORT-003 | integration | Resize | Client sends dimensions | WebSocket and CLI attach forward dimensions to the attached terminal session; backend PTY resize is invoked when supported. |
| TERM-SESSION-TRANSPORT-004 | integration | Reattach output replay | Client reconnects to an active session | Gateway replays only a bounded in-memory tail of recent output to the new attach stream, trims older output by configured byte limit, and keeps lifecycle list/show/audit readback free of terminal content. |
| TERM-SESSION-TRANSPORT-005 | integration | Heartbeat idle | No data for interval | Heartbeat may be sent; session remains open. |
| TERM-SESSION-TRANSPORT-006 | integration | Client closes | WebSocket closes or CLI exits | Backend PTY/SSH/process is closed. |
| TERM-SESSION-TRANSPORT-007 | integration | Backend exits | Shell exits normally | Closed frame is emitted; session is removed. |
| TERM-SESSION-TRANSPORT-008 | integration | Backend fails | PTY/SSH errors after open | Structured error frame is emitted; backend is closed. |
| TERM-SESSION-LIFE-001 | integration | List active sessions | One server session and one resource session are active | List returns safe descriptors sorted newest first and no terminal output, command text, private keys, tokens, or environment secrets. |
| TERM-SESSION-LIFE-002 | integration | Show active session | Session id is active | Show returns the safe descriptor and lifecycle status without attaching to the transport. |
| TERM-SESSION-LIFE-003 | integration | Close active session | Session id is active | Gateway closes backend resources, removes the session from active readback, and returns `status = closed`. |
| TERM-SESSION-LIFE-004 | integration | Close missing session | Session id is unknown or already removed | Command returns `terminal_session_not_found` and does not close another session. |
| TERM-SESSION-LIFE-005 | integration | Expire old sessions | Active sessions exist before and after cutoff, or idle past and active within the configured active-session TTL when no cutoff is supplied | Only sessions older than the explicit cutoff or idle past the configured gateway TTL close; terminal input, resize, and backend output refresh activity; response returns safe counts and ids. |
| TERM-SESSION-LIFE-006 | integration | Durable audit metadata | Runtime gateway is configured with the audit recorder | Opening and closing a terminal session records `terminal-session-opened` and `terminal-session-closed` audit rows on the server/resource aggregate with safe scope, target, actor, entrypoint, request, provider, timestamp, and close-reason metadata only. |

## Entrypoint Matrix

| Test ID | Preferred automation | Entrypoint | Case | Expected behavior |
| --- | --- | --- | --- | --- |
| TERM-SESSION-ENTRY-001 | e2e-preferred | Web resource page | User opens terminal tab/action | Uses `terminal-sessions.open` with resource scope and attaches returned WebSocket. Bun.WebView coverage verifies resource terminal open, selected deployment scope, attach URL, and initial resize frame. |
| TERM-SESSION-ENTRY-002 | e2e-preferred | Web server page | User opens terminal action | Uses `terminal-sessions.open` with server scope and attaches returned WebSocket. Bun.WebView coverage verifies server detail terminal open, server scope, attach URL, and initial resize frame; source guards verify the server list terminal action deep-links to the server terminal tab. |
| TERM-SESSION-ENTRY-003 | e2e-preferred | Web navigation | User leaves the page | Session closes without rendering normal cancellation as an error. Bun.WebView coverage verifies an attached resource terminal sends a close frame during client-side navigation. |
| TERM-SESSION-ENTRY-004 | integration | CLI server | `server terminal <serverId> --attach` | Opens interactive session and restores local TTY on close. |
| TERM-SESSION-ENTRY-005 | integration | CLI resource | `resource terminal <resourceId> --attach` | Opens latest or selected resource workspace session and restores local TTY on close. |
| TERM-SESSION-ENTRY-006 | e2e-preferred | HTTP/WebSocket | Client disconnects | Abort propagates and backend resources close. |
| TERM-SESSION-ENTRY-007 | e2e-preferred | CLI lifecycle | `terminal-session list/show/close/expire` | CLI dispatches the shared lifecycle query/command schemas and prints safe JSON. |
| TERM-SESSION-ENTRY-008 | e2e-preferred | HTTP lifecycle | `GET /api/terminal-sessions`, `GET /api/terminal-sessions/{sessionId}`, `POST /api/terminal-sessions/{sessionId}/close`, and `POST /api/terminal-sessions/expire` | HTTP routes dispatch shared messages and never expose terminal input/output. |
| TERM-SESSION-ENTRY-009 | source/unit | Web deployment detail | Operator opens terminal from a deployment detail page. | Deployment detail links to the Resource terminal tab with `deploymentId`; Resource terminal passes that selected deployment id to `terminal-sessions.open` while preserving resource ownership. |
| TERM-SESSION-ENTRY-010 | e2e-preferred | Web close action | Operator clicks the terminal panel close action while attached. | Web sends a terminal transport close frame, closes the socket, and renders normal close as disconnected rather than as a terminal error. |
| TERM-SESSION-WEB-001 | source/unit + WebView | Web Instance lifecycle | Operator opens Instance management. | Web lists active terminal sessions through `terminal-sessions.list`, can close one active session, can expire old active sessions, and never renders terminal input/output or attaches to a terminal transport from the lifecycle view. |
| TERM-SESSION-WORKSPACE-009 | application unit | Resource Docker runtime without source workspace | Resource deployment is server-backed, `docker-container` or `docker-compose-stack`, and has no safe deployment workspace | `terminal-sessions.open` accepts the resource session without `workingDirectory` so the runtime gateway can enter the retained container/service target; if `relativeDirectory` is requested without a workspace, it rejects with `terminal_session_workspace_unavailable`. |

## Current Implementation Notes And Governed Follow-Ups

Focused application use-case tests exist for latest resource workspace resolution, `sourceDir`
workspace metadata, `source.baseDirectory` normalization for monorepo workspaces, source-locator
fallback rejection, server relative-directory rejection, selected deployment context mismatch,
unsafe relative directory validation, and no-deployment workspace unavailable errors.

Active lifecycle list/show/close/expire tests exist under `TERM-SESSION-LIFE-*`,
`TERM-SESSION-ENTRY-007`, and `TERM-SESSION-ENTRY-008`. HTTP/WebSocket attach has focused adapter
coverage for routing client input frames to the attached terminal session.

Runtime adapter process-spawn coverage now includes local Docker container `exec`, generic-SSH
Docker container `exec`, local Docker Compose service `exec`, and generic-SSH Docker Compose service
`exec` command construction for retained runtime metadata. CLI server/resource `--attach` has
focused integration coverage for gateway attachment, raw-mode restoration, and terminal output
bridging under `TERM-SESSION-ENTRY-004` and `TERM-SESSION-ENTRY-005`. Web source coverage exists in
`apps/web/src/lib/console/terminal-session-web.test.ts` for `TERM-SESSION-WEB-001` and
`TERM-SESSION-ENTRY-009`; source guards also verify `TERM-SESSION-ENTRY-002` server list terminal
deep-link coverage. Bun.WebView coverage now exercises `TERM-SESSION-WEB-001` Instance lifecycle
list/expire/close without rendering terminal output, `TERM-SESSION-ENTRY-001` resource terminal
open/attach, `TERM-SESSION-ENTRY-002` server detail terminal open/attach, and
`TERM-SESSION-ENTRY-003` client-side navigation cleanup, plus `TERM-SESSION-ENTRY-010` explicit
close action transport cleanup with a mocked attach socket. HTTP
WebSocket resize routing is covered under
`TERM-SESSION-TRANSPORT-003`, and CLI attach forwards its initial `--rows`/`--cols` dimensions to
the attached session. Runtime gateway subprocess resize-hook coverage is recorded under
`TERM-SESSION-TRANSPORT-003` when the spawn adapter exposes a PTY resize hook. Runtime gateway audit
coverage records safe open/close metadata under `TERM-SESSION-LIFE-006`. Runtime gateway expiry
coverage records omitted-cutoff activity-aware active-session TTL behavior under
`TERM-SESSION-LIFE-005`. Runtime gateway reattach coverage records bounded in-memory output replay
under `TERM-SESSION-TRANSPORT-004`. Host PTY-specific resize behavior is covered through the
runtime gateway subprocess resize hook when an adapter exposes one; Bun pipe-backed sessions do not
claim stronger resize semantics.

## Open Questions

- Current WebView coverage uses a mocked attach socket so browser affordances can be verified
  without requiring a host PTY or SSH target.
