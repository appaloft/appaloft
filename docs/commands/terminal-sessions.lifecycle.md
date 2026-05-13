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
| `olderThan` | Optional ISO timestamp cutoff. Sessions created before this value are closed. If omitted, the gateway applies its active-session expiry policy. |
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
- Expire closes only active sessions older than the cutoff or gateway policy.
- Expire returns safe counts and ids only.
- Both commands are explicit public lifecycle operations; WebSocket disconnect cleanup remains
  transport-owned and may call the gateway directly after a session was opened by
  `terminal-sessions.open`.

## Entrypoints

| Entrypoint | Mapping |
| --- | --- |
| CLI | `appaloft terminal-session close <sessionId>`, `appaloft terminal-session expire` |
| HTTP/oRPC | `POST /api/terminal-sessions/{sessionId}/close`, `POST /api/terminal-sessions/expire` |
| Web | Future session management panel can consume the same commands. |
| MCP/tools | Future tools can expose these commands as privileged lifecycle actions. |

## Current Implementation Notes And Migration Gaps

The first implementation closes active in-memory sessions. Durable audit records, closed-session
history, idle timeout policy, and terminal output retention policy remain separate Phase 9 audit and
retention work.
