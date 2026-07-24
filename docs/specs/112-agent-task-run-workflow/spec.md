# Agent Task Run Workflow

## Status

- Round: Spec Round complete; Test-First and Code Round authorized
- Artifact state: ready
- Roadmap target: third Agent Workspace product phase
- Compatibility impact: additive public minor capability

## Business Outcome

An application developer can submit one coding task to a Pi or OpenCode Workspace, observe live
progress, run explicit checks, inspect bounded Git changes, open a Development Preview, approve the
result and create a pull request without losing the task when the client disconnects.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Agent Task Run | Resumable product workflow whose identity is one Sandbox Agent Run id. | Public workflow | `taskRunId = runId`. |
| Task Check | One argv-based verification command and bounded result. | Workspace evidence | CI check is downstream. |
| Task Changes | Bounded Git status, diff stat and patch for one Workspace result. | Workspace evidence | Source Artifact is immutable capture. |
| Task Result | Versioned protected resumable document stored below the Workspace. | Workflow state | Operator Work is not an alias. |
| Development Preview | Live expiring port exposure from the mutable Workspace. | Review access | Candidate Preview binds an immutable digest. |
| Change Delivery | External-approved commit, push and pull-request adapter action. | Source control boundary | Forge names are adapter keys. |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| AGENT-TASK-RUN-001 | Submit and follow | A ready Workspace Runtime exists | a Task Run is submitted | One Sandbox Agent Run is created; live bounded events are observable and disconnect does not cancel it. |
| AGENT-TASK-RESUME-002 | Resume finalization | The Agent Run completed while the client was absent | Task Run resume executes | The same run id is used and finalization continues idempotently from the task result document. |
| AGENT-TASK-CHECK-003 | Run checks | The Agent Run completed | configured argv checks execute | Each check records command identity, exit status and bounded output; a required failure blocks approval. |
| AGENT-TASK-DIFF-004 | Capture changes | Checks complete | Git evidence is inspected | Bounded status, stat and patch plus truncation metadata are stored and returned. |
| AGENT-TASK-PREVIEW-005 | Start Development Preview | A start argv and port are configured | preview preparation executes | The service starts in the Sandbox and one visibility/TTL-scoped port descriptor is returned. |
| AGENT-TASK-ARTIFACT-006 | Capture immutable review | Checks pass and the caller requests immutable review | source capture and Candidate Preview execute | The exact artifact digest and expiring Candidate Preview are attached to the Task Result. |
| AGENT-TASK-APPROVE-007 | External approval | Checks and required review evidence are ready | an authorized external actor approves | Task Result becomes approved exactly once; Sandbox runtime identity is rejected. |
| AGENT-TASK-PR-008 | Pull-request delivery | An approved Task Result and configured change-delivery adapter exist | delivery executes | Commit/push/PR are idempotent and the safe pull-request URL/ref is recorded; adapter failure remains retryable. |
| AGENT-TASK-CANCEL-009 | Cancel | A Task Run is active | cancellation is requested | The underlying Agent Run is cancelled and no delivery action runs. |
| AGENT-TASK-WEB-010 | Browser task experience | Task Runs exist | Console list/detail is opened | Progress, logs, checks, changes, previews, approval and delivery recovery actions use public contracts. |

## Domain Ownership

- Execution authority: `SandboxAgentRun`.
- Workspace lifecycle: `Sandbox`.
- Immutable review: `SourceArtifact` and Promotion Candidate Preview.
- Entry workflow: public application process manager exposed through CLI/SDK/Web.
- Operational attempt visibility: Operator Work.
- Downstream adapters: Sandbox execution, Sandbox port publisher and
  `AgentTaskChangeDelivery`.

## Public Surfaces

- CLI: `appaloft workspace task run/show/resume/cancel/approve/deliver`.
- SDK: `workspace.tasks.run/show/resume/cancel/approve/deliver`.
- Web: Task Run list/detail, event stream, checks, changes, preview, approval and recovery.
- API/oRPC: canonical `sandboxes.agent-tasks.create/list/show/resume/cancel/approve/deliver`
  operations backed by the existing Sandbox Agent Run, file, exec, port, Source Artifact and
  Candidate Preview owners.
- Future MCP: safe run/show/resume; approval and delivery require external scopes.

## Non-Goals

- Owning hidden model reasoning or generic conversation memory.
- Treating mutable workspace files as immutable delivery evidence.
- Auto-approving or auto-merging a pull request.
- Replacing CI, code review or Deployment proof.

## Open Questions

None.
