# Agent Workspace Workflow

## Contract

`Agent Workspace` is a convenience workflow over existing public operations:

```text
sandboxes.create
  -> optional argv-safe Git materialization
  -> sandboxes.agents.runtimes.create
  -> terminal-sessions.open (optional)
  -> sandbox-ports.expose (optional)
```

The returned `workspaceId` is the Sandbox id. No second Workspace record or lifecycle exists.

## Create

1. The caller reads `sandboxes.agents.harnesses.list` and selects a published adapter plus its
   admitted Sandbox Template.
2. `sandboxes.create` creates and reconciles one tenant-scoped Sandbox.
3. Optional Git source and branch materialization executes with validated refs and argv arrays.
4. `sandboxes.agents.runtimes.create` creates the harness Runtime.
5. If source or Runtime creation fails, the already-created Sandbox remains addressable. CLI/SDK error
   evidence includes the Sandbox id so the caller can retry Runtime creation or terminate it.
6. Pi is ready for managed Runs and interactive use through the Sandbox terminal.
7. OpenCode Runtime preparation verifies the pinned CLI version, starts one `opencode serve`
   listener inside the Sandbox provider's private network namespace without publishing a host
   port, and records only its Appaloft Sandbox process id below `/workspace`.

## Reconnect

`workspace terminal` dispatches `terminal-sessions.open(scope=sandbox)`. Detaching a client does not
close the PTY. A later attach replays bounded retained output and continues the same process while
the Terminal Session TTL and Sandbox remain active.

tmux may be installed and used by a template, but Appaloft does not require it for reconnect.

## Preview

`workspace preview` dispatches `sandbox-ports.expose`. The provider must return a safe URL,
visibility and expiry. Gateway routing, TLS and identity-aware access are adapter responsibilities.
The live URL expires or is revoked with its exposure and must not outlive Sandbox cleanup.

## Native Attach

An OpenCode adapter may publish `nativeSession=true`, a Sandbox-private server port and client
command.
`workspace attach` refreshes the Runtime-owned server and model capability, then issues a private
Sandbox port capability that expires no later than one hour through the configured gateway. It
substitutes that safe URL into the local attach handoff. A provider without scoped,
expiring and revocable private access reports attach as unavailable; it must never return a raw
provider host or long-lived SSH credential.

## Task Run

`workspace task` dispatches the canonical `sandboxes.agent-tasks.*` process-manager operations.
Agent execution survives client disconnect; the server resumes checks, Git evidence, previews and
immutable capture. Approval and delivery require an external control-plane actor.

## Lifecycle

- pause/resume delegate to the Sandbox and preserve its identity;
- Runtime termination stops harness-owned background processes but does not terminate the Sandbox;
- Workspace termination first terminates every non-terminal subordinate Agent Runtime so
  harness-owned processes and scoped capabilities are revoked, then delegates to Sandbox
  termination and removes exact provider-owned runtime state;
- snapshots and source artifacts remain explicit operations with their own retention rules.
