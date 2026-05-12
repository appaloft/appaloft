# ADR-050: Docker Cache And Image Prune Boundary

Status: Accepted

Date: 2026-05-12

## Context

ADR-047 introduced `servers.capacity.prune` for stopped Appaloft-managed containers and
materialized source workspaces, while intentionally keeping Docker build-cache and unused image
deletion diagnostic-only until rollback retention evidence was clearer.

Phase 9 still requires documented retention/prune behavior for build cache and runtime artifacts.
Docker build cache and unused images can consume target disk outside deployment aggregate state, but
they also have weaker Appaloft ownership evidence than labeled containers or deployment-scoped
workspaces.

## Decision

`servers.capacity.prune` may add two explicit opt-in categories:

| Category | Meaning |
| --- | --- |
| `docker-build-cache` | Docker build cache records older than the cutoff. |
| `unused-images` | Docker images older than the cutoff that Docker reports as dangling or unused. |

These categories are not part of the default category set. Operators must request them explicitly
through `categories` or repeated CLI `--category` flags.

The runtime target adapter must:

- keep dry-run as the default;
- match candidates with `updatedAt < before`;
- use Docker's own prune filters with `until=<before>` for destructive deletion;
- never run broad `docker system prune`;
- never prune Docker volumes;
- never delete running containers, Appaloft state roots, remote state, backups, migration journals,
  deployment snapshots, logs, audit/events, outbox/inbox rows, resource/server/deployment state, or
  provider resources;
- prefer skipped diagnostics over deletion when Docker is unavailable, cutoff cannot be translated,
  or safe evidence is incomplete;
- return only bounded provider-neutral diagnostics and avoid raw shell output, credentials,
  environment values, private registry details, or secret paths.

For unused images, Appaloft relies on Docker's image prune safety boundary: images referenced by
containers are retained by Docker. Appaloft does not remove images by tag or digest directly in this
operation.

For build cache, Appaloft relies on Docker builder prune with an `until` filter. Build cache is not
a rollback candidate by itself; rollback safety remains protected by preserving active runtimes,
rollback workspaces, deployment snapshots, and container/image references that Docker reports as in
use.

## Consequences

- `servers.capacity.inspect` remains read-only and may continue to estimate image and build-cache
  reclaimable bytes.
- `servers.capacity.prune` remains the only public runtime target prune entrypoint for these
  categories.
- Default prune remains conservative and does not delete build cache or images unless selected.
- Docker volume prune still requires a separate explicit operation and remains out of scope.
- Scheduled prune automation remains out of scope for this decision.

## Governed Specs

- [Runtime Artifact And Workspace Prune](../specs/055-runtime-artifact-workspace-prune/spec.md)
- [servers.capacity.prune Command Spec](../commands/servers.capacity.prune.md)
- [Runtime Target Capacity Test Matrix](../testing/runtime-target-capacity-test-matrix.md)
- [ADR-047: Runtime Artifact And Workspace Prune Boundary](./ADR-047-runtime-artifact-workspace-prune-boundary.md)
