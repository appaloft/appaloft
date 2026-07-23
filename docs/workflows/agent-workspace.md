# Agent Workspace Workflow

## Contract

`Agent Workspace` is a convenience workflow over existing public operations:

```text
sandboxes.create
  -> sandboxes.agents.runtimes.create
  -> terminal-sessions.open (optional)
  -> sandbox-ports.expose (optional)
```

The returned `workspaceId` is the Sandbox id. No second Workspace record or lifecycle exists.

## Create

1. The caller selects an admitted Sandbox Template and `pi` or `opencode`.
2. `sandboxes.create` creates and reconciles one tenant-scoped Sandbox.
3. `sandboxes.agents.runtimes.create` creates the harness Runtime.
4. If Runtime creation fails, the already-created Sandbox remains addressable. CLI/SDK error
   evidence includes the Sandbox id so the caller can retry Runtime creation or terminate it.
5. Pi is ready for managed Runs and interactive use through the Sandbox terminal.
6. OpenCode Runtime preparation verifies the pinned CLI version, starts one loopback-only
   `opencode serve`, and records only its Appaloft Sandbox process id below `/workspace`.

## Reconnect

`workspace terminal` dispatches `terminal-sessions.open(scope=sandbox)`. Detaching a client does not
close the PTY. A later attach replays bounded retained output and continues the same process while
the Terminal Session TTL and Sandbox remain active.

tmux may be installed and used by a template, but Appaloft does not require it for reconnect.

## Preview

`workspace preview` dispatches `sandbox-ports.expose`. The provider must return a safe URL,
visibility and expiry. Gateway routing, TLS and identity-aware access are adapter responsibilities.
The live URL expires or is revoked with its exposure and must not outlive Sandbox cleanup.

## Lifecycle

- pause/resume delegate to the Sandbox and preserve its identity;
- Runtime termination stops harness-owned background processes but does not terminate the Sandbox;
- Workspace termination delegates to Sandbox termination and removes exact provider-owned runtime
  state;
- snapshots and source artifacts remain explicit operations with their own retention rules.
