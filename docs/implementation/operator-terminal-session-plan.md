# Operator Terminal Session Implementation Plan

## Scope

Implement `terminal-sessions.open` as the first explicit operator terminal capability for server
and resource pages.

The first Code Round should deliver:

- application command/schema/handler/use case;
- terminal gateway port and token;
- local-shell subprocess terminal bridge and generic-SSH TTY adapter;
- HTTP/WebSocket open/attach transport;
- CLI terminal command;
- Web resource and server page terminal entrypoints;
- focused command tests, with adapter, transport, CLI, and Web tests to follow.

Container exec and compose service shells are out of scope for the first slice.

## Governing Sources

- [ADR-022: Operator Terminal Session Boundary](../decisions/ADR-022-operator-terminal-session-boundary.md)
- [terminal-sessions.open Command Spec](../commands/terminal-sessions.open.md)
- [Operator Terminal Session Workflow Spec](../workflows/operator-terminal-session.md)
- [Operator Terminal Session Error Spec](../errors/terminal-sessions.md)
- [Operator Terminal Session Test Matrix](../testing/operator-terminal-session-test-matrix.md)
- [Project Resource Console Workflow Spec](../workflows/project-resource-console.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Implementation Steps

1. Application operation:
   - add `OpenTerminalSessionCommand`, schema, handler, and use case;
   - add `TerminalSessionGateway`, `TerminalSession`, and terminal frame types to application ports;
   - add DI token and composition registration;
   - add `terminal-sessions.open` to `CORE_OPERATIONS.md` and `operation-catalog.ts`.
2. Workspace resolution:
   - implement a resource workspace resolver that consumes resource/deployment read models and
     runtime plan metadata;
   - prefer deployment execution metadata over reconstructing paths;
   - validate relative directories with a safe path value object or equivalent command-schema
     narrowing.
3. Runtime adapters:
   - local-shell adapter opens a Bun-compatible subprocess bridge in the resolved cwd;
   - generic-SSH adapter opens an interactive shell through SSH using resolved server credentials;
   - both adapters support input, output, resize, close, and timeout cleanup.
4. Transport:
   - add command endpoint for admission and WebSocket attach endpoint for bidirectional frames;
   - ensure WebSocket close aborts the backend session;
   - keep terminal frames separate from domain aggregate state.
5. CLI:
   - add `appaloft terminal open --server <serverId>`;
   - add `appaloft resource terminal <resourceId> [--deployment <deploymentId>]`;
   - restore local TTY on all exit paths.
6. Web:
   - add an xterm-based Svelte terminal component;
   - place resource terminal behind the resource operational surface, after overview/configuration;
   - add server terminal action on server detail/list when terminal is allowed;
   - add i18n keys for all terminal copy and error states.
7. Tests:
   - implement the cases in the test matrix with fake gateway coverage first;
   - add runtime adapter tests for local and generic-SSH command/cleanup behavior;
   - add Web smoke/E2E coverage with a fake or local terminal gateway.

## Frontend Library Direction

Use `@xterm/xterm` as the terminal emulator and add only the official addons needed for the first
slice, especially fit and attach/WebSocket behavior. A Svelte wrapper may be introduced if it stays
thin and does not own business behavior.

The Web component must remain a rendering/input adapter over `terminal-sessions.open`. It must not
execute SSH, shell, or filesystem logic.

## Workspace Layout Decision

Keep deployment workspaces deployment-id scoped.

The terminal implementation should resolve current paths from runtime metadata instead of changing
the current `git clone` or source materialization ownership model. Remote runtime roots must be
outside `/tmp` by default and configurable per installation; cleanup or retention policy remains a
separate follow-up behavior.

## Verification

Run at least:

- targeted application command/use case tests;
- targeted runtime terminal adapter tests;
- targeted HTTP/WebSocket transport tests;
- targeted CLI terminal tests;
- `bun run typecheck` from `apps/web`;
- `bun run lint` or a focused Biome check on changed files.

## Current Implementation Notes And Governed Follow-Ups

Implemented:

- application command/schema/handler/use case, terminal gateway port, token, and operation catalog
  entry;
- resource workspace resolution from deployment runtime metadata for `workdir`, `remoteWorkdir`,
  and `runtimePlan.execution.workingDirectory`;
- runtime terminal gateway for `local-shell` and `generic-ssh`;
- HTTP/oRPC open endpoint and WebSocket attach endpoint;
- Web resource terminal tab, server detail terminal panel, and server list terminal deep-link using
  `@xterm/xterm` and `@xterm/addon-fit`;
- CLI descriptor commands for `appaloft server terminal <serverId>` and
  `appaloft resource terminal <resourceId>`, with explicit `--attach` local TTY bridging for
  interactive sessions.

Baseline coverage:

- local-shell uses a Bun subprocess bridge; resize is forwarded through the terminal transport and
  invokes subprocess resize hooks when the spawn adapter exposes them.
- Bun.WebView resource/server terminal coverage verifies Web open/attach, selected deployment or
  server scope, initial resize forwarding, client-side navigation cleanup, and explicit close action
  cleanup with a mocked attach socket; source guards verify the server list terminal entrypoint
  deep-links to the server terminal tab.
- Active attach transports replay a bounded in-memory terminal output tail on reconnect without
  exposing terminal content through lifecycle readback or audit rows.
- `sourceDir` and source `baseDirectory` workspace normalization are implemented for resource
  terminal workspace resolution; adapter-resolved `workdir` and `remoteWorkdir` remain final
  directories to avoid duplicate monorepo subpaths.
- HTTP/WebSocket attach coverage exists for input and resize routing, and Bun.WebView coverage
  exists for resource/server open+attach, selected deployment scope, initial resize forwarding, and
  client-side navigation cleanup plus explicit close action cleanup with a mocked attach socket.

Governed follow-ups:

- optional host PTY adapter selection for platforms that need resize semantics beyond Bun
  subprocess pipes;
- provider-native terminals after an isolation boundary is accepted;
- durable server default terminal directories after a server-profile operation is accepted.

Implemented after the first slice:

- runtime adapter command construction for local-shell and generic-SSH Docker container `exec`;
- runtime adapter command construction for local-shell and generic-SSH Docker Compose service
  `exec` when retained execution metadata resolves the Compose file/project and resource service.
- CLI `--attach` for server and resource terminal commands opens a session through the shared
  command schema, attaches to the accepted gateway session, bridges local stdin/stdout/stderr, and
  restores raw-mode state when the terminal closes.
- Web Instance management lists active terminal sessions through `terminal-sessions.list`, closes
  one active session through `terminal-sessions.close`, and expires old sessions through
  `terminal-sessions.expire` without attaching to terminal transports or reading terminal output;
  Bun.WebView coverage exercises the lifecycle read/expire/close flow.
- runtime terminal gateway writes durable `terminal-session-opened` and
  `terminal-session-closed` audit rows through the configured audit recorder, scoped to the server
  or resource aggregate with safe metadata only.

The first terminal slice intentionally does not bundle a platform PTY dependency. Runtime adapters
that need host PTY behavior must expose it behind the existing subprocess resize hook, keeping the
Web, CLI, command, and transport contracts unchanged.
