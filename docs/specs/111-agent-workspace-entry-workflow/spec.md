# Agent Workspace Entry Workflow

## Status

- Round: Spec Round complete; Test-First and Code Round authorized
- Artifact state: ready
- Roadmap target: next post-1.3 additive minor
- Compatibility impact: additive public minor capability

## Business Outcome

An application developer can use Public Appaloft to create one isolated remote coding workspace,
select Pi or OpenCode, reconnect from another terminal, and expose an expiring development port
without learning the lower-level Sandbox operation sequence.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Agent Workspace | Public entry workflow over one Sandbox and its Agent Runtime. | Public CLI/SDK/docs | `workspaceId` is the underlying `sandboxId`. |
| Workspace Harness | Selected harness adapter for a Workspace. | Adapter boundary | Pi and OpenCode are adapter keys. |
| Managed Terminal | Reconnectable Appaloft Terminal Session scoped to a Sandbox. | Interactive access | tmux is optional. |
| Native Attach | Harness-native client connected through a scoped gateway to a Sandbox-local server. | Hosted adapter | Direct provider/host access is forbidden. |
| Development Preview | Expiring port exposure from the live Sandbox. | Runtime access | Promotion Candidate Preview is distinct. |
| Workspace Source | Optional Git repository and revision materialized before Runtime creation. | Entry workflow | Resource Source Binding is distinct. |
| Agent Capability Descriptor | Harness-neutral interaction, task, recovery, persistence and health capabilities. | Published adapter language | Harness-name UI branching is forbidden. |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| AGENT-WS-FLOW-001 | Create Pi Workspace | An admitted Pi Sandbox Template exists | Public CLI or SDK creates a Workspace | One ready Sandbox and one ready Pi Runtime are returned; `workspaceId = sandboxId`. |
| AGENT-WS-FLOW-002 | Create OpenCode Workspace | An admitted OpenCode Sandbox Template exists | Public CLI or SDK creates a Workspace | One ready Sandbox and one ready OpenCode Runtime are returned; the private-network OpenCode server is alive without a published host port and session data is below `/workspace`. |
| AGENT-WS-FLOW-003 | Observe Workspace | Tenant-scoped Workspaces exist | list/show is requested | The caller receives Sandbox lifecycle plus subordinate Runtime descriptors without a duplicate Workspace record. |
| AGENT-WS-TERM-004 | Reconnect terminal | A terminal session remains active | the client disconnects and later attaches again | The PTY remains alive, bounded retained output is replayed and no tmux dependency is required. |
| AGENT-WS-PREVIEW-005 | Expose development port | The provider supports controlled port publishing | port 3000 is exposed with visibility and expiry | A safe expiring URL descriptor is returned and revoke removes that exact exposure. |
| AGENT-WS-ISOLATION-006 | Separate team work | Two members create distinct Workspaces | both run processes and expose the same internal port | Each Sandbox keeps independent filesystem, process, terminal and exposure identity. |
| AGENT-WS-LIFE-007 | Pause/resume/terminate | A Workspace is ready | lifecycle commands are used | Existing Sandbox identity and files survive pause/resume; termination permanently removes owned runtime state. |
| AGENT-WS-OPEN-008 | Run OpenCode task | OpenCode Runtime is ready | a fresh or continued managed Run is submitted | `opencode run --attach` emits bounded neutral events; cancellation terminates the client process while the server remains available. |
| AGENT-WS-SOURCE-014 | Materialize repository | A safe HTTPS Git repository locator and optional revision are supplied | Workspace creation executes | The repository is cloned with argv-based execution through the provider-enforced egress allowlist before Runtime creation; failure returns the created Workspace id and no false-ready Runtime. |
| AGENT-WS-CONNECT-015 | Connect from another client | A Workspace is ready and its managed terminal remains alive | `workspace connect` or Console terminal attaches | The same PTY is reachable through scoped Appaloft access without distributing host SSH credentials. |
| AGENT-WS-ATTACH-016 | Native attach | A Runtime reports native-attach and the gateway supports scoped access | attach access is requested | A short-lived revocable descriptor is returned; otherwise capability readback reports unavailable and no direct Sandbox server endpoint is exposed. |
| AGENT-WS-WEB-017 | Browser Workspace | The caller can read canonical Sandbox operations | the Workspace page is opened | Lifecycle, capability-driven actions, terminal, Runs and previews use the same public operation contracts. |
| AGENT-ADAPTER-018 | Capability descriptor | A Pi, OpenCode or custom adapter is registered | Runtime readback is requested | The descriptor reports task mode, interaction, recovery, persistent paths and healthcheck without exposing credentials or provider handles. |
| AGENT-WS-EGRESS-019 | Controlled repository egress | A Docker Sandbox requests an allowlist policy | the provider provisions or updates it | The Sandbox has no direct internet route; an authenticated proxy permits only the exact domain/CIDR and port rules, blocks reserved addresses and is revoked with Sandbox cleanup. |

## Domain Ownership

- Bounded contexts: Execution Sandbox and Sandbox Agent Runtime.
- Aggregate/resource owners: `Sandbox`, `SandboxAgentRuntime`, `SandboxAgentRun`.
- Entry workflow owner: public application/CLI/SDK composition.
- Upstream: tenant execution context and admitted Sandbox Templates.
- Downstream: harness adapters, Terminal Session gateway, Sandbox port publisher and provider egress
  policy adapter.

## Public Surfaces

- API/oRPC: existing canonical Sandbox, Agent Runtime, Terminal Session and Sandbox Port operations,
  plus the neutral `sandboxes.agents.harnesses.list` adapter catalog query.
- CLI: `appaloft workspace create/list/show/pause/resume/terminate/connect/terminal/attach/preview`
  and `workspace harness list`.
- SDK: `appaloft.workspaces.create/list/show` convenience handles over generated operations.
- Web/UI: Workspace list/detail, capability-driven actions, managed terminal, Runs and previews over
  the same operations.
- Config: admitted Pi/OpenCode templates and provider-specific port/model/egress gateway
  configuration.
- Public docs/help: Agent Workspace task page and CLI help.

## Non-Goals

- A second Workspace aggregate or persistence table.
- Resource source binding or Deployment creation during Workspace materialization.
- Exposing raw SSH, Docker, provider handles or an unauthenticated OpenCode server.
- Treating a live Development Preview as an immutable Promotion Candidate Preview.
- Generic chat/session ownership.

## Open Questions

None.
