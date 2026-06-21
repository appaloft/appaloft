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
8. Operators can list/show active sessions and explicitly close or expire sessions through
   `terminal-sessions.list`, `terminal-sessions.show`, `terminal-sessions.close`, and
   `terminal-sessions.expire` without reading terminal input/output.

## Ownership Rules

Server pages own server-scoped terminal entrypoints inside the Runtime information domain.

Resource detail pages own resource-scoped terminal entrypoints. Resource terminal access belongs
behind operational tabs or actions together with runtime logs and diagnostics. It must not displace
the resource configuration overview as the default tab.

Project pages may link to a resource before terminal open. They must not open project-owned
terminal sessions.

Deployment detail pages may deep-link to a resource terminal with a selected `deploymentId`, but
the terminal scope remains resource-owned.

The first Web placement is resolved as a resource-owned operational tab. Deployment detail pages
link into that tab with `tab=terminal&deploymentId=<id>`, and the resource page
preserves the selected deployment id when opening `terminal-sessions.open`.
Server terminal entrypoints link into the server Runtime information domain with
`tab=runtime&section=terminal`.

## Workspace Resolution Rules

Server scope starts in the target account's login directory unless a later server profile operation
defines a safe default terminal directory.

Resource scope starts in the project workspace directory resolved from deployment runtime metadata,
or enters the retained runtime container/service target directly when a containerized deployment has
no source workspace. The user-facing resource id, resource name, or slug must never be used as the
checkout directory. Source locators such as HTTPS Git URLs and SSH-style Git remotes must not be
used as terminal working directories when adapter workspace metadata is missing.

For current runtime adapters, expected mappings are:

| Runtime placement | Initial resource terminal directory |
| --- | --- |
| Local host process | Execution metadata `workdir`, with optional safe relative subdirectory. |
| Local Dockerfile/container source build | Execution metadata `sourceDir` or deployment runtime source directory, plus source `baseDirectory` when not already applied. |
| Local Docker Compose | Execution metadata `workdir` or execution `workingDirectory`. |
| SSH Git source | `<remoteRuntimeRoot>/ssh-deployments/<deploymentId>/source` plus source `baseDirectory`; default root is `/var/lib/appaloft/runtime`. |
| SSH uploaded local workspace | Remote `remoteWorkdir` recorded by source preparation. |
| Docker image without source workspace | No resource workspace; open the retained container target directly when runtime metadata or deterministic runtime names resolve the container. |
| Docker image with `relativeDirectory` but no source workspace | Reject with `terminal_session_workspace_unavailable`; relative directories are only below a resolved workspace root, not arbitrary container paths. |

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
- expose active terminal session lifecycle readback from Instance management through
  `terminal-sessions.list`, with close and old-session-expire controls that never attach to
  transports or read terminal output;
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

## Current Implementation Notes And Governed Follow-Ups

The first workflow slice is implemented for Web resource pages, Web server detail, HTTP/oRPC open,
WebSocket attach, runtime local-shell/generic-SSH gateway, Docker container `exec` when retained or
inferrable deployment metadata identifies the container, Docker Compose service `exec` when
retained metadata identifies the Compose file, project, and service, CLI descriptor commands, and
explicit CLI `--attach` sessions. Deployment detail pages now deep-link to the Resource terminal tab
with the selected deployment id, so the resource-owned terminal command can resolve that
deployment's workspace instead of always falling back to the latest runtime-owning attempt.

Active session list/show/close/expire is modeled as gateway-owned lifecycle over ephemeral
sessions. Web Instance management can list active sessions, close one active session, and expire
old active sessions without reading terminal output. The runtime gateway records durable
`terminal-session-opened` and `terminal-session-closed` audit rows when an audit recorder is
configured; those rows contain safe metadata only and do not make terminal input/output readable.
When `terminal-sessions.expire` omits an explicit cutoff, the self-hosted runtime gateway applies a
configured activity-aware active-session TTL, defaulting to 3600 seconds and configurable through
`APPALOFT_TERMINAL_SESSION_ACTIVE_TTL_SECONDS`. Terminal input, resize frames, and backend output
refresh the activity timestamp used by omitted-cutoff expiry.
Active attach transports retain a bounded in-memory output tail for reconnect replay, defaulting to
65536 bytes and configurable through `APPALOFT_TERMINAL_SESSION_OUTPUT_RETENTION_BYTES`; `0`
disables replay. This replay is transport-only and does not make terminal output readable through
list/show, lifecycle commands, audit rows, or durable read models.

HTTP WebSocket resize frames and CLI `--attach` initial `--rows`/`--cols` dimensions are forwarded
to the attached terminal session, and the runtime gateway invokes subprocess resize hooks when the
spawn adapter exposes them. Bun.WebView coverage exercises Instance lifecycle list/expire/close
without rendering terminal output, resource and server terminal open/attach flows with a mocked
attach socket and initial resize frame, and verifies client-side navigation sends a close frame for
an attached resource terminal. Local Bun pipe sessions do not claim host PTY resize semantics unless
the selected runtime adapter exposes a resize hook; this is an adapter capability boundary, not a
separate Web affordance gap. CLI direct TTY attachment is implemented through explicit `--attach`;
default CLI terminal commands still print the descriptor for scriptable workflows.

## Open Questions

- Current WebView coverage uses a mocked attach socket while CLI/Web resize frame routing and
  subprocess resize-hook behavior are covered at the command/transport boundary.
