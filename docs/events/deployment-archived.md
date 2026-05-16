# deployment.archived Event

## Producer

`deployments.archive` publishes `deployment.archived` after the Deployment attempt is persisted with
`archivedAt`.

## Payload

| Field | Meaning |
| --- | --- |
| `triggerKind` | Original deployment trigger kind. |
| `sourceDeploymentId` | Optional retry/redeploy/rollback source deployment id. |
| `rollbackCandidateDeploymentId` | Optional rollback candidate deployment id. |
| `archivedAt` | ISO timestamp recorded on the attempt. |
| `status` | Terminal status at archive time. |

## Consumers

Current consumers are read-model refresh, audit/diagnostic subscribers, and future operator
notification surfaces. Consumers must not delete runtime state, logs, events, routes, artifacts, or
operator-work evidence in response to this event.
