# terminal-sessions.open Command Spec

## Metadata

- Operation key: `terminal-sessions.open`
- Command class: `OpenTerminalSessionCommand`
- Input schema: `OpenTerminalSessionCommandInput`
- Handler: `OpenTerminalSessionCommandHandler`
- Use case: `OpenTerminalSessionUseCase`
- Application port: `TerminalSessionGateway`
- Domain / bounded context: Workload Delivery / Deployment Target operator access
- Current status: implemented first slice
- Source classification: target contract

## Normative Contract

`terminal-sessions.open` starts an ephemeral interactive operator terminal for either a deployment
target/server or a resource-owned deployment workspace.

It is not:

- a runtime log query;
- a deployment progress stream;
- a persisted deployment operation;
- a Docker-specific exec API;
- a raw SSH endpoint owned by Web;
- a way to persist or mutate Resource aggregate state.

The command accepts or rejects opening a terminal session. After acceptance, terminal input/output
flows over the terminal session transport until closed or disconnected.

## Global References

This command inherits:

- [ADR-022: Operator Terminal Session Boundary](../decisions/ADR-022-operator-terminal-session-boundary.md)
- [Project Resource Console Workflow Spec](../workflows/project-resource-console.md)
- [Operator Terminal Session Workflow Spec](../workflows/operator-terminal-session.md)
- [Operator Terminal Session Error Spec](../errors/terminal-sessions.md)
- [Operator Terminal Session Test Matrix](../testing/operator-terminal-session-test-matrix.md)
- [Operator Terminal Session Implementation Plan](../implementation/operator-terminal-session-plan.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Input Model

| Field | Required | Domain meaning | Validation source |
| --- | --- | --- | --- |
| `scope.kind` | Yes | Whether the terminal is server-scoped or resource-scoped. | Command schema |
| `scope.serverId` | Required for server scope | Deployment target/server to connect to. | Deployment target id value object / command schema |
| `scope.resourceId` | Required for resource scope | Resource whose latest or selected deployment workspace is opened. | Resource id value object / command schema |
| `scope.deploymentId` | Optional for resource scope | Deployment/runtime instance whose workspace should be opened instead of latest observable. | Deployment id value object / command schema |
| `relativeDirectory` | No | Additional directory below the resolved root workspace. | Safe relative path value object / command schema |
| `initialRows` | No | Initial terminal row count. | Command schema bounded integer |
| `initialCols` | No | Initial terminal column count. | Command schema bounded integer |

The public command input must not accept:

- raw host absolute paths for resource scope;
- container ids;
- Docker Compose project names;
- SSH private keys;
- provider-native shell ids;
- shell commands to execute before opening the terminal.

## Output Model

```ts
type TerminalSessionDescriptor = {
  sessionId: string;
  scope: "server" | "resource";
  serverId: string;
  resourceId?: string;
  deploymentId?: string;
  workingDirectory?: string;
  providerKey: string;
  createdAt: string;
  transport: {
    kind: "websocket";
    path: string;
  };
};
```

`sessionId` is an ephemeral platform id generated through the injected `IdGenerator` port. It is not
a Resource, Deployment, or DeploymentTarget id.

`workingDirectory` is informational and may be omitted when the backend cannot safely disclose a
host path. Consumers must not reconstruct filesystem paths from resource names, slugs, or ids.

## Main Flow

1. Validate command input.
2. Authorize the actor for target/resource operator access.
3. Resolve the terminal scope:
   - for server scope, load the deployment target/server and credential context;
   - for resource scope, load the resource and resolve the selected or latest observable
     deployment/runtime instance.
4. Resolve a safe initial working directory.
5. Open a terminal session through `TerminalSessionGateway`.
6. Return the session descriptor and transport path.
7. Attach the terminal transport to the session and stream bidirectional frames until the client or
   backend closes.

## Resource Working Directory Rules

Resource scope must start in the deployed project directory:

1. Use `scope.deploymentId` when supplied and verify it belongs to `scope.resourceId`.
2. Otherwise resolve the latest observable deployment/runtime instance for the resource.
3. Prefer adapter-recorded metadata, in this order for the first slice: `workdir`,
   `remoteWorkdir`, then host-process `workdir`.
4. Use `runtimePlan.execution.workingDirectory` only if adapter metadata is absent and the value is
   meaningful for the selected runtime.
5. Apply `relativeDirectory` below the resolved workspace root after validation.
6. Reject with `terminal_session_workspace_unavailable` if no safe workspace can be resolved.

Current deployment workspace naming remains deployment-attempt scoped. Git clone and source
materialization must not use resource name, resource slug, or resource id as the checkout directory.
For generic SSH Git sources, the default remote source root is
`/var/lib/appaloft/runtime/ssh-deployments/<deploymentId>/source`, with the root configurable through
`APPALOFT_REMOTE_RUNTIME_ROOT`.

## Transport Frame Contract

The first transport should be WebSocket because terminal IO is bidirectional.

```ts
type TerminalSessionFrame =
  | { kind: "ready"; sessionId: string; workingDirectory?: string }
  | { kind: "output"; stream: "stdout" | "stderr"; data: string }
  | { kind: "closed"; reason: "completed" | "cancelled" | "source-ended"; exitCode?: number }
  | { kind: "error"; error: DomainError };

type TerminalSessionClientFrame =
  | { kind: "input"; data: string }
  | { kind: "resize"; rows: number; cols: number }
  | { kind: "close" };
```

Binary transport is allowed later if it preserves the same logical frame semantics.

## Branches

| Branch | Condition | Behavior | Result |
| --- | --- | --- | --- |
| Server missing | `serverId` cannot be resolved or is not visible | Reject during context resolution | `err(not_found)` |
| Resource missing | `resourceId` cannot be resolved or is not visible | Reject during context resolution | `err(not_found)` |
| Deployment mismatch | `deploymentId` does not belong to `resourceId` | Reject during context resolution | `err(terminal_session_context_mismatch)` |
| No observable deployment | Resource scope has no runtime placement | Reject during workspace resolution | `err(terminal_session_workspace_unavailable)` |
| Unsafe relative directory | `relativeDirectory` is absolute, has `..`, URL, or shell fragment | Reject during validation | `err(validation_error)` |
| Unsupported target | Provider/runtime cannot open a terminal | Reject during terminal open | `err(terminal_session_not_configured)` or `err(terminal_session_unsupported)` |
| Hosted control plane disabled | Runtime mode disallows direct shell | Reject during policy gate | `err(terminal_session_policy_denied)` |
| Session opens | Gateway starts PTY/SSH session | Return descriptor | `ok(TerminalSessionDescriptor)` |
| Backend closes after open | PTY/SSH exits | Emit close frame | Session closed |
| Client disconnects | WebSocket closes or abort signal fires | Close backend resources | Session closed |

## Handler Boundary

The command handler must delegate to the use case and return the typed `Result`.

It must not:

- call Docker, SSH, PTY, filesystem, or provider APIs directly;
- inspect WebSocket objects;
- persist terminal input/output;
- format terminal data for Web or CLI;
- call container APIs or service locators.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web resource detail | Resource terminal tab/action dispatches `terminal-sessions.open` with resource scope and attaches to returned WebSocket. | Implemented |
| Web server detail/list | Server terminal action dispatches `terminal-sessions.open` with server scope and attaches to returned WebSocket. | Implemented on server detail |
| CLI | `appaloft server terminal <serverId>` and `appaloft resource terminal <resourceId>` reuse the same command schema and print the descriptor. | Implemented descriptor open; interactive CLI attach future |
| HTTP/oRPC | Command endpoint plus WebSocket attach endpoint. | Implemented |
| Automation / MCP | Future tool can request a session only when an interactive transport is available. | Future |

## Current Implementation Notes And Migration Gaps

Application command/schema/handler/use case, terminal gateway port, runtime adapter, oRPC command
endpoint, WebSocket attach transport, CLI descriptor commands, and Web terminal component are
implemented in the first slice.

Current resource workspace resolution uses execution metadata `workdir`, `remoteWorkdir`, and
`runtimePlan.execution.workingDirectory`. `sourceDir` and source `baseDirectory` normalization are
documented terminal rules but remain follow-up implementation gaps. Docker container shell and
compose service shell targets remain future scope.

## Open Questions

- Should terminal session audit metadata be persisted before the first public Web release?
- Should resource terminal allow selecting an older deployment attempt, or only latest observable
  deployment in the first Code Round?
