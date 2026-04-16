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
   - add `yundu terminal open --server <serverId>`;
   - add `yundu resource terminal <resourceId> [--deployment <deploymentId>]`;
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

## Current Implementation Notes And Migration Gaps

Implemented:

- application command/schema/handler/use case, terminal gateway port, token, and operation catalog
  entry;
- resource workspace resolution from deployment runtime metadata for `workdir`, `remoteWorkdir`,
  and `runtimePlan.execution.workingDirectory`;
- runtime terminal gateway for `local-shell` and `generic-ssh`;
- HTTP/oRPC open endpoint and WebSocket attach endpoint;
- Web resource terminal tab and server detail terminal panel using `@xterm/xterm` and
  `@xterm/addon-fit`;
- CLI descriptor commands for `yundu server terminal <serverId>` and
  `yundu resource terminal <resourceId>`.

Known gaps:

- local-shell uses a Bun subprocess bridge instead of a true PTY, so resize is a no-op locally;
- CLI commands open sessions and print descriptors but do not yet attach the local TTY;
- `sourceDir` and source `baseDirectory` workspace normalization remain follow-up work;
- runtime adapter, HTTP/WebSocket, interactive CLI, and Web E2E coverage remain follow-up tests;
- audit persistence, timeout policy, container exec, compose service shell selection,
  provider-native terminals, and durable server default terminal directories remain future work.

## Open Questions

- Which PTY library should be used in Bun for local PTY support, and what fallback is acceptable if
  the library does not support the current runtime platform?
- Should the generic-SSH terminal adapter use direct SSH subprocess bridging first, or introduce a
  reusable SSH session manager shared with runtime logs?
