# Operate And Recover Workflow

## Purpose

Provide one task-oriented presentation over existing observation, recovery, backup and portability
operations without becoming a business-state owner.

## Sequence

1. Resolve an explicit Resource or return a bounded Resource chooser.
2. Compose one secret-safe Operate snapshot from existing queries and mark every section with its
   observation time and availability.
3. Allow read-only navigation, refresh and exact expert-command handoff without confirmation.
4. For retry, redeploy or rollback, re-read Deployment Recovery Readiness and compare the requested
   action, source Deployment, candidate and readiness timestamp.
5. Show the exact consequence and require a second explicit confirmation before dispatch.
6. Dispatch the existing command, refresh timeline/readiness/proof, and report accepted, verified,
   failed or incomplete evidence separately.
7. For data recovery, plan/list/create through existing backup operations. Restore a selected ready
   StorageVolume backup to an independent target by default, then read it back.
8. For whole-instance migration, show portability readiness and hand off to the existing
   owner-scoped command; never execute replace import from the Resource flow.
9. On exit or failure, stop polling, close loopback transport, terminate the renderer and restore the
   terminal without mutating business resources.

## Invariants

- Query failure never becomes positive evidence.
- Command acceptance never becomes verification.
- Stale presentation state never authorizes a write.
- Application rollback and data restore are distinct.
- No secret, raw provider payload or unbounded log/sample window enters the protocol.
