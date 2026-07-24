# ADR-095: Agent Task Run Workflow

Status: Accepted

Date: 2026-07-23

## Context

`SandboxAgentRun` already owns durable harness execution, event replay and cancellation. Source
Artifact, Candidate Preview and Sandbox port operations already own immutable delivery and live
development access. Users still lack one product workflow that connects repository preparation,
agent execution, checks, changes, a Development Preview, external approval and pull-request
delivery.

Creating a second generic background-job model would duplicate Agent Run and Operator Work.
Treating a live Development Preview as a Promotion Candidate Preview would also collapse the
distinction between a mutable workspace and an immutable artifact.

## Decision

1. `Agent Task Run` is a public application process manager whose stable task identity is the
   underlying `SandboxAgentRunId`; it is not a replacement Agent Run aggregate.
2. The workflow composes:
   - one Agent Workspace and one Sandbox Agent Run;
   - bounded Run events as live progress and logs;
   - argv-based checks executed inside the same Sandbox after the Run completes;
   - a bounded Git change summary and patch captured below the Workspace as a task result;
   - an optional live Development Preview through Sandbox port exposure;
   - optional Source Artifact and Candidate Preview creation for immutable review;
   - an explicit external approval before Git push or pull-request creation.
3. Task result state is a versioned, tamper-evident protected document below
   `.appaloft/tasks/<runId>/state.json`. It is workspace-owned resumable workflow state, not a
   hidden control-plane table. Sensitive output is bounded and redacted before protection and
   persistence.
4. Disconnecting a client never cancels the Agent Run. A later client may resume finalization from
   the Run read model and task result document.
5. Source-control delivery accepts only structured branch, commit, remote and optional forge
   intent. The first adapter executes argv-safe Git and GitHub CLI commands inside the Sandbox.
   Arbitrary delivery argv, forge DTOs and credentials do not enter the workflow model.
   GitHub credentials are resolved from `IntegrationAuthPort` at delivery time and passed only
   through bounded stdin to the exact Git/GitHub child process. They are not persisted, placed in
   argv or returned to the client. Commits use an operation-scoped deterministic author identity,
   so delivery does not depend on mutable user-level Git configuration in the Sandbox.
6. Pull-request creation requires an external caller action after checks and review artifacts are
   observable. An in-Sandbox agent identity cannot approve its own delivery.
7. Operator Work remains the operational projection for durable worker attempts. It is not the
   user-facing Task Run model.

## Consequences

- CLI, SDK, Web and future MCP clients can present the same Task Run identity and evidence.
- Canonical `sandboxes.agent-tasks.*` operations make the server authoritative for finalization,
  approval and delivery; a browser disconnect cannot move those effects to an untrusted client.
- The first implementation can recover after client disconnect without a new aggregate or
  migration, while the durable Agent Run remains the execution authority.
- A Development Preview may be useful before immutable capture, but only a Candidate Preview binds
  an exact Source Artifact digest.
- Provider and forge adapters can add hosted authentication without moving the workflow into a
  private Cloud model.
- Delivery retries retain only safe branch, commit SHA and pull-request URL evidence. A missing or
  expired forge credential returns the Task to `approved` with an explicit retryable failure.

## Migration Gaps

- Existing Agent Run clients remain compatible and may ignore Task Run result documents.
- Providers without a change-delivery adapter stop at `awaiting-approval` with an explicit recovery
  action; they do not claim pull-request delivery.
