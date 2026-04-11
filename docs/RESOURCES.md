# Resources

`ResourceInstance` and `ResourceBinding` are first-class Yundu concepts even before the full
resource provisioning context is implemented.

## Why This Exists

A deployment platform cannot model databases, caches, object storage, tracing, or monitoring as
"just environment variables". Those integrations have lifecycle, capability, and injection
semantics that must stay explicit.

## Resource Concepts

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
- `ResourceBinding`

Planned but not yet implemented:
- `ResourceInstance`
- resource provisioning commands
- resource restore / backup / upgrade flows
- release-scoped binding snapshots

## Modeling Rules

- bindings are not a thin join table; they carry behavior and invariants
- build-only bindings must not expose runtime-only references
- active releases must keep binding snapshots immutable
- provider SDK types must not leak into `core`

## Future Operation Surface

Expected future commands:
- `ProvisionResource`
- `BindResourceToWorkload`
- `RotateBindingSecrets`
- `UnbindResource`
- `RestoreResource`
- `DeleteResource`

These are not part of the current business surface until they are added to
[CORE_OPERATIONS.md](/Users/nichenqin/projects/yundu/docs/CORE_OPERATIONS.md) and the operation
catalog.
