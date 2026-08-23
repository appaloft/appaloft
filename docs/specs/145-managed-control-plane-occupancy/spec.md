# Spec 145: Managed Control-Plane Occupancy

## Status

Accepted. Governs ADR-125.

## Outcome

Hosted-control-plane `appaloft code` occupancy uses the control-plane database. A git worktree
HEAD is the requested commit. Materialization fetches that commit. Never-ready preferred
Workspaces are replaced. Ready Workspaces are not silently deleted.

## Acceptance

See Cloud matrix MW-CP-DOOR-012, MW-CP-FETCH-013, MW-CP-NEVER-READY-007, MW-CP-NO-RECOVERY-011,
MW-CP-ERROR-014.

## Non-goals

Standalone ssh-pglite deploys. Cloud-only Workspace aggregate.
