# projects.delete-check Query Spec

## Metadata

- Operation key: `projects.delete-check`
- Query class: `CheckProjectDeleteSafetyQuery`
- Input schema: `CheckProjectDeleteSafetyQueryInput`
- Handler: `CheckProjectDeleteSafetyQueryHandler`
- Query service: `CheckProjectDeleteSafetyQueryService`
- Domain / bounded context: Workspace / Project lifecycle
- Current status: active query
- Source classification: normative contract

## Normative Contract

`projects.delete-check` previews whether an archived project can be safely deleted by
`projects.delete`.

The query is read-only. It must not delete projects, cascade child records, clean runtime state,
prune logs, rewrite deployment snapshots, revoke domains or certificates, replay source events, or
mutate audit/event retention.

`eligible = true` only when the project is archived and no retained blocker exists. Active projects
return `eligible = false` with an `active-project` blocker.

An empty active or locked environment is not a retained blocker. Empty means the environment has no
environment-owned variables and no non-deleted resources. `projects.delete-check` remains read-only:
it may exclude empty environments from blockers, but it must not archive them.

## Output Model

```ts
type ProjectDeleteSafety = {
  schemaVersion: "projects.delete-check/v1";
  projectId: string;
  lifecycleStatus: "active" | "archived";
  eligible: boolean;
  blockers: ProjectDeleteBlocker[];
  checkedAt: string;
};
```

Canonical blockers are `active-project`, `environment`, `resource`, `deployment-history`,
`domain-binding`, `certificate`, `source-link`, `source-event`, `dependency-resource`,
`storage-volume`, `scheduled-task`, `preview-environment`, `runtime-monitoring`,
`runtime-log-retention`, `provider-job-log`, and `domain-event-retention`.

`environment` blockers represent non-archived environments that are not empty.

Retained audit rows are not project delete-check blockers. They describe past facts and may keep
referencing the project id after the project is tombstoned; deleting a project must not require
pruning audit history first.

Blockers expose only safe kind/id/type/count fields.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| CLI | `appaloft project delete-check <projectId>` | Active |
| HTTP/oRPC | `GET /api/projects/{projectId}/delete-check` | Active |
| Web | Project detail reads delete-check before enabling destructive delete. | Active |
| Public docs | `project.lifecycle` anchor. | Active |
| Future tools | Future tool descriptor over the same operation key. | Future |
