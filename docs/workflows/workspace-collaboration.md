# Workspace Collaboration

Workspace Collaboration coordinates people and Agent Runtimes across existing isolated Agent
Workspaces. It does not create a shared filesystem and does not replace an Agent's own TUI.

## Typical Flow

1. Create one Agent Workspace per independent builder, reviewer or tester.
2. Create a collaboration with the first Workspace as its initial lane.
3. Add human subjects or Agent Runtime identities as participants.
4. Add the other Workspaces as separate lanes.
5. Acquire the writer lease before using an interactive managed terminal or native Agent attach.
6. Other participants may attach to the real managed PTY as read-only observers.
7. Expose a development service through the lane Workspace's existing Sandbox Port operation; the
   collaboration Console surfaces the same URL, visibility and expiry.
8. Capture an immutable Source Artifact and offer its id plus digest to a reviewer/test lane.
9. The target participant accepts or rejects the handoff. Applying or promoting the artifact is a
   separate explicit operation.
10. Release or transfer the writer lease and close the collaboration after active leases and
    offered handoffs are resolved.

## Isolation And Writer Control

Each lane references exactly one existing `workspaceId = sandboxId`. Files, processes, credentials,
terminal sessions and port exposures stay isolated by the Sandbox owner. Two lanes may run services
on the same internal port because each Sandbox owns its own network namespace and exposure
descriptor.

One lane has at most one active writer lease. The lease includes a monotonically increasing
generation and expiry. Terminal and native-attach writer capabilities carry that generation. A
transfer, release followed by reacquisition, or expiry fences old capabilities.

Read-only observers consume the same live/replay terminal queue as the writer but cannot send
input, resize the PTY or close it. Disconnecting any client is observation-only and does not stop
the remote process.

## Agent Interaction

Pi, OpenCode and other terminal-oriented agents keep their own TUI inside the managed PTY. Native
attach agents keep their own client/server protocol. Appaloft only opens, routes, reconnects and
authorizes these transports:

- managed-terminal harness: use a writer or observer Terminal attachment;
- native-attach harness such as OpenCode: current writer requests a scoped native attach
  capability and runs the returned vendor command;
- task-only harness: use its existing Agent Run or Agent Task operations.

## Public Interfaces

- Console: `/workspaces` lists collaborations; the detail view composes lanes, previews, terminal
  access, native attach and review handoffs.
- CLI: `appaloft workspace collaboration --help`.
- SDK: `appaloft.workspaceCollaborations.create/list/show` and returned collaboration handles.
- HTTP/oRPC: the `workspace-collaborations.*` operation family.

All interfaces dispatch the same command/query schemas. The acting participant is derived from the
authenticated execution context. Hosted products may layer organization authorization and
admission over these public operations, but cannot replace the aggregate or claim a caller-supplied
actor identity.

## Safety And Recovery

- Collaboration state contains ids, roles, lease metadata and artifact digests only.
- Prompts, terminal input/output, hidden reasoning, credentials and artifact contents are excluded.
- Terminal processes survive client detachment while their Sandbox remains alive.
- Collaboration persistence survives process restart; ephemeral attachment capabilities must be
  reissued.
- A rebuilt Sandbox can recover only the code and Agent state owned by its existing persistence
  contract. Collaboration does not promise process recovery beyond that contract.

See [ADR-096](../decisions/ADR-096-workspace-collaboration-boundary.md),
[Spec 113](../specs/113-workspace-collaboration/spec.md) and the
[test matrix](../testing/workspace-collaboration-test-matrix.md).
