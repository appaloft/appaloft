# ADR-125: Managed Control-Plane Occupancy

Status: Accepted

Date: 2026-08-23

## Context

`appaloft code` occupancy against a hosted control plane already persists Workspace/Sandbox state
in that control plane's Postgres. SSH-server PGlite remains valid for standalone Community deploys
(ADR-024). Mixing the two makes `code` pin leftover occupancy SHAs and fail source materialization
while operators keep repairing node PGlite.

## Decision

1. When the CLI has an active control-plane profile, occupancy and `workspace` commands use the
   control-plane API. They must not open, sync, backup, restore, or promote SSH PGlite.
2. A git worktree's resolved HEAD is the occupancy commit. Leftover occupancy rows may be resumed
   only when their commitSha matches that HEAD. They must not rewrite the requested commit.
3. Source materialization fetches the requested `commitSha` (`git fetch --depth 1 origin <sha>`),
   not only the branch tip.
4. A preferred Workspace that never reached ready (partial, failed, or missing runtime) may be
   replaced by `appaloft code`. A ready Workspace is never deleted implicitly.
5. `workspaces.open`, create, and terminate carry an operation id and idempotency key.
6. Errors include stable `code`, `phase`, `retryable`, and `operationId`.

## Consequences

- Standalone `ssh-pglite` is unchanged for deploys without a control plane.
- Hosted Cloud/self-hosted occupancy bugs are fixed in the door/materialization/open service, not
  by node PGlite recovery.

## Rejected alternatives

- Making Hostinger PGlite the occupancy SoT
- A Cloud-only Workspace aggregate
- Silent deletion of ready Workspaces
