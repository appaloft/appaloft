# ADR-096: Workspace Collaboration Boundary

Status: Accepted

Date: 2026-07-24

## Context

Agent Workspace already composes one Sandbox with one or more agent runtimes. Agent Task Run already
owns one resumable coding task and its checks, changes, preview, immutable Source Artifact and
delivery evidence. Organization already owns durable human membership and roles. Terminal Session
owns a reconnectable PTY but intentionally does not persist terminal input or output.

Teams now need to coordinate several people and agents without sharing one mutable checkout by
default. They also need an explicit safe path for observing or handing off a shared terminal and
for transferring an immutable candidate between isolated Workspaces.

Adding collaboration fields directly to Sandbox would make the execution aggregate own team
membership and review workflow. Adding another Workspace aggregate would duplicate Sandbox
lifecycle. Letting every attachment write to the same PTY would make concurrent input
nondeterministic and unauditable.

## Decision

1. `Workspace Collaboration` is a public aggregate that coordinates existing Workspace identities.
   It does not provision, pause, resume or terminate a Workspace. A `workspaceId` remains a
   `sandboxId`.
2. A Collaboration contains:
   - Participants referencing tenant-scoped human subjects or Sandbox Agent Runtime identities.
   - Lanes referencing existing Workspace ids. Each lane declares a neutral purpose
     (`builder`, `reviewer`, `tester` or `custom`) and optional branch label.
   - At most one active writer lease per lane. A lease has one participant holder, a monotonically
     increasing generation and an expiry. Acquiring, renewing, releasing and transferring a lease
     are explicit commands.
   - Candidate handoffs referencing an immutable `SourceArtifactId` and expected digest. A handoff
     moves through `offered`, `accepted`, `rejected` or `withdrawn`; it never aliases mutable files.
3. Independent agents should receive independent lanes and Workspaces by default. Sharing a lane is
   an explicit choice.
4. Shared Terminal Session attachments are capability-scoped:
   - an observer can read output and cannot write, resize or close the PTY;
   - a writer attachment must present the current lane writer lease generation;
   - a stale or transferred lease fails closed;
   - detaching a client does not release the durable lease or terminate the PTY.
5. Native agent attach remains adapter-owned. The public collaboration operation checks the writer
   lease before issuing a native attach capability; Appaloft does not implement a vendor TUI.
6. Accepting a handoff records review responsibility and verifies the referenced Source Artifact
   still belongs to the source Workspace and matches the expected digest. It does not silently
   mutate the target Workspace. Applying, cherry-picking or promoting a candidate remains an
   explicit downstream operation.
7. Collaboration commands derive the acting subject from `ExecutionContext`. Clients cannot claim
   an arbitrary acting identity. Organization/hosted authorization remains an injected policy
   outside the public aggregate.
8. Public domain events and operation audit metadata record membership, lane, lease and handoff
   transitions. Terminal input, terminal output, prompts, hidden model reasoning, credentials and
   artifact contents are never copied into collaboration state or audit payloads.
9. Existing Development Preview visibility and TTL remain owned by Sandbox port operations.
   Collaboration views may associate and surface those descriptors but do not create a second
   preview lifecycle.

## Consequences

- Pi, OpenCode, Claude Code, Codex and future harnesses share the same collaboration contract while
  continuing to render their own TUI or native client.
- Parallel agents are isolated through separate Workspaces; deliberate same-Workspace work is
  serialized by a durable lease.
- Observers can watch the real PTY without gaining write authority.
- Candidate review and agent-to-agent handoff use immutable, digest-bound evidence.
- Cloud may add organization policy, quota, metering and hosted routing without moving the neutral
  collaboration model into the private repository.
- Workspace lifecycle, agent execution, organization membership, Terminal Session and Source
  Artifact remain separate bounded owners.

## Migration Gaps

- Existing Terminal Session clients continue to receive a private writer attachment when no
  Collaboration lane is declared.
- Existing Agent Workspace and Task Run clients remain compatible and may ignore collaboration
  operations.
- Automatic candidate materialization into a target Workspace, pair-input conflict resolution,
  comments and notification adapters are future additive capabilities.
