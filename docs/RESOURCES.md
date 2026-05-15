# Resources

Appaloft now uses two related but different resource concepts:

- `Resource`: the project/environment-scoped deployable unit, such as a Next.js frontend, Express
  backend, Redis, Postgres, worker, static site, or Docker Compose stack.
- `Destination`: the target-side placement / isolation boundary where a resource deploys.
- `ResourceInstance`: a provisioned or externally attached dependency resource used through
  bindings, such as a managed Postgres instance or object storage bucket.

`ResourceInstance` and `ResourceBinding` are first-class Appaloft concepts. Appaloft-managed
Postgres and Redis provisioning, imported Postgres/Redis metadata, binding, store-backed runtime
secret resolution, provider-backed delete, and backup/restore are active through the dependency
resource operation surface.

## Why This Exists

A deployment platform cannot model databases, caches, object storage, tracing, or monitoring as
"just environment variables". Those integrations have lifecycle, capability, and injection
semantics that must stay explicit.

## Resource Concepts

- `Resource`
  - a project/environment-scoped deployable unit
  - a compose-stack resource may contain multiple named services
  - may point at a default destination
- `Destination`
  - belongs to one deployment target / server
  - represents runtime placement, not project organization
- `ResourceInstance`
  - a provisioned or externally attached dependency
- `ResourceBinding`
  - the contract between a workload and a resource instance
- `BindingScope`
  - `environment`, `release`, `build-only`, `runtime-only`
- `InjectionMode`
  - `env`, `file`, `reference`

## Current Status

Implemented in `core`:
- `Resource`
- `Destination`
- `ResourceInstance`
- `ResourceBinding`

Implemented through application, CLI, HTTP/oRPC, Web, and provider capability boundaries:
- Appaloft-managed Postgres and Redis provisioning
- external Postgres and Redis import
- dependency binding, unbinding, binding-secret rotation, and safe runtime injection
- dependency resource list/show/rename/delete with binding, backup, snapshot, and provider blockers
- dependency backup create/list/show and acknowledged in-place restore for Postgres and Redis

## Modeling Rules

- bindings are not a thin join table; they carry behavior and invariants
- build-only bindings must not expose runtime-only references
- active releases must keep binding snapshots immutable
- provider SDK types must not leak into `core`

## Governed Extensions

Separate specs are required before adding:
- scheduled backup policies and backup pruning/deletion
- backup export/download flows
- cross-resource restore
- provider-native upgrade flows
- broader provider families beyond the active Postgres and Redis capability contracts

Current user-facing dependency resource operations are listed in
[CORE_OPERATIONS.md](/Users/nichenqin/projects/appaloft/docs/CORE_OPERATIONS.md) and must stay
aligned with the operation catalog, public docs metadata, and the dependency resource test matrix.
