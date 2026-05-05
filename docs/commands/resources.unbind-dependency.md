# resources.unbind-dependency Command Spec

## Metadata

- Operation key: `resources.unbind-dependency`
- Command class: `UnbindResourceDependencyCommand`
- Input schema: `UnbindResourceDependencyCommandInput`
- Handler: `UnbindResourceDependencyCommandHandler`
- Use case: `UnbindResourceDependencyUseCase`
- Domain / bounded context: Dependency Resources / Resource binding
- Current status: proposed for Phase 7 Code Round

## Purpose

Remove one active Resource dependency binding without deleting the Dependency Resource or any
external/provider database.

## Input Model

| Field | Required | Domain meaning |
| --- | --- | --- |
| `resourceId` | Yes | Resource that owns the binding surface. |
| `bindingId` | Yes | Binding to remove. |

## Branches

| Branch | Condition | Behavior | Result |
| --- | --- | --- | --- |
| Unbind | Active binding belongs to Resource | Mark the binding inactive/tombstoned. | `ok({ id })` |
| Already removed | Binding is already removed | Return idempotent success. | `ok({ id })` |
| Missing binding | Binding does not exist or is not visible to the Resource | Reject. | `not_found` |

## Events

| Event | Type | Publisher | Required? |
| --- | --- | --- | --- |
| `resource-dependency-unbound` | domain | `UnbindResourceDependencyUseCase` after persistence | Yes when state changes |

## Non-Effects

The command does not delete the Dependency Resource, delete external/provider databases, rotate
secrets, run backup/restore, clean runtime state, remove deployment snapshot references, or rewrite
historical deployment snapshots.
