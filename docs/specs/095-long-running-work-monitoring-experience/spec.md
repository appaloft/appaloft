# Long-Running Work Monitoring Experience

## Metadata

- Behavior id: `095-long-running-work-monitoring-experience`
- Round type: Spec / Docs / UI sync
- Related operations: `deployments.events`, `deployments.logs`, `operator-work.list`,
  `operator-work.show`, `system.doctor`
- Test matrix: `docs/testing/long-running-work-monitoring-experience-test-matrix.md`
- Canonical public terms: deployment progress, task progress, operator work ledger, worker runtime
- Status: active slice

## Purpose

Long-running deployment behavior must stay resumable after process restart while keeping the product
experience simple. Users should not have to choose between deployment events, raw worker logs,
operator work ids, leases, retries, and process attempts.

This slice defines three monitoring layers:

1. Deployment progress: user-facing deployment events and logs for one Deployment.
2. Task progress: user-facing summary for a parent long-running task that may create one or more
   Deployments.
3. Operator work monitoring: admin/operator visibility into durable work items, worker claim state,
   retries, dead-letter state, and safe internal events.

## Ubiquitous Language

| Term | Meaning | User visible? | Notes |
| --- | --- | --- | --- |
| Deployment progress | Events and logs for one accepted Deployment. | Yes | Primary user surface for deploy, retry, rollback, and redeploy flows. |
| Task progress | Product summary for a parent workflow such as quick deploy or an application install. | Yes | May aggregate deployment progress, but must not expose worker leases or raw process internals. |
| Operator work ledger | Durable work item and safe event ledger used for monitoring and repair. | Admin/operator only by default | Queryable through `operator-work.*` / CLI `appaloft work`. |
| Worker runtime topology | Configured worker mode, queue backend, group, slots, and coordination role. | Admin/operator only | Topology is configuration/status metadata, not proof of live worker heartbeat. |
| Worker heartbeat | Live process liveness evidence for a worker identity. | Admin/operator only | Stored in a separate worker heartbeat read model. Do not infer it from deployment logs. |

## Experience Rules

- Ordinary users see deployment progress for deployment-scoped work and task progress for
  parent workflows.
- Ordinary users should not be asked to inspect `workId`, `workerId`, lease owner, lease expiry,
  attempt count, or dead-letter controls unless a debug/admin affordance is explicitly enabled.
- `deployments.events` answers "where is this deployment now?"
- `deployments.logs` answers "what did the build/runtime output for this deployment?"
- `operator-work.show` answers "did the control plane durably accept, claim, retry, or complete the
  background work?"
- Task progress may link to related deployment pages and deployment logs.
- Task progress must only expose sanitized phase, step, status, related deployment ids, and safe
  user-facing messages.
- Operator work events may include worker id/group and retry details, but must not include raw
  provider command lines, secret values, private paths, or unbounded log text.
- Worker runtime topology belongs on the Instance / maintenance surface, not on deployment detail.
- Worker heartbeat belongs on the Instance / maintenance and doctor surfaces. It must be modeled as
  a separate worker-status read model and must not be derived from deployment events or application
  logs.
- Worker heartbeat summarizes online/stale workers and recent `lastSeenAt` timestamps. It is not a
  user-facing deployment progress stream and must not expose lease owner, lease expiry, attempt
  count, secret values, or unbounded log text.

## Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| LONG-WORK-MON-001 | Deployment progress remains the user deploy surface | A deployment is accepted by a durable worker | User opens deployment detail or follows CLI deployment events | Events show accepted/queued/running/terminal deployment progress without requiring `operator-work.show`. |
| LONG-WORK-MON-002 | Deployment logs stay separate from worker internals | A deployment emits build/runtime logs and durable work emits claim/retry events | User opens deployment logs | Logs contain deployment output only; worker id, lease expiry, and durable attempt metadata are not rendered as deployment logs. |
| LONG-WORK-MON-003 | Parent task progress summarizes child deployments | A parent workflow creates one or more deployments | User opens the workflow/install progress surface | The surface shows a single task status, safe steps, and links to child deployments instead of exposing multiple raw log categories. |
| LONG-WORK-MON-004 | Operator work remains an admin/debug surface | An admin queries `appaloft work show <workId>` or `/api/operator-work/{workId}` | Durable work has events | The response includes safe item/event state for retry/repair without presenting it as the ordinary user progress surface. |
| LONG-WORK-MON-005 | Instance page shows worker runtime topology | Worker runtime is configured | Admin opens Instance maintenance workers | The durable worker runtime row has a label, safety text, activation text, and mode/backend/group/worker ids/coordination role readback. |
| LONG-WORK-MON-006 | Worker heartbeat is separate from topology | Worker runtime is writing heartbeat records | Admin opens Instance maintenance workers or doctor output | The durable worker runtime row shows online/stale worker counts and recent heartbeat evidence from the heartbeat read model, while deployment detail/events remain free of worker liveness internals. |
| LONG-WORK-MON-007 | CLI command names match implemented surface | Monitoring follow-up commands are generated | A user reads a quick deploy or workflow result | Commands use `appaloft work list/show` for operator work and `appaloft deployments events ... --follow` for user deployment progress. |
| LONG-WORK-MON-008 | Disabled Web/API process observes standalone workers | Web/API is configured not to execute durable work and an external worker group is configured for observation | Admin opens Instance maintenance workers or doctor output | The durable worker runtime row reports the current process as disabled and separately shows the observed standalone worker group, expected worker count, worker ids, and heartbeat readback for that group. |

## Out Of Scope

- Dedicated Cloud/Enterprise worker process packaging.
- Real-time worker log tail.
- Product-specific parent workflow projections such as Cloud Marketplace install progress.
- Changing deployment event stream transport or log retention policy.
