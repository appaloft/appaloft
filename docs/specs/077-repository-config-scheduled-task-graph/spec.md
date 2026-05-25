# Repository Config Scheduled Task Graph

## Status

- Round: Post-Implementation Sync
- Artifact state: MVP implemented for Resource-owned scheduled task declarations in repository
  config, CLI/Action config deploy orchestration, idempotent configure, and preview cleanup
  provenance
- Roadmap target: `0.12.x` repository config hardening
- Compatibility impact: `pre-1.0-policy`, additive repository config fields
- Decision state: governed by
  [ADR-068](../../decisions/ADR-068-repository-config-scheduled-task-graph.md)

## Business Outcome

Users can commit an `appaloft.yaml` that says the application needs recurring jobs such as nightly
syncs or cache refreshes. CLI and GitHub Action config deploy create or configure the Resource-owned
scheduled tasks before deployment admission, then create the deployment from ids only.

For PR previews, users can mark a scheduled task ephemeral so preview cleanup deletes only the task
definition that repository config created for that preview.

## Ubiquitous Language

| Term | Meaning | Context |
| --- | --- | --- |
| RepositoryScheduledTaskGraph | User-facing `appaloft.yaml` scheduled task declarations keyed by application names such as `nightly_sync`. | Repository config |
| ManagedScheduledTaskDeclaration | A config entry that asks Appaloft to create or configure a Resource-owned scheduled task. | Config deploy |
| ScheduledTaskProvenance | Source-link metadata mapping a repository config task key to a durable scheduled task id. | Source-link state |
| PreviewScheduledTaskProvenance | Scheduled-task provenance marked ephemeral for PR preview cleanup. | Preview cleanup |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| CONFIG-SCHED-TASK-001 | Parse managed scheduled task declaration | `appaloft.yaml` declares `scheduledTasks.nightly_sync.schedule` and `command` | The config parser runs | The config is accepted, defaults timezone, timeout, retry, concurrency, and status, exposes JSON schema, and still rejects unknown scheduled task fields. |
| CONFIG-SCHED-TASK-002 | Reject unsafe scheduled task material | Config includes provider account, tenant, credential, raw secret, private key, or credential-bearing connection string in a task command | The config parser runs | Parsing fails before mutation with strict schema, identity, unsupported, or raw-secret validation. |
| CONFIG-SCHED-TASK-003 | Create task from config deploy | No provenance-owned task exists for the selected Resource | CLI/Action config deploy resolves identity | The workflow dispatches `scheduled-tasks.list`, `scheduled-tasks.create`, records scheduled-task provenance, then dispatches `deployments.create` with ids only. |
| CONFIG-SCHED-TASK-004 | Configure existing provenance-owned task | Source-link provenance maps the YAML key to an existing task whose schedule or command differs | Config deploy runs again | The workflow dispatches `scheduled-tasks.configure` for that task instead of creating a duplicate. |
| CONFIG-SCHED-TASK-005 | Reuse exact existing task idempotently | A matching task already exists and no provenance entry exists yet | Config deploy runs | The workflow records provenance for the exact match and does not create a duplicate. |
| CONFIG-SCHED-TASK-006 | Stable conflict on duplicate YAML key adoption | Provenance for a YAML key points at a task that belongs to another Resource or a different source fingerprint | Config deploy handles the declaration | The workflow fails before deployment with a stable conflict code and safe details. |
| CONFIG-SCHED-TASK-007 | Preview task provenance is durable | A PR preview task declaration has `preview.lifecycle = ephemeral` | Config deploy creates or reuses the preview task | The source link records safe repository-config provenance with task key, resource id, task id, lifecycle, and command fingerprint. |
| CONFIG-SCHED-TASK-008 | Cleanup removes only provenance-owned ephemeral tasks | Preview cleanup runs for a source fingerprint with matching scheduled-task provenance | Runtime cleanup has succeeded | Cleanup deletes the recorded scheduled task through existing delete safety, removes route/source-link state, and returns safe cleanup counts. |
| CONFIG-SCHED-TASK-009 | Cleanup preserves manual/shared tasks | Preview cleanup runs when no matching scheduled-task provenance exists | Cleanup reaches scheduled task stage | No unproven scheduled task is deleted; cleanup never guesses by command, schedule, or key. |

## Config Contract

MVP repository config fields:

```yaml
scheduledTasks:
  nightly_sync:
    schedule: "0 3 * * *"
    timezone: UTC
    command: bun run sync
    timeoutSeconds: 600
    retryLimit: 2
    concurrencyPolicy: forbid
    status: enabled
    preview:
      lifecycle: ephemeral
```

Rules:

- scheduled task keys must be stable repository-local names, not Appaloft ids;
- `schedule` is required and must use the existing safe scheduled-task schedule grammar;
- `timezone` defaults to `UTC` and must be an IANA timezone;
- `command` is required, single-line, at most 500 characters, and must not contain raw secrets;
- `timeoutSeconds` defaults to `3600`;
- `retryLimit` defaults to `0`;
- `concurrencyPolicy` supports `forbid`;
- `status` supports `enabled` and `disabled`;
- `preview.lifecycle` supports `ephemeral`;
- omission of `preview.lifecycle` means normal task lifecycle; cleanup must not delete it;
- repository config must not declare task ids, provider account, credential, tenant, org, raw
  secret values, provider-native schedule handles, or deployment target identity.

## Workflow Contract

Config scheduled task deploy must run before deployment admission and after Resource identity is
known:

```text
resolve project/environment/resource/server identity
  -> scheduled-tasks.list(resourceId)
  -> source-link scheduled-task provenance lookup
  -> scheduled-tasks.create missing task or scheduled-tasks.configure drifted task
  -> persist scheduled-task provenance
  -> deployments.create(ids only)
```

The workflow must use command/query buses only. It must not call scheduled task repositories or
application services from the CLI/HTTP adapter.

Idempotency prefers source-link provenance. Without provenance, the workflow may adopt an exact
same-Resource match and record provenance, but it must not update or delete unproven tasks by
guessing.

## Preview Cleanup Contract

`deployments.cleanup-preview` reads preview source-link provenance and may clean only entries that:

- use schema `source-link.scheduled-task-provenance/v1`;
- have `source = repository-config`;
- have the same preview source fingerprint as the cleanup input;
- are `ephemeral`;
- match the linked preview `resourceId`;
- include explicit `taskId`.

Cleanup order:

1. Runtime cleanup and stale preview runtime sweep.
2. Unbind provenance-marked ephemeral dependency bindings.
3. Delete provenance-marked ephemeral dependency resources.
4. Detach provenance-marked ephemeral storage attachments.
5. Delete provenance-marked ephemeral storage volumes through `storage-volumes.delete`.
6. Delete provenance-marked ephemeral scheduled tasks through `scheduled-tasks.delete`.
7. Remove server-applied route desired state.
8. Delete the source link.

If scheduled task delete fails for anything other than not-found, the command fails before
source-link deletion so a retry can resume with provenance intact.

## Non-Goals

- No scheduled task fields on `deployments.create`.
- No provider-native scheduler configuration in repository config.
- No raw secret values, credentials, task ids, or target identity in repository config.
- No deletion of manual, shared, unproven, or name-matched-only tasks during preview cleanup.
- No automatic task run trigger during config deploy.

## Current Implementation Notes And Migration Gaps

This slice is a repository config workflow/profile extension over existing scheduled task
operations. No new operation-catalog key is introduced. `CORE_OPERATIONS.md` documents the workflow
boundary, while the executable operation catalog remains unchanged because all mutations and reads
dispatch through existing commands and queries.
