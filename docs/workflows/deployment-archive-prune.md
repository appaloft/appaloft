# Deployment Archive And Prune Workflow

## Scope

This workflow governs terminal deployment-attempt history cleanup. It is separate from active
attempt cancel, retry/redeploy/rollback, embedded deployment log prune, provider job log retention,
runtime artifact prune, audit retention, event stream retention, and operator-work prune.

## Archive Flow

1. Operator reads deployment detail or history.
2. Operator invokes `deployments.archive` with exact id confirmation.
3. Application loads the Deployment attempt.
4. Application rejects non-terminal attempts.
5. Deployment records `archivedAt` and publishes `deployment.archived` after persistence.
6. Default deployment lists hide archived attempts; direct show and include-archived list readback
   remain available.

## Prune Flow

1. Operator invokes `deployments.prune` with an ISO cutoff. The command dry-runs by default.
2. Retention store selects archived terminal attempts older than the cutoff and optional filters.
3. Retention store guards attempts referenced by source/retry/rollback/supersede lineage, provider
   job logs, runtime log archives, or runtime-control attempts.
4. Dry-run returns matched, guarded, and eligible ids without deleting.
5. Destructive mode deletes only unguarded attempts and returns affected ids.

## Non-Goals

- Delete provider job logs, runtime log archives, audit rows, events, process attempts, runtime
  artifacts, routes, resources, servers, environments, source links, or dependency state.
- Archive or prune active deployment attempts.
- Replace `deployments.logs.prune`.
