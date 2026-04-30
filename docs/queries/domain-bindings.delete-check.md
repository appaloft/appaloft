# domain-bindings.delete-check Query Spec

## Normative Contract

`domain-bindings.delete-check` reads whether a durable domain binding can be deleted safely.

The check must explain blockers and warnings without mutating state. It must make clear that delete
preserves generated access, deployment snapshots, and server-applied route audit, and does not
revoke or delete certificates.

## Input

| Field | Requirement | Meaning |
| --- | --- | --- |
| `domainBindingId` | Required | Binding to check. |

## Output

| Field | Meaning |
| --- | --- |
| `safeToDelete` | `true` only when no blocking lifecycle state remains. |
| `blockers` | Blocking retained state such as active certificate state. |
| `warnings` | Non-blocking retained history such as historical certificate attempts. |
| `preservesGeneratedAccess` | Always true. |
| `preservesDeploymentSnapshots` | Always true. |
| `preservesServerAppliedRouteAudit` | Always true. |
