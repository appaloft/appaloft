# Operator Terminal Session Error Spec

## Normative Contract

`terminal-sessions.open` uses the shared platform error model and neverthrow conventions.

Errors must use stable `code`, `category`, `phase`, `retriable`, and scope details. Error details
must not include terminal input, terminal output, raw shell command strings, private keys, access
tokens, source credentials, or raw environment secret values.

## Global References

This spec inherits:

- [ADR-022: Operator Terminal Session Boundary](../decisions/ADR-022-operator-terminal-session-boundary.md)
- [terminal-sessions.open Command Spec](../commands/terminal-sessions.open.md)
- [Operator Terminal Session Workflow Spec](../workflows/operator-terminal-session.md)
- [Error Model](./model.md)
- [neverthrow Conventions](./neverthrow-conventions.md)

## Error Details

```ts
type TerminalSessionErrorDetails = {
  commandName?: "terminal-sessions.open";
  phase:
    | "command-validation"
    | "policy-gate"
    | "context-resolution"
    | "workspace-resolution"
    | "terminal-open"
    | "terminal-transport"
    | "terminal-close";
  step?: string;
  scope?: "server" | "resource";
  serverId?: string;
  resourceId?: string;
  deploymentId?: string;
  targetId?: string;
  adapter?: string;
  runtimeKind?: string;
  relatedEntityId?: string;
  relatedEntityType?: "resource" | "deployment" | "deployment-target";
  relatedState?: string;
  correlationId?: string;
  causationId?: string;
};
```

## Admission Errors

Admission errors reject the command before terminal IO starts and return `err(DomainError)`.

| Error code | Category | Phase | Retriable | Meaning |
| --- | --- | --- | --- | --- |
| `validation_error` | `user` | `command-validation` | No | Input shape, scope, dimensions, or relative directory is invalid. |
| `not_found` | `user` | `context-resolution` | No | Server, resource, or selected deployment cannot be found or is not visible. |
| `terminal_session_context_mismatch` | `user` | `context-resolution` | No | Selected deployment or target does not belong to the requested resource/server context. |
| `terminal_session_policy_denied` | `user` | `policy-gate` | No | Runtime mode, deployment policy, or authorization disables terminal access. |
| `terminal_session_workspace_unavailable` | `user` | `workspace-resolution` | No | Resource scope cannot resolve a safe project workspace. |
| `terminal_session_not_configured` | `provider` | `terminal-open` | No | Selected target provider/runtime is missing required adapter configuration. |
| `terminal_session_unsupported` | `provider` | `terminal-open` | No | Selected target provider/runtime does not support terminal sessions. |
| `terminal_session_failed` | `infra` | `terminal-open` | Conditional | PTY, SSH, provider shell, or process setup failed before attach. |
| `timeout` | `retryable` | `terminal-open` | Yes | Opening the terminal session exceeded adapter policy. |

## Transport Errors

Failures after a session is accepted must be represented as structured terminal frames when
possible.

| Error code | Category | Phase | Retriable | Meaning |
| --- | --- | --- | --- | --- |
| `terminal_session_stream_failed` | `infra` | `terminal-transport` | No | PTY, SSH, WebSocket, or provider stream failed after opening. |
| `terminal_session_not_found` | `user` | `terminal-transport` | No | A transport tried to attach to an unknown or already closed session. |
| `terminal_session_closed` | `user` | `terminal-close` | No | Session closed intentionally or backend exited. Usually a close frame, not a UI error. |
| `timeout` | `retryable` | `terminal-transport` | Yes | Transport stalled or idle timeout closed the session. |

## Consumer Mapping

Web, CLI, HTTP API, workers, and tests must use [Error Model](./model.md).

Terminal consumers additionally must:

- show no retry affordance for validation, not-found, permission, or context mismatch failures;
- show reconnect/open-new-session affordances for retriable open or transport failures;
- treat intentional close and navigation-away cancellation as normal;
- avoid displaying raw command strings or secret-bearing details from backend failures.

## Test Assertions

Tests must assert:

- `Result` shape for admission failures;
- terminal error frame shape for post-open failures;
- `error.code`;
- `error.category`;
- `error.retriable`;
- `phase`;
- scope ids when relevant;
- no raw secrets, command input, command output, or private keys in error details;
- disconnect closes backend PTY/SSH/process resources.

## Current Implementation Notes And Migration Gaps

Admission errors are implemented for command validation, context mismatch, workspace unavailable,
policy denied, missing configuration, unsupported providers, open failure, and attach-not-found.
The WebSocket transport emits `terminal_session_stream_failed` as a structured error frame for
post-acceptance stream failures.

Timeout policy, durable audit errors, and provider-native terminal errors remain future scope.

## Open Questions

- Should intentional terminal close be exposed only as a close frame, or should transports that need
  status codes also map it to `terminal_session_closed`?
