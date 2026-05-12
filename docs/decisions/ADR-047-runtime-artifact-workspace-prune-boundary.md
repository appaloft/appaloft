# ADR-047: Runtime Artifact And Workspace Prune Boundary

Status: Accepted

Date: 2026-05-12

## Context

Runtime target capacity diagnostics are active, but the first public capacity surface is
read-only. Long-lived local-shell and generic-SSH targets can still accumulate stopped
Appaloft-managed containers and materialized source workspaces after preview cleanup, failed
rollouts, or historical deployment attempts.

Prune is destructive target maintenance. Without a separate command boundary, operators could
confuse capacity inspection with cleanup, or cleanup could remove active runtimes, rollback
candidates, Docker volumes, Appaloft state roots, or unrelated provider artifacts.

This decision extends the runtime target retention rules in ADR-023 and the rollback candidate
rules in ADR-034.

## Decision

Appaloft introduces `servers.capacity.prune` as the first runtime target prune command.

The command is deployment-target scoped. It operates on target-owned runtime artifacts and
materialized workspaces for one server/DeploymentTarget, not on Resource or Deployment aggregate
state. It must dispatch through the application command bus and an injected runtime target pruner
port.

`servers.capacity.prune` must:

- default to dry-run;
- require an ISO `before` cutoff and match candidates with `updatedAt < before`;
- preserve active runtime instances;
- preserve rollback candidates and any artifact/workspace that cannot prove it is outside rollback
  retention;
- exclude Docker volumes and Appaloft state roots by default;
- never prune remote `ssh-pglite` state, backups, migration journals, audit/events, deployment
  snapshots, resource state, server state, dependency data, storage volumes, logs, or route state;
- return bounded diagnostic facts for inspected, matched, skipped, and pruned candidates;
- keep raw shell output, credentials, environment values, and secret paths out of results and
  errors.
- record one aggregate-scoped audit row when a destructive prune succeeds and removes at least one
  candidate.

The first accepted prune categories are:

| Category | Meaning |
| --- | --- |
| `stopped-containers` | Appaloft-managed stopped containers whose labels prove target ownership and no active runtime dependency. |
| `preview-workspaces` | Preview-owned materialized source workspaces under the runtime source workspace root when ownership and cutoff can be proven. |
| `source-workspaces` | Deployment-scoped materialized source workspaces under the runtime source workspace root when no active runtime, diagnostic capture, or rollback candidate depends on them. |

Docker build cache and unused images remain diagnostic-only in this first command. They may be added
later only after local specs define rollback retention evidence and safe destructive behavior.
Docker volume prune requires a separate explicit operation.

## Consequences

- `servers.capacity.inspect` remains read-only and may estimate reclaimable bytes, but it must not
  mutate target state.
- `servers.capacity.prune` is the only public runtime artifact/workspace prune entrypoint in this
  slice.
- Runtime adapters own target-specific evidence collection and deletion, but application contracts
  own the provider-neutral command/result shape.
- The first implementation can report conservative skipped candidates instead of deleting when
  ownership, cutoff, active-runtime, or rollback safety evidence is incomplete.
- Audit output is recorded by an injected application port after successful destructive prune. The
  payload must contain only safe provider-neutral facts: operation key, server id, cutoff,
  categories, summary counts, and pruned timestamp. It must not include candidate targets, raw
  paths, shell output, credentials, environment values, private registry details, or secret paths.
- Audit recording failure after target deletion is not a rollback point. The command result remains
  the runtime prune result and includes a sanitized warning so operators know the audit write failed.
- Public docs/help must describe prune as operator maintenance and warn that Docker volumes,
  Appaloft state roots, audit/events, deployment snapshots, and rollback candidates are excluded.

## Governed Specs

- [Runtime Artifact And Workspace Prune](../specs/055-runtime-artifact-workspace-prune/spec.md)
- [servers.capacity.prune Command Spec](../commands/servers.capacity.prune.md)
- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Deployment Runtime Target Abstraction Workflow](../workflows/deployment-runtime-target-abstraction.md)
- [Runtime Target Abstraction Implementation Plan](../implementation/runtime-target-abstraction-plan.md)
- [Runtime Target Capacity Test Matrix](../testing/runtime-target-capacity-test-matrix.md)
- [ADR-021: Docker/OCI Workload Substrate](./ADR-021-docker-oci-workload-substrate.md)
- [ADR-023: Runtime Orchestration Target Boundary](./ADR-023-runtime-orchestration-target-boundary.md)
- [ADR-034: Deployment Recovery Readiness](./ADR-034-deployment-recovery-readiness.md)

## Migration Gaps

- The first Code Round prunes only stopped Appaloft-managed containers and materialized workspace
  candidates when target-owned evidence is present.
- Docker build cache and unused image deletion were intentionally left out of this first decision
  until rollback retention evidence was stronger.
- The audit row records the destructive runtime artifact/workspace prune command only. Domain event
  streams, outbox/inbox records, runtime/provider/deployment log retention, audit export, and
  legal-hold policy remain separate future governed slices.

ADR-050 resolves the Docker build-cache and unused-image gap by adding explicit opt-in prune
categories. Docker volume prune, scheduled retention automation, event-stream/outbox publication,
runtime/provider/deployment log retention, audit export, and legal-hold policy remain separate
future governed slices.
