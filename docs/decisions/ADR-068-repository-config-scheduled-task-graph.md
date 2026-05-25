# ADR-068: Repository Config Scheduled Task Graph

Status: Accepted

Date: 2026-05-24

## Context

Scheduled tasks are already Resource-owned workload automation under ADR-039, but users can only
create and configure them through explicit CLI/API/Web operations. Repository config now describes
source/runtime/network, application dependencies, storage, and preview policy, so recurring
application jobs remain a deployment-time drift surface.

The YAML shape must remain user-facing. It must not expose internal scheduled-task DTOs, task ids,
tenant/provider identity, raw secret values, or deployment command fields. `deployments.create`
must also remain ids-only. Config deploy needs an idempotent mapping from a repository-local task
key to the durable scheduled task id so future config deploys can configure the same task and PR
preview cleanup can safely remove only config-owned ephemeral tasks.

## Decision

Repository config introduces a top-level `scheduledTasks` graph for Resource-owned recurring
application jobs:

```yaml
scheduledTasks:
  nightly_sync:
    schedule: "0 3 * * *"
    timezone: UTC
    command: bun run sync
    timeoutSeconds: 600
    retryLimit: 2
    preview:
      lifecycle: ephemeral
```

The declaration is not a `ScheduledTaskDefinition` dump. It describes a repository-local recurring
job keyed by an application name:

- `schedule` maps to the existing scheduled-task schedule expression;
- `timezone` defaults to `UTC`;
- `command` maps to existing `commandIntent`;
- `timeoutSeconds` defaults to `3600`;
- `retryLimit` defaults to `0`;
- `concurrencyPolicy` defaults to `forbid`;
- `status` defaults to `enabled`;
- `preview.lifecycle: ephemeral` allows preview cleanup to delete only the provenance-owned task.

The CLI/Action repository-config workflow must dispatch existing command/query operations through
the command/query buses:

1. resolve project/environment/resource/server identity outside the committed file;
2. list scheduled tasks for the selected Resource;
3. use source-link scheduled-task provenance to find the existing task for each YAML key when
   available;
4. create a missing task through `scheduled-tasks.create`;
5. configure an existing provenance-owned task through `scheduled-tasks.configure` when config
   drift is detected;
6. record source-link scheduled-task provenance for the YAML key and task id;
7. call `deployments.create` with ids only.

Preview cleanup extends source-link provenance with
`source-link.scheduled-task-provenance/v1`. `deployments.cleanup-preview` may delete only entries
that have explicit repository-config provenance for the same preview source fingerprint, linked
Resource, scheduled task id, and ephemeral lifecycle. Cleanup must not delete manually created,
shared, unproven, disabled, or name-matched-only tasks.

Repository config must reject secret-bearing scheduled task command text before mutation. Commands
may reference secrets indirectly through the application environment or secret references already
managed outside the repository config, but raw passwords, tokens, connection strings with embedded
credentials, private keys, and provider account details are forbidden.

## Consequences

- This is a workflow/profile extension over existing scheduled task operations. No new
  operation-catalog key is introduced.
- `deployments.create` continues to receive only ids and does not grow schedule or command fields.
- Source-link metadata becomes the durable idempotency/provenance store for repository-config
  scheduled task keys.
- Existing explicit CLI/Web/API scheduled task commands stay authoritative for manual tasks.
- Preview cleanup is provenance-first and fail-closed; it must not guess by task command, schedule,
  name, or YAML key alone.

## Governed Specs

- [Repository Config Scheduled Task Graph](../specs/077-repository-config-scheduled-task-graph/spec.md)
- [Scheduled Task Resource Shape](../specs/044-scheduled-task-resource-shape/spec.md)
- [Repository Deployment Config File Bootstrap Workflow](../workflows/deployment-config-file-bootstrap.md)
- [GitHub Action PR Preview Deploy Workflow](../workflows/github-action-pr-preview-deploy.md)
- [deployments.cleanup-preview Command Spec](../commands/deployments.cleanup-preview.md)
- [Deployment Config File Test Matrix](../testing/deployment-config-file-test-matrix.md)
- [Scheduled Task Resource Test Matrix](../testing/scheduled-task-resource-test-matrix.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](./ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-014: Deployment Admission Uses Resource Profile](./ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-039: Scheduled Task Resource Ownership](./ADR-039-scheduled-task-resource-ownership.md)
