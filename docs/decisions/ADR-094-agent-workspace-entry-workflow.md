# ADR-094: Agent Workspace Entry Workflow

Status: Accepted

Date: 2026-07-23

## Context

Application developers need one user-facing way to create an isolated coding workspace, run a
supported coding-agent harness, reconnect to an interactive terminal, and expose an expiring
development port. Appaloft already owns the durable concepts required for that journey:

- `Sandbox` owns the isolated workspace and its pause/resume/termination lifecycle;
- `SandboxAgentRuntime` owns a harness-neutral agent runtime subordinate to one Sandbox;
- `TerminalSession` owns the reconnectable PTY transport;
- Sandbox port operations own expiring controlled access descriptors.

Creating a separate Cloud-only Workspace aggregate would duplicate Sandbox lifecycle state, make
Community and Cloud expose different product languages, and risk drift between a Workspace status
and its bound Sandbox status.

## Decision

1. `Agent Workspace` is a public Appaloft entry workflow, not a new aggregate root.
2. Its durable workspace identity is the selected `SandboxId`; public convenience surfaces may
   render the same value as `workspaceId`, but the canonical operation contracts remain Sandbox
   contracts.
3. Workspace creation composes `sandboxes.create` followed by
   `sandboxes.agents.runtimes.create`. It does not introduce `agent-workspaces.create`.
4. Workspace list/show compose `sandboxes.list/show` with
   `sandboxes.agents.runtimes.list`. Pause, resume, terminate, terminal, file, process and port
   actions dispatch their existing canonical operations.
5. Pi and OpenCode are public harness adapters behind `SandboxAgentHarness`. Harness names never
   enter aggregate types or operation families.
6. The complete first-phase public workflow supports:
   - Pi managed Runs plus a reconnectable Sandbox terminal;
   - OpenCode managed Runs plus a Sandbox-local `opencode serve` process and an attach command;
   - terminal detach/reattach without requiring tmux;
   - optional Git repository materialization into the Sandbox workspace before Runtime creation;
   - expiring Sandbox port previews when the selected provider configures a port publisher;
   - `connect` as the stable local connection affordance over the managed terminal gateway;
   - browser Console access over the same canonical operations.
7. OpenCode session state is stored below the Sandbox workspace by setting `HOME=/workspace` and
   `XDG_DATA_HOME=/workspace/.local/share`. Pause/resume preserves it; Sandbox termination removes
   it unless the user explicitly captures a Sandbox Snapshot or Source Artifact.
8. A native remote OpenCode endpoint is never exposed directly by the core workflow. The server
   listens only inside the Sandbox provider's private network namespace so a hosted or self-hosted
   gateway can translate a scoped, expiring access capability to it. The Sandbox publishes no
   provider host port for this server. Provider credentials, raw host addresses and long-lived
   server passwords do not enter the public descriptor.
9. Cloud may add placement, entitlement, quotas, metering, managed templates, identity-aware
   gateways and managed preview domains. Those policies consume the public workflow and must not
   redefine Agent Workspace lifecycle or operation names.
10. Agent harness integration uses a public capability descriptor. A descriptor declares the
    interaction transport, managed-task support, native-session recovery, persistent paths,
    healthcheck and optional attach metadata. Console, CLI and SDK affordances are derived from
    those capabilities rather than harness-name conditionals.
11. A scoped native attach access descriptor may be issued only after the application service
    refreshes the Runtime-owned server and model capability, and only by a gateway that enforces
    caller scope, expiry no later than one hour and revocation. The descriptor never contains a
    provider host, provider credential or direct long-lived server address.

## Consequences

- Community, self-hosted, Cloud and third-party providers share one Workspace workflow and one
  operation language.
- `appaloft workspace ...` and SDK `workspaces` are convenience surfaces over canonical public
  operations, similar to Quick Deploy.
- Git materialization remains an entry-workflow step over Sandbox execution. Repository identity is
  validated and argv-based execution is used; repository credentials remain credential-broker
  concerns. Hosted Docker workers keep Sandbox containers on an internal network and satisfy an
  allowlist policy through an authenticated provider egress adapter; they never grant the
  container an unrestricted route to the internet.
- A Workspace is independently isolated when it has a distinct Sandbox. Two team members do not
  share processes, filesystem or ports unless a caller deliberately reuses the same Sandbox.
- Terminal reconnect depends on the Appaloft terminal gateway while the process is alive. tmux is
  optional user software, not an Appaloft correctness dependency.
- Public preview URLs remain capability-dependent: the workflow can request them, while concrete
  URL routing, authentication and TLS belong to the provider/gateway adapter.

## Migration Gaps

- Existing alpha clients without repository, capability or attach fields remain compatible.
- Pi interactive sessions use the reconnectable Sandbox terminal; managed Pi Runs continue to use
  explicit Appaloft Run lineage.
- Providers that do not implement an identity-aware HTTP/WebSocket gateway report native attach as
  unavailable instead of exposing the OpenCode Sandbox server directly.
