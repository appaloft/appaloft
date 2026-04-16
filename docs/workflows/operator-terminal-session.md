# Operator Terminal Session Workflow Spec

## Normative Contract

Operator terminal access is an interactive workflow over `terminal-sessions.open`.

The workflow starts from either a selected server or a selected resource. It opens an ephemeral
shell through an application/runtime port and transports bidirectional terminal frames until the
operator or backend closes the session.

## Global References

This workflow inherits:

- [ADR-022: Operator Terminal Session Boundary](../decisions/ADR-022-operator-terminal-session-boundary.md)
- [terminal-sessions.open Command Spec](../commands/terminal-sessions.open.md)
- [Operator Terminal Session Error Spec](../errors/terminal-sessions.md)
- [Operator Terminal Session Test Matrix](../testing/operator-terminal-session-test-matrix.md)
- [Operator Terminal Session Implementation Plan](../implementation/operator-terminal-session-plan.md)
- [Project Resource Console Workflow Spec](./project-resource-console.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Workflow Purpose

Let operators answer and act on:

- can I inspect the selected server directly?
- can I inspect the source workspace used by the current resource deployment?
- can I run diagnostic commands while seeing terminal output in the Web console or CLI?

The workflow must not replace runtime logs, deployment logs, health, proxy configuration previews,
or diagnostic summaries. It is privileged manual operator access.

## User Flow

1. User opens a server page or resource detail page.
2. The surface offers a terminal affordance only when the selected scope can resolve a target and
   terminal access is allowed by runtime mode and policy.
3. The client dispatches `terminal-sessions.open`.
4. The command returns a terminal session descriptor with a transport path.
5. The client attaches to the transport and renders terminal output.
6. User input, resize, heartbeat, close, and backend output move as terminal session frames.
7. Navigation away, explicit close, disconnect, timeout, or backend exit closes the PTY/SSH/process.

## Ownership Rules

Server pages own server-scoped terminal entrypoints.

Resource detail pages own resource-scoped terminal entrypoints. Resource terminal access belongs
behind operational tabs or actions together with runtime logs and diagnostics. It must not displace
the resource configuration overview as the default tab.

Project pages may link to a resource before terminal open. They must not open project-owned
terminal sessions.

Deployment detail pages may deep-link to a resource terminal with a selected `deploymentId`, but
the terminal scope remains resource-owned.

## Workspace Resolution Rules

Server scope starts in the target account's login directory unless a later server profile operation
defines a safe default terminal directory.

Resource scope starts in the project workspace directory resolved from deployment runtime metadata.
The user-facing resource id, resource name, or slug must never be used as the checkout directory.

For current runtime adapters, expected mappings are:

| Runtime placement | Initial resource terminal directory |
| --- | --- |
| Local host process | Execution metadata `workdir`, with optional safe relative subdirectory. |
| Local Dockerfile/container source build | Execution metadata `sourceDir` or deployment runtime source directory, plus source `baseDirectory` when not already applied. |
| Local Docker Compose | Execution metadata `workdir` or execution `workingDirectory`. |
| SSH Git source | `<remoteRuntimeRoot>/ssh-deployments/<deploymentId>/source` plus source `baseDirectory`; default root is `/var/lib/yundu/runtime`. |
| SSH uploaded local workspace | Remote `remoteWorkdir` recorded by source preparation. |
| Docker image without source workspace | No resource workspace; reject with `terminal_session_workspace_unavailable` unless future container shell scope is accepted. |

## Transport Rules

Terminal transport is bidirectional. Server-Sent Events is not sufficient for the first terminal
implementation because user input and resize frames must flow back to the backend.

The transport must:

- attach only to an accepted session;
- close backend resources when the client disconnects;
- emit structured close and error frames;
- support resize frames;
- avoid sending raw private keys, tokens, or command strings in error details.

## Consumer Behavior

Web must:

- use a terminal emulator component only for rendering and input capture;
- dispatch `terminal-sessions.open` before attaching;
- close the session on navigation away;
- map structured errors to i18n keys;
- avoid storing terminal output in local state beyond the visible session buffer unless the user
  explicitly copies output.

CLI must:

- switch the local TTY into raw mode only after the command is accepted;
- restore the local TTY on exit, Ctrl-C, transport error, or disconnect;
- print structured errors in machine-readable modes.

HTTP/WebSocket must:

- reuse the command input schema for open/admission;
- propagate disconnects as abort/cancellation;
- keep terminal frame shapes transport-owned and documented.

## Current Implementation Notes And Migration Gaps

The first workflow slice is implemented for Web resource pages, Web server detail, HTTP/oRPC open,
WebSocket attach, runtime local-shell/generic-SSH gateway, and CLI descriptor commands.

CLI direct TTY attachment, local true PTY resize, timeout/audit handling, container exec, compose
service shells, and deployment-detail deep links remain follow-up work.

## Open Questions

- Should Web expose terminal as a top-level resource tab or an action inside an operations tab?
- Should deployment detail deep-link into resource terminal with `deploymentId`, or defer that until
  after resource-page terminal is implemented?
