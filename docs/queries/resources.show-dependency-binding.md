# resources.show-dependency-binding Query Spec

## Metadata

- Operation key: `resources.show-dependency-binding`
- Query class: `ShowResourceDependencyBindingQuery`
- Input schema: `ShowResourceDependencyBindingQueryInput`
- Handler: `ShowResourceDependencyBindingQueryHandler`
- Query service: `ShowResourceDependencyBindingQueryService`
- Domain / bounded context: Dependency Resources / Resource binding read model
- Current status: proposed for Phase 7 Code Round

## Purpose

Read one Resource dependency binding detail without mutating Resource, Dependency Resource,
runtime, provider, backup, or deployment state.

## Input Model

| Field | Required | Domain meaning |
| --- | --- | --- |
| `resourceId` | Yes | Resource that owns the binding surface. |
| `bindingId` | Yes | Binding to read. |

## Output Model

Returns `schemaVersion = "resources.dependency-bindings.show/v1"`, `binding`, and `generatedAt`.

The binding detail includes safe Resource identity, Dependency Resource identity, dependency
kind/source mode/lifecycle status, target exposure metadata, masked connection summary, binding
readiness, and snapshot readiness.

The query returns `not_found` for missing or removed bindings and never returns raw secret material.
