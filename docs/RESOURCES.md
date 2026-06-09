# Resources

Appaloft now uses two related but different resource concepts:

- `Resource`: the project/environment-scoped deployable unit, such as a Next.js frontend, Express
  backend, Redis, Postgres, worker, static site, or Docker Compose stack.
- `Destination`: the target-side placement / isolation boundary where a resource deploys.
- `ResourceInstance`: a provisioned or externally attached dependency resource used through
  bindings, such as a managed Postgres instance or object storage bucket.
- `StorageVolume`: a durable mounted storage identity attached to Resources through
  `ResourceStorageAttachment`, such as a named volume or bind mount.

`ResourceInstance` and `ResourceBinding` are first-class Appaloft concepts. Appaloft-managed
Dependency resource provisioning/import for `postgres`, `redis`, `mysql`, `clickhouse`,
`object-storage`, and `opensearch`, binding, store-backed runtime secret resolution,
provider-backed delete, and backup/restore are active through the dependency resource operation
surface.

`StorageVolume` is not a `ResourceInstance`. Volume-backed SQLite files, uploads, and application
state are managed through Storage Volume lifecycle and Resource storage attachments, not through the
Dependency Resources page or `dependency-resources.*` backup/restore operations. See
[ADR-083](./decisions/ADR-083-storage-volume-dependency-resource-and-backup-boundary.md).

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
- `StorageVolume`
  - durable provider-neutral storage identity for mounted application data
- `ResourceStorageAttachment`
  - the contract between a Resource and a StorageVolume at a workload destination path
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
- Appaloft-managed dependency provisioning through `dependency-resources.provision`
- external dependency import through `dependency-resources.import`
- dependency binding, unbinding, binding-secret rotation, and safe runtime injection
- dependency resource list/show/rename/delete with binding, backup, snapshot, and provider blockers
- dependency backup create/list/show and acknowledged in-place restore for Postgres and Redis
- storage volume list/show/create/rename/delete, Resource storage attach/detach, and dry-run-first
  runtime cleanup
- storage backup/restore command/query contracts, read models, CLI, HTTP/oRPC, and Resource Storage
  Web controls; unsupported source adapters or target providers return blockers/errors instead of
  unsafe live data copy

## Modeling Rules

- bindings are not a thin join table; they carry behavior and invariants
- build-only bindings must not expose runtime-only references
- active releases must keep binding snapshots immutable
- provider SDK types must not leak into `core`
- mounted storage must not be represented as a Dependency Resource
- local-only storage backup must not be described as disaster recovery

## Governed Extensions

Separate specs are required before adding:
- concrete storage backup source adapters and target providers beyond the registered public/test
  composition
- scheduled backup policies and backup pruning/deletion
- backup export/download flows
- cross-resource restore
- provider-native upgrade flows
- broader provider families beyond the active Postgres and Redis capability contracts

Current user-facing dependency resource operations are listed in
[CORE_OPERATIONS.md](/Users/nichenqin/projects/appaloft/docs/CORE_OPERATIONS.md) and must stay
aligned with the operation catalog, public docs metadata, and the dependency resource test matrix.
Current storage volume operations are listed in the same catalog and must stay aligned with the
storage volume test matrix and
[Storage Volume Resource Visibility](./specs/096-storage-volume-resource-visibility/spec.md).
