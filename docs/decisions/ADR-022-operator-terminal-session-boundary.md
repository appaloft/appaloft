# ADR-022: Operator Terminal Session Boundary

Status: Accepted

Date: 2026-04-16

## Decision

Appaloft may expose interactive operator terminals through an explicit application command named
`terminal-sessions.open`.

The command opens an ephemeral interactive session. It is not a Resource or Deployment aggregate
mutation, and terminal input/output must not be persisted as domain state by default.

The first supported scopes are:

- server scope: open a shell on a selected deployment target/server;
- resource scope: open a shell on the target that currently hosts a selected resource and start in
  the resolved project workspace directory for the selected or latest observable deployment.

Resource terminal directory resolution must use deployment runtime placement metadata, not a
resource name or resource id as a filesystem path. Current deployment workspaces remain
deployment-attempt scoped. A resource terminal resolves the active workspace through
`resourceId -> deploymentId -> runtime plan/execution metadata -> working directory`.

For Git and artifact sources, the checkout or materialized source root is owned by the deployment
attempt. The source binding's `baseDirectory` selects the project directory inside that source root.
This keeps `git clone` and source materialization isolated across retries, concurrent deployments,
resource renames, and resource slug changes.

The runtime adapter boundary is:

```text
terminal-sessions.open
  -> TerminalSessionGateway port
      -> local-shell PTY adapter
      -> generic-SSH PTY adapter
      -> future provider-native terminal adapters
```

The Web console must render terminal UI as a consumer of this command and the terminal transport.
It must not run shell, SSH, PTY, Docker, or filesystem logic inside Svelte components or SvelteKit
endpoints.

## Context

Resource detail already owns runtime logs, health, diagnostic summary, access, and deployment
history. Server pages own deployment-target registration, credential configuration, connectivity
testing, and proxy repair.

Operators need a direct shell during early self-hosted setup and diagnosis:

- server pages need a target-level terminal for connectivity, Docker, proxy, and host inspection;
- resource pages need a resource-scoped terminal that opens in the project directory used by the
  current deployment attempt;
- terminal access is interactive and bidirectional, unlike runtime logs or deployment progress.

The current runtime implementation prepares deployment workspaces by deployment id:

- local execution stores runtime work under the configured data directory's runtime root,
  `local-deployments/<deploymentId>`;
- generic SSH execution stores local control files under `ssh-deployments/<deploymentId>` and
  materializes remote source under the configured remote runtime root,
  `<remoteRuntimeRoot>/ssh-deployments/<deploymentId>/source`;
- Git clone uses a cloneable repository locator and optional `gitRef`, then applies
  `baseDirectory` after checkout.

Using a resource id, resource name, or slug as the clone directory would make retries and
concurrent deployment attempts share mutable source trees. It would also make filesystem layout
depend on renameable user-facing text.

## Options Considered

### Option A: Add A Web-Only SSH Terminal

This would let the Svelte app connect directly to a WebSocket or SSH helper without defining a
business operation.

This option is rejected because it hides privileged runtime behavior in the Web transport and
violates the CLI/API/Web parity rules.

### Option B: Treat Terminal Output As Runtime Logs

This would reuse `resources.runtime-logs` and render terminal output as another log stream.

This option is rejected because a terminal is bidirectional operator control, not application
stdout/stderr observation. Runtime logs remain read-only and resource-owned.

### Option C: Add Explicit Ephemeral Terminal Sessions

This introduces a command boundary and runtime port for opening terminal sessions while keeping the
session ephemeral and transport-specific interaction frames outside aggregate state.

This option is accepted.

## Chosen Rule

`terminal-sessions.open` is an accepted command. Code Round adds it to `CORE_OPERATIONS.md` and
`packages/application/src/operation-catalog.ts` with Web/API/CLI entrypoints and focused
application coverage.

Command input must use a discriminated scope:

```ts
type OpenTerminalSessionCommandInput = {
  scope:
    | { kind: "server"; serverId: string }
    | { kind: "resource"; resourceId: string; deploymentId?: string };
  initialRows?: number;
  initialCols?: number;
  relativeDirectory?: string;
};
```

`relativeDirectory` is optional and, for resource scope, is resolved under the resource deployment
workspace. It must not be a host absolute path, URL, path with `..`, or shell fragment. Server scope
may support a configured server default directory later, but arbitrary absolute directory input must
not be the first public contract.

The command returns an accepted session descriptor:

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

The interactive transport may use WebSocket frames for input, output, resize, heartbeat, and close
events. Those frames are part of the terminal session transport contract, not separate business
commands. The WebSocket upgrade path must still dispatch `terminal-sessions.open` or attach to a
session opened by that command before it starts shell IO.

Server scope starts in the target user's login directory unless a later server profile operation
introduces a safe default terminal directory.

Resource scope resolves the working directory in this order:

1. Use the supplied `deploymentId` after verifying it belongs to `resourceId`.
2. Otherwise select the latest observable deployment/runtime instance for the resource.
3. Prefer execution metadata recorded by the runtime adapter, such as `workdir`,
   `remoteWorkdir`, `sourceDir`, or host-process `workdir`.
4. Fall back to `runtimePlan.execution.workingDirectory` only when it is meaningful for the
   selected runtime backend.
5. Apply the source binding `baseDirectory` only once; adapters must not double-append it.
6. Reject the command with `terminal_session_workspace_unavailable` when a safe working directory
   cannot be resolved.

The initial implementation should open a host/SSH shell in the workspace directory. Container exec
or compose service shell is a future scope because it needs a separate target selection rule and
clear privilege semantics.

Terminal sessions must:

- require an authenticated/authorized actor when auth is enabled;
- be disabled or explicitly gated in hosted-control-plane mode until a provider-native isolation
  boundary exists;
- close backend PTY, SSH, and child-process resources on disconnect, timeout, or command close;
- avoid persisting terminal input/output by default;
- record only safe audit metadata such as actor, scope, server id, resource id, deployment id,
  started/closed timestamps, close reason, and coarse error code;
- never place private keys, access tokens, environment secret values, raw commands, or terminal
  output in error details.

## Consequences

The feature is resource/server owned in the UI but implemented as a shared terminal session
business capability.

Resource terminal UX can start in the deployed project directory without changing deployment
workspace layout. Deployment-attempt scoped clone/materialization remains the default because it is
safe for `git clone`, retries, concurrent deploys, and resource rename.

The Web implementation should use a terminal emulator library for rendering, while shell IO belongs
to the backend runtime adapter. The frontend package may wrap the terminal emulator in Svelte, but
the business contract remains the same.

## Governed Specs

- [terminal-sessions.open Command Spec](../commands/terminal-sessions.open.md)
- [Operator Terminal Session Workflow Spec](../workflows/operator-terminal-session.md)
- [Operator Terminal Session Error Spec](../errors/terminal-sessions.md)
- [Operator Terminal Session Test Matrix](../testing/operator-terminal-session-test-matrix.md)
- [Operator Terminal Session Implementation Plan](../implementation/operator-terminal-session-plan.md)
- [Project Resource Console Workflow Spec](../workflows/project-resource-console.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](./ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-013: Project Resource Navigation And Deployment Ownership](./ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-018: Resource Runtime Log Observation](./ADR-018-resource-runtime-log-observation.md)
- [ADR-021: Docker/OCI Workload Substrate](./ADR-021-docker-oci-workload-substrate.md)

## Current Implementation Notes And Migration Gaps

The first implementation adds the `terminal-sessions.open` application command, operation catalog
entry, runtime terminal gateway, HTTP/oRPC open endpoint, WebSocket attach endpoint, CLI dispatch
commands, and Web terminal panel for resource and server pages.

The current runtime adapters already record enough metadata for many resource workspace cases:
local host-process metadata records `workdir`; local and SSH Compose paths can record `workdir`;
SSH source preparation records `remoteWorkdir`; remote Git materialization uses
`<remoteRuntimeRoot>/ssh-deployments/<deploymentId>/source` plus optional `baseDirectory`.
The default remote runtime root is `/var/lib/appaloft/runtime` and can be overridden with
`APPALOFT_REMOTE_RUNTIME_ROOT`.

Current local-shell terminal support uses a Bun subprocess bridge rather than a true local PTY, so
resize is a no-op for local targets. Generic SSH uses `ssh -tt` for an interactive remote TTY.
CLI dispatch commands return descriptors, but direct CLI TTY attachment remains a follow-up.

## Open Questions

- Should terminal session audit metadata be ephemeral only, persisted in a dedicated audit table, or
  projected into an operator activity read model?
- Should resource terminals later support `container-exec` and compose service shells, or should v1
  stay limited to host/SSH workspace shells?
- Should server profiles gain a durable default terminal directory operation before server-scope
  terminals are exposed beyond login-directory shells?
