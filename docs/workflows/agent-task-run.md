# Agent Task Run Workflow

## Contract

```text
sandboxes.agent-tasks.create
  -> SandboxAgentRun
  -> durable reconcile
  -> argv checks
  -> bounded/redacted Git evidence
  -> optional Development Preview
  -> optional Source Artifact + Candidate Preview
  -> awaiting external approval
  -> structured commit/push/pull-request delivery
```

`taskRunId` is the first underlying `SandboxAgentRunId` and remains the stable Task identity.
`activeRunId` identifies the current Run generation after steer or resume. The application process
manager persists one protected, tamper-evident state document at
`.appaloft/tasks/<taskRunId>/state.json`; it does not create a duplicate execution aggregate or
control-plane table.

## Submit And Resume

1. `sandboxes.agent-tasks.create` creates the underlying Agent Run and protected initial state.
2. Durable Operator Work polls the Run. Client disconnect is observation-only.
3. `steer` and stopped-task `resume` keep the stable Task/Workspace, create a new active Run, and
   enqueue durable work fenced by that `activeRunId` generation.
4. A stale durable generation cannot overwrite the newer active Run, lineage, or Task status;
   replay of the current generation remains idempotent.
5. `cancel` cancels the active underlying Run and revokes only the exact task-owned
   preview/process.

## Finalize

Checks execute as argv arrays and persist bounded, redacted output. Required failures stop at
`checks-failed`. Git status, stat and patch include untracked files via intent-to-add and carry
explicit redaction/truncation flags.

An optional Development Preview starts a background process and creates an expiring Sandbox port
exposure. Optional immutable review captures a `SourceArtifact` and idempotently creates a
Candidate Preview for that exact digest.

## Approve And Deliver

Only an external user or trusted CLI actor can approve or deliver. Runtime/deploy-token identities
are rejected. Delivery accepts structured branch, commit, remote and optional GitHub pull-request
intent; arbitrary argv and credentials are not accepted. A retry first reads an existing pull
request before creating one and records the safe commit SHA/URL in protected task state. GitHub
credentials are resolved just in time through integration auth and passed through bounded stdin;
Task state, argv and logs never contain the token. Commit author identity is operation-scoped and
does not depend on preconfigured Sandbox user settings.
