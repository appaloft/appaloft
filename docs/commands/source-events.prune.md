# source-events.prune

## Purpose

`source-events.prune` dry-runs or deletes retained safe source event delivery diagnostics before a
cutoff. It is a day-two operator retention command for source auto-deploy evidence. It must not
replay events, re-read raw webhook payloads, inspect webhook secrets, mutate Resources, or delete
deployments.

## Command Message

- Message: `PruneSourceEventsCommand`
- Operation key: `source-events.prune`
- Input schema: `PruneSourceEventsCommandInput`
- Output schema version: `source-events.prune/v1`

## Input

| Field | Required | Meaning |
| --- | --- | --- |
| `before` | Yes | ISO timestamp cutoff. Matching records must have `receivedAt < before`. |
| `projectId` | No | Restricts cleanup to one project. |
| `resourceId` | No | Restricts cleanup to deliveries whose safe matched-resource set contains the Resource. |
| `status` | No | Restricts cleanup to one source event status. |
| `sourceKind` | No | Restricts cleanup to one source kind. |
| `dryRun` | No | Defaults to `true`. When true, reports matching counts without deleting rows. |

## Behavior

1. The command dispatches through `CommandBus` and `PruneSourceEventsUseCase`.
2. The use case calls the source event retention store with repository context and the parsed
   command filters.
3. The store counts matching retained source event rows by status and source kind.
4. If `dryRun` is true, no rows are deleted and `prunedCount` is zero.
5. If `dryRun` is false, only rows matching the cutoff and filters are deleted.

## Public Surfaces

- CLI: `appaloft source-event prune --before <iso>`
- HTTP/oRPC: `POST /api/source-events/prune`
- Public help anchor: `source-auto-deploy-retention`
- Future MCP/tool descriptors are generated from `operation-catalog.ts`.

## Error Notes

Input validation uses the shared command schema. Persistence failures return stable infrastructure
errors with `phase=source-event-retention`; errors must not include raw payloads, signatures,
provider tokens, or webhook secret values.
