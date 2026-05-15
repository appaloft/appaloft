# terminal-sessions.list / terminal-sessions.show Query Spec

## Metadata

- Operation keys: `terminal-sessions.list`, `terminal-sessions.show`
- Query classes: `ListTerminalSessionsQuery`, `ShowTerminalSessionQuery`
- Application port: `TerminalSessionGateway`
- Domain / bounded context: Workload Delivery / Deployment Target operator access
- Current status: active query closure for ephemeral terminal sessions
- Source classification: target contract

## Normative Contract

Terminal session readback lists or shows active ephemeral terminal sessions opened by
`terminal-sessions.open`.

The readback is intentionally limited to safe descriptor metadata:

- session id;
- scope, server id, optional resource id, and optional deployment id;
- provider key;
- safe working directory when the gateway already returned it;
- transport kind/path;
- created timestamp and current lifecycle status.

The queries must not expose terminal input, terminal output, raw shell commands, SSH private keys,
access tokens, environment secret values, provider SDK objects, or raw provider payloads.

## Query Inputs

`terminal-sessions.list` accepts optional filters:

| Field | Meaning |
| --- | --- |
| `scope` | `server` or `resource` sessions only. |
| `serverId` | Sessions attached to one deployment target/server. |
| `resourceId` | Resource-scoped sessions for one resource. |
| `deploymentId` | Resource-scoped sessions for one deployment. |
| `limit` | Maximum rows, bounded by the command schema. |

`terminal-sessions.show` accepts:

| Field | Meaning |
| --- | --- |
| `sessionId` | Active ephemeral terminal session id. |

## Behavior

- List returns active sessions sorted newest first unless the gateway has a stronger local order.
- Show returns `not_found` when the session is unknown or already removed from active memory.
- Neither query attaches to the terminal transport.
- Neither query mutates gateway state, closes sessions, or expires sessions.

## Entrypoints

| Entrypoint | Mapping |
| --- | --- |
| CLI | `appaloft terminal-session list`, `appaloft terminal-session show <sessionId>` |
| HTTP/oRPC | `GET /api/terminal-sessions`, `GET /api/terminal-sessions/{sessionId}` |
| Web | Instance management lists active terminal sessions without attaching to terminal transports. |
| MCP/tools | Future tools can expose the same read-only metadata. |

## Current Implementation Notes And Governed Follow-Ups

The first implementation reads active ephemeral sessions from the runtime terminal gateway. Web
Instance management consumes the same query to render active-session lifecycle metadata without
terminal input/output. Closed sessions are retained as safe `terminal-session-closed` audit rows
through the audit-event read surface when the runtime gateway is configured with an audit recorder.
