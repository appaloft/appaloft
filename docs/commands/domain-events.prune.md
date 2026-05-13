# domain-events.prune Command Spec

## Metadata

- Operation key: `domain-events.prune`
- Command class: `PruneDomainEventsCommand`
- Input schema: `PruneDomainEventsCommandInput`
- Handler: `PruneDomainEventsCommandHandler`
- Use case: `PruneDomainEventsUseCase`
- Domain / bounded context: Event and async progression / Operator maintenance
- Current status: active command

## Normative Contract

`domain-events.prune` previews or deletes old retained domain event stream rows.

Command success means the prune boundary evaluated the retained event stream store and returned
safe counts. In dry-run mode, no rows are deleted. In destructive mode, only eligible old,
unguarded event stream rows are deleted.

The canonical first retained store is the Appaloft-owned retained event observation store selected
by ADR-059. It is expected to be backed by a dedicated `domain_event_stream_records` persistence
boundary plus prune watermark metadata for pruned-cursor gap detection. The command must not treat
embedded `deployments.logs` entries, audit rows, process attempts, provider/runtime logs, or the
runtime event bus as its retained event stream store.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `before` | Required | ISO cutoff. Only event stream rows with event time `< before` are candidates. |
| `dryRun` | Optional | Defaults to `true`. Destructive deletion requires `false`. |
| `eventType` | Optional | Exact event type scope. |
| `aggregateId` | Optional | Aggregate id scope when the retained event stream has aggregate metadata. |
| `aggregateType` | Optional | Aggregate type scope when the retained event stream has aggregate metadata. |
| `deploymentId` | Optional | Deployment id scope for deployment event stream rows. |
| `limit` | Optional | Optional maximum rows to inspect or delete in one command execution. |

## Rules

- The command must default to dry-run.
- The command must preserve cutoff-equal and newer rows.
- The command must preserve rows guarded by durable replay/read cursor leases when such leases
  exist, recovery readiness, rollback-candidate evidence, or accepted workflow state.
- When destructive prune removes the oldest retained rows in a stream scope, it must update retained
  watermark metadata so event reads can report a gap for cursors older than retained history.
- The command must return counts by event type and skipped reason.
- The command must not mutate audit rows, legal holds, immutable archives, outbox/inbox/process
  attempts, logs, snapshots, runtime artifacts, source workspaces, build cache, route state,
  resources, servers, deployments, dependencies, or storage volumes.
- If the retained event observation store cannot prove replay/cursor safety for a candidate row,
  destructive prune must skip it with a safe reason rather than deleting it.

## Entrypoints

| Entrypoint | Contract |
| --- | --- |
| CLI | `appaloft domain-event prune --before <iso>` dispatches through `CommandBus`. |
| API/oRPC | `POST /api/domain-events/prune` dispatches through `CommandBus`. |
| Web | Future maintenance UI may call the same command after showing dry-run counts and gap impact. |

## Result Shape

The result includes:

- schema version;
- cutoff and effective filters;
- dry-run flag;
- inspected count;
- candidate count;
- pruned count;
- skipped count;
- counts by event type;
- skipped counts by reason;
- prune timestamp.

## Tests

The governing matrix is
[Domain Event Stream Retention Test Matrix](../testing/domain-event-stream-retention-test-matrix.md).
At minimum, Code Round coverage must prove `DOMAIN-EVENT-RETENTION-001` through
`DOMAIN-EVENT-RETENTION-005`.
