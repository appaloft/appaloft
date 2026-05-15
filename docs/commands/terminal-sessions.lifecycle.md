# terminal-sessions.close / terminal-sessions.expire Command Spec

## Metadata

- Operation keys: `terminal-sessions.close`, `terminal-sessions.expire`
- Command classes: `CloseTerminalSessionCommand`, `ExpireTerminalSessionsCommand`
- Application port: `TerminalSessionGateway`
- Domain / bounded context: Workload Delivery / Deployment Target operator access
- Current status: active command closure for ephemeral terminal sessions
- Source classification: target contract

## Normative Contract

Terminal session lifecycle commands close active ephemeral terminal sessions through the gateway.
They release PTY, SSH, subprocess, and transport resources, but they do not mutate Resource,
Deployment, or DeploymentTarget aggregates.

The commands must not persist or return terminal input, terminal output, raw shell command strings,
SSH private keys, access tokens, environment secret values, provider SDK objects, or raw provider
payloads.

## Command Inputs

`terminal-sessions.close` accepts:

| Field | Meaning |
| --- | --- |
| `sessionId` | Active ephemeral terminal session id. |

`terminal-sessions.expire` accepts:

| Field | Meaning |
| --- | --- |
| `olderThan` | Optional ISO timestamp cutoff. Sessions created before this value are closed. If omitted, the gateway applies its active-session idle expiry policy. |
| `limit` | Optional maximum number of sessions to expire in one command. |

## Outputs

Close returns:

```ts
type CloseTerminalSessionResponse = {
  sessionId: string;
  closed: boolean;
  status: "closed";
};
```

Expire returns:

```ts
type ExpireTerminalSessionsResponse = {
  expiredCount: number;
  sessionIds: string[];
};
```

## Behavior

- Close rejects unknown or already removed sessions with `terminal_session_not_found`.
- Close treats an already-closing backend resource as closed only when the gateway can guarantee
  cleanup.
- Expire closes only active sessions older than the explicit cutoff or idle past the gateway
  policy.
- When `olderThan` is omitted, the runtime gateway uses the configured active-session TTL from the
  last terminal activity timestamp. Terminal input, resize frames, and backend output refresh that
  timestamp. The default self-hosted TTL is 3600 seconds and can be changed with
  `APPALOFT_TERMINAL_SESSION_ACTIVE_TTL_SECONDS`.
- Active attach transports may replay a bounded in-memory tail of recent terminal output after a
  browser or CLI reconnects. The default retained tail is 65536 bytes and can be changed with
  `APPALOFT_TERMINAL_SESSION_OUTPUT_RETENTION_BYTES`; `0` disables output replay. Retained output is
  transport-only and is not returned by list/show, audit rows, lifecycle command responses, or any
  durable read model.
- Expire returns safe counts and ids only.
- Both commands are explicit public lifecycle operations; WebSocket disconnect cleanup remains
  transport-owned and may call the gateway directly after a session was opened by
  `terminal-sessions.open`.

## Entrypoints

| Entrypoint | Mapping |
| --- | --- |
| CLI | `appaloft terminal-session close <sessionId>`, `appaloft terminal-session expire` |
| HTTP/oRPC | `POST /api/terminal-sessions/{sessionId}/close`, `POST /api/terminal-sessions/expire` |
| Web | Instance management can close one active session or expire old active sessions without reading terminal input/output. |
| MCP/tools | Future tools can expose these commands as privileged lifecycle actions. |

## Current Implementation Notes And Governed Follow-Ups

The first implementation closes active in-memory sessions. Web Instance management consumes the same
commands for close and expire controls without attaching to terminal transports. The runtime gateway
records durable `terminal-session-opened` and `terminal-session-closed` audit metadata when the
composition root provides an audit recorder, so closed sessions remain inspectable through the
audit-event read surface without retaining terminal input/output. Active attach transports retain
only a bounded in-memory output tail for reconnect replay and never expose it through lifecycle
readback. Omitted-cutoff expiry now uses a
configured activity-aware active-session TTL instead of expiring every session older than the
current instant. Local true PTY resize remains separate follow-up work.
