# resources.delete-check Query Spec

## Metadata

- Operation key: `resources.delete-check`
- Query class: `CheckResourceDeleteSafetyQuery`
- Input schema: `CheckResourceDeleteSafetyQueryInput`
- Handler: `CheckResourceDeleteSafetyQueryHandler`
- Query service: `CheckResourceDeleteSafetyQueryService`
- Domain / bounded context: Workload Delivery / Resource lifecycle
- Current status: active query
- Source classification: normative contract for delete safety readback

## Normative Contract

`resources.delete-check` previews whether a resource can be deleted without mutating lifecycle
state. It must use the same deletion blocker reader as `resources.delete` so Web, CLI, HTTP, and
future tools do not guess from stale client state.

```ts
type ResourceDeleteSafety = {
  schemaVersion: "resources.delete-check/v1";
  resourceId: string;
  lifecycleStatus: "active" | "archived";
  eligible: boolean;
  blockers: ResourceDeleteBlocker[];
  checkedAt: string;
};
```

Active resources return `eligible = false` with an `active-resource` blocker. Archived resources
return `eligible = true` only when retained blocker checks return no blockers, including no
retained current runtime instance.

Deployment history is not a resource delete-check blocker. Historical deployment records, snapshots,
and logs keep their own retention and audit ownership; deleting an archived resource only tombstones
the normal resource identity and must not cascade historical deployment cleanup. A retained current
runtime instance is a delete-check blocker and must be reported as `runtime-instance` until runtime
control state proves it is stopped or the runtime placement is no longer retained.

Audit history is also not a resource delete-check blocker. Retained audit rows describe past facts
and may keep referencing the resource id after the resource is tombstoned; deleting a resource must
not require pruning audit history first.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Resource danger zone reads delete safety and disables destructive delete while ineligible. | Active |
| CLI | `appaloft resource delete-check <resourceId> [--json]`. | Active |
| oRPC / HTTP | `GET /api/resources/{resourceId}/delete-check`. | Active |
| Automation / MCP | Future query/tool over the same operation key. | Future |
