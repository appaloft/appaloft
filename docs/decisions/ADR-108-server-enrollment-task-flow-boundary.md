# ADR-108: Server Enrollment Task Flow Boundary

Status: Accepted

Date: 2026-08-11

## Context

Appaloft already owns Server registration, credential attachment, connectivity diagnostics,
runtime preparation and Server readback as separate public operations. R1 requires a developer to
activate the local Mac or one registered VPS before selecting it for an Agent Workspace. Requiring
five internal-id-oriented commands makes that first target journey unnecessarily fragile, while a
new enrollment aggregate would duplicate existing DeploymentTarget lifecycle truth.

## Decision

1. `appaloft server enroll` is a public CLI task flow over the existing Server commands/query. It
   does not add an operation-catalog message, aggregate, event, persistence or API.
2. The first slice accepts exactly `--local` or one secret-free `ssh://user@host[:port]` target.
   SSH passwords, paths, queries, fragments and other schemes are rejected before mutation.
3. Enrollment sequences register, optional SSH credential attachment, connectivity diagnostic,
   idempotent runtime preparation and authoritative Server readback.
4. Registration prints a safe Server-id checkpoint before external credential/connectivity/runtime
   effects. A later failure exits non-zero with the original operation error and does not delete
   the Server, so the user can repair or retry through existing granular commands.
5. Completion requires the runtime preparation result to be `ready` and includes `servers.show`
   runtime-availability readback. Registration or connectivity alone is not readiness proof.
6. Private-key bytes are read only from a user-selected local file, passed to the existing
   credential command, and excluded from task results, errors, argv, audit and Server readback.
7. Cloud may inject authz, tenancy, credential custody, audit and provider behavior into the same
   existing operations. It must not add a Cloud enrollment lifecycle or copy the coordinator.
8. Outbound Worker/mTLS enrollment, interactive TUI Server management and native Agent credential
   enrollment are separately governed follow-up behavior.

## Consequences

- Local and registered-VPS activation use one memorable command with truthful readiness.
- Every lifecycle fact remains owned by the existing Server aggregate and read model.
- A partial failure is visible and recoverable instead of being hidden by destructive rollback.
- Granular CLI/API/SDK/MCP operations remain available for automation and repair.
- Cloud adopts one public task flow without parallel state or APIs.

## Rejected Alternatives

- A Host/Machine/Enrollment aggregate or enrollment persistence table.
- A Cloud-only wizard or API wrapper.
- An SSH URI containing password or private key material.
- Automatic deletion after a later enrollment stage fails.
- Claiming readiness from registration, connectivity or proxy status alone.

## Verification

See [Server Enrollment Task Flow](../specs/129-server-enrollment-task-flow/spec.md) and the
[Server Enrollment Task Flow Test Matrix](../testing/server-enrollment-task-flow-test-matrix.md).
