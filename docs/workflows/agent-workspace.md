# Agent Workspace Workflow

## Contract

`Agent Workspace` is a convenience workflow over existing public operations. `workspaces.open`
provides the atomic application boundary for Profile-aware create-or-resume:

```text
repository-bindings.show
  -> optional activation-context initializer when Binding/default Profile is missing
  -> canonical Binding/Project/Profile re-read
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

The returned `workspaceId` is the Sandbox id. No second Workspace record or lifecycle exists. The
coordination entry also retains safe activation and target-selection evidence for create/resume and
status readback; it does not retain target topology or credentials.

## Task-Oriented Activation

Default `appaloft code` is the remote Agent door (ADR-117 / Spec 139). After login it requires a
default enrolled Server and a Project Binding, resolves the Binding remote SHA, and runs this
workflow. Laptop Git is a locator only; dirty trees are not uploaded and do not fail closed. The
banner is `Remote · <project> · <repo@sha> · <server> · my sandbox`.

`appaloft code --local` remains the Scratch session on this Mac (ADR-116 / Spec 138). It does not
run this durable workflow and creates no Sandbox, Binding, Profile or Cloud row.

`appaloft workspace open [path]` remains the durable Profile-aware door over this exact workflow
with local Git fail-closed. `--profile` and `--new` on `code` keep remote-open meaning and do not
inspect a dirty laptop tree.

Control-plane target selection for durable open happens before dispatch through the existing CLI
resolver. With no trusted remote selection, activation uses local dispatch; explicit remote
selection continues to use `--control-plane-profile` and the catalog-backed `workspaces.open`
contract. The Agent Workspace Profile selector remains `--profile` and must not be confused with
the control-plane profile. Scratch does not consult that resolver.

The no-subcommand `appaloft workspace` control TUI renders this workflow and its existing read
models. Its lifecycle and delivery actions dispatch the same public operations as the headless
commands; Preview creation defaults private with a bounded TTL, Task/Promotion writes require
confirmation, and Deployment Proof is queried rather than inferred from Promotion status. Native
Agent conversation/session semantics remain inside the Adapter-owned PTY or attach client.

## Preflight

Local Git inspection stays in the CLI adapter for durable `workspace open` / `workspace create`.
It resolves Git root, configured upstream remote, branch and HEAD SHA without reading or uploading
file contents. Before contacting the remote, the CLI prints a progress line. Remote `ls-remote` is
bounded; a hang or unreachable Git host fails closed with recovery guidance instead of waiting
silently. Staged, unstaged, or untracked changes; detached HEAD; missing upstream; and a remote
branch tip different from HEAD all fail before a control-plane mutation. Default Scratch `code`
does not run this preflight.

Repository locators normalize to a connector-neutral Repository Identity. `workspaces.open` uses
the exact tenant-scoped Repository Binding to find the Project, then resolves an explicit Profile
installation/name or the Project default installation. Profile resolution, named Credential
Connection resolution, Adapter/Template/capability compatibility, authorization, immutable source
resolution and a consumable admission/placement reservation all complete before Sandbox creation.

When Binding or Project default Profile state is missing, a deployment may inject an optional
activation-context initializer after source validation. The initializer must authorize and admit
the activation before it mutates context. It may then idempotently create or reuse only public
Project, Repository Binding and default Profile state, after which the workflow re-reads canonical
repositories. Default composition keeps the existing fail-closed setup errors. Existing,
conflicting, disabled, ambiguous or unauthorized state is never overwritten. Placement reservations
carry validated target class/source/reason evidence. Public command input cannot provide target
identity or forge that evidence.

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
7. A native-attach declarative Runtime launches its manifest-declared bounded `start` argv through
   the process-scoped credential grant, inside the Sandbox provider's private network namespace
   without publishing a host port. OpenCode uses this path for one `opencode serve` listener.
   Runtime creation waits for the declared HTTP healthcheck to succeed and only then records its
   Appaloft Sandbox process id below `/workspace` and marks the Runtime ready. Reconnect forwards
   the Runtime's safe credential bindings
   back to the harness and reuses a healthy server while its scoped model capability retains the
   bounded startup safety window; an expired, exited or unhealthy server is revoked and replaced
   before attach access is issued.

## Open Or Reconnect

The preferred Workspace lookup is keyed by tenant + subject + Project + Repository Identity +
branch. A matching non-terminal Sandbox with the same immutable source SHA is resumed/reconnected.
When the caller explicitly selects a Profile, lookup instead resumes the latest non-terminal
Workspace pinned to that resolved Profile within the same key, even if another Profile is globally
preferred. Omitting the selector keeps the global preference behavior.
`--new` creates another isolated Sandbox and makes it preferred without mutating the previous one.
A source SHA mismatch fails and directs the caller to `--new`; V1 never performs implicit Git sync.

Resume returns the originally persisted target-selection and activation evidence and does not
re-run placement or silently relocate the Workspace. A legacy coordination row without evidence is
read as `legacy-unclassified`; no managed, registered-server or local ownership is inferred.

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
