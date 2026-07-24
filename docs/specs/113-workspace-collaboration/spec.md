# Workspace Collaboration

## Status

- Round: Code and Docs Round complete
- Artifact state: implemented
- Roadmap target: fourth Agent Workspace product phase
- Compatibility impact: additive public minor capability

## Business Outcome

A team can coordinate several human developers and coding agents across isolated Agent Workspaces,
observe a shared vendor TUI without corrupting input, explicitly transfer writer control and hand an
immutable candidate to a reviewer or tester.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Workspace Collaboration | Durable coordination aggregate over existing Workspaces. | Public collaboration | Not a Workspace lifecycle owner. |
| Participant | Tenant-scoped human subject or Agent Runtime identity with one collaboration role. | Collaboration | Organization Member remains identity owner. |
| Lane | Reference to one existing Workspace and its purpose in the collaboration. | Collaboration | `workspaceId = sandboxId`. |
| Writer Lease | Expiring, generation-fenced exclusive write authority for one Lane. | Collaboration | Not a process lock or terminal session. |
| Observer Attachment | Read-only attachment to the real managed PTY. | Terminal Session | Not a transcript or reimplemented TUI. |
| Candidate Handoff | Digest-bound offer of one immutable Source Artifact between Lanes. | Collaboration | Does not copy mutable files. |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| COLLAB-CREATE-001 | Create team collaboration | An authenticated subject and one Workspace exist | collaboration is created | Creator is owner, first Lane references that Workspace and no duplicate Workspace is created. |
| COLLAB-LANE-002 | Add isolated agent lane | A Collaboration and second Workspace exist | owner/editor adds a Lane | Both Workspace ids remain distinct and independently operable. |
| COLLAB-MEMBER-003 | Manage participants | Owner manages a tenant-scoped participant | add/update/remove executes | Role invariants hold; final owner cannot be removed or demoted. |
| COLLAB-LEASE-004 | Exclusive writer | A writable Lane exists | two participants acquire concurrently | Exactly one current lease succeeds; the other receives a conflict with current generation metadata. |
| COLLAB-TRANSFER-005 | Explicit handoff of control | A current writer lease exists | holder/owner transfers it | Generation increases and the previous capability cannot write. |
| COLLAB-OBSERVE-006 | Observe real agent TUI | A managed Terminal Session is bound to a Lane | viewer attaches as observer | Existing output streams; input, resize and close fail closed; vendor TUI remains unchanged. |
| COLLAB-RECONNECT-007 | Writer reconnect | Writer detaches without closing | same current lease reattaches | PTY continues and write authority remains generation-fenced. |
| COLLAB-NATIVE-008 | Native attach authorization | A native-attach Runtime belongs to a Lane | participant requests attach | Only current writer receives adapter attach capability; viewer receives an explicit denial. |
| COLLAB-HANDOFF-009 | Offer immutable candidate | Source Lane owns an available Source Artifact | writer offers digest-bound handoff | Handoff records source/target Lane, artifact id and expected digest without artifact contents. |
| COLLAB-REVIEW-010 | Accept or reject candidate | Reviewer can access target Lane | handoff is resolved | Status and actor are recorded exactly once; digest or ownership mismatch fails closed. |
| COLLAB-PREVIEW-011 | Share review access | A Lane has Development or Candidate Preview descriptors | collaboration detail is read | Existing visibility, TTL and URLs are surfaced without creating another exposure. |
| COLLAB-AUDIT-012 | Audit collaboration | Collaboration changes occur | audit/events are read | Safe actor, lane, lease generation and handoff metadata are visible; prompts, PTY data and secrets are absent. |
| COLLAB-SURFACE-013 | Public client parity | Operations are available | CLI, SDK, HTTP/oRPC and Console are used | All dispatch the same canonical public operations and capability-driven states. |
| COLLAB-CLOUD-014 | Hosted team policy | Cloud organization roles are active | collaboration commands execute | Cloud injects organization authz and admission while public state and operation semantics stay unchanged. |

## Domain Ownership

- Collaboration coordination: `WorkspaceCollaboration`.
- Workspace lifecycle and isolation: `Sandbox`.
- Agent execution/native attach: `SandboxAgentRuntime` and harness adapters.
- Human organization membership: `Organization`.
- Managed PTY and attachment streaming: `TerminalSession`.
- Immutable candidate: `SourceArtifact`.
- Preview lifecycle: Sandbox port exposure and Candidate Preview.
- Hosted authz/quota/metering: Cloud policy adapters.

## Public Surfaces

- CLI: `appaloft workspace collaboration create/show/list/...`.
- SDK: `appaloft.workspaceCollaborations.*` and Workspace collaboration handles.
- HTTP/oRPC: canonical `workspace-collaborations.*` operations.
- Web: collaboration overview, lanes, participants, writer status, observer/writer connect actions
  and candidate handoffs.
- Terminal WebSocket: writer/observer attachment capability; no replacement TUI.

## Non-Goals

- Multi-writer terminal input or collaborative text editing.
- Persisting terminal transcripts, prompts or hidden reasoning.
- Replacing Organization, Sandbox, Agent Runtime, Source Artifact or Preview aggregates.
- Automatically mutating a target Workspace when a handoff is accepted.
- Comments, chat, notifications, issue trackers or automatic merge.

## Open Questions

None.
