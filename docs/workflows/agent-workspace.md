# Agent Workspace Workflow

## Contract

`Agent Workspace` is a convenience workflow over existing public operations. `workspaces.open`
provides the atomic application boundary for Profile-aware create-or-resume:

```text
repository-bindings.show
  -> projects.show + project default Profile resolution
  -> agent-workspace-profiles.compile
  -> immutable source resolution + admission/placement reservation
  -> workspaces.open
       -> resume preferred sandboxes.show / sandboxes.resume
       -> or sandboxes.create
  -> optional argv-safe Git materialization
  -> sandboxes.agents.runtimes.create
  -> capability-driven attach (optional)
  -> sandbox-ports.expose (optional)
```

The returned `workspaceId` is the Sandbox id. No second Workspace record or lifecycle exists.

## Preflight

Local Git inspection stays in the CLI adapter. It resolves Git root, configured upstream remote,
branch and HEAD SHA without reading or uploading file contents. Staged, unstaged, or untracked
changes; detached HEAD; missing upstream; and a remote branch tip different from HEAD all fail
before a control-plane mutation.

Repository locators normalize to a connector-neutral Repository Identity. `workspaces.open` uses
the exact tenant-scoped Repository Binding to find the Project, then resolves an explicit Profile
installation/name or the Project default installation. Profile resolution, named Credential
Connection resolution, Adapter/Template/capability compatibility, authorization, immutable source
resolution and a consumable admission/placement reservation all complete before Sandbox creation.

## Create

1. The caller reads `sandboxes.agents.harnesses.list` and selects a published adapter plus its
   admitted Sandbox Template.
2. `sandboxes.create` creates and reconciles one tenant-scoped Sandbox.
3. Optional Git source and branch materialization executes with validated refs and argv arrays.
4. `sandboxes.agents.runtimes.create` creates the harness Runtime. A Profile with credential
   requirements accepts named references only, persists them with the immutable Profile/Adapter
   pin, and admits the exact child-process scope.
5. If source or Runtime creation fails after the Sandbox identity exists, CLI/SDK error evidence
   includes exact phase, Sandbox id, any Runtime/Terminal ids, retryability, recovery action and
   terminate action. A repeated open coordinates against the same partial identity instead of
   creating a duplicate.
6. Pi is ready for managed Runs and interactive use through the Sandbox terminal.
7. OpenCode Runtime preparation verifies the pinned CLI version, starts one `opencode serve`
   listener inside the Sandbox provider's private network namespace without publishing a host
   port, and records only its Appaloft Sandbox process id below `/workspace`.

## Open Or Reconnect

The preferred Workspace lookup is keyed by tenant + subject + Project + Repository Identity +
branch. A matching non-terminal Sandbox with the same immutable source SHA is resumed/reconnected.
`--new` creates another isolated Sandbox and makes it preferred without mutating the previous one.
A source SHA mismatch fails and directs the caller to `--new`; V1 never performs implicit Git sync.

For a managed-terminal Adapter, open reuses the current valid Agent-owned TUI Terminal Session.
Only an expired, terminal, or unrecoverable session causes the exact process-grant path to launch a
new child. The CLI immediately bridges to the returned session; it does not print a session id and
require a second command. Detaching a client does not close the PTY. Reattach replays bounded
retained output while the Terminal Session TTL and Sandbox remain active.

tmux may be installed and used by a template, but Appaloft does not require it for reconnect.

## Preview

`workspace preview` dispatches `sandbox-ports.expose`. The provider must return a safe URL,
visibility and expiry. Gateway routing, TLS and identity-aware access are adapter responsibilities.
The live URL expires or is revoked with its exposure and must not outlive Sandbox cleanup.

## Native Attach

A native-attach Adapter must publish an exact Sandbox-private server port and may publish a
validated local client handoff. Missing or invalid ports fail during Profile compilation before
Sandbox effects. `workspace attach` refreshes the Runtime-owned server capability, then issues a private
attach capability that expires no later than one hour through the configured gateway. An approved
`local-client-exec` capability permits the CLI to spawn the validated argv directly without a
shell. Otherwise the CLI displays the Adapter-declared argv. A provider without scoped, expiring
and revocable private access reports attach as unavailable; it never returns a raw provider host,
SSH material or long-lived credential.

## Declarative Agent Attach

`workspace.agent.attach()` preserves the Agent's own interface. Native-server Agents return their
scoped client command. Declarative TUI Agents return a managed-terminal session whose exact child
is launched through the same process credential grant port as headless tasks. Appaloft streams the
Agent-owned PTY and does not reimplement or parse the vendor TUI. Adapter capability, never Agent
name, selects this behavior.

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
