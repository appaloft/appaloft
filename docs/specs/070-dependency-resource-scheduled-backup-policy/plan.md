# Dependency Resource Scheduled Backup Policy Plan

## Scope

- Add explicit configure/list/show operation catalog entries.
- Persist policy rows with interval, retention metadata, enabled state, retry preference, last run,
  and next run timestamps.
- Dispatch due policies through the existing dependency resource backup command.
- Expose CLI, HTTP/oRPC, Web, public docs, and runtime configuration.

## Implementation Notes

- Keep policy DTOs separate from the scheduled runner service so Web/client contracts never import
  server-side decorator services.
- Keep provider-specific backup behavior behind existing provider backup capabilities.
- Keep runner enablement disabled by default for self-hosted installs.

## Deferred

- Backup prune/delete based on retention.
- Backup artifact export.
- Provider catalog expansion beyond current managed Postgres/Redis paths.
- Storage-volume backup parity.
