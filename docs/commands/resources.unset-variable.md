# resources.unset-variable Command Spec

## Normative Contract

`resources.unset-variable` is the source-of-truth command for removing one resource-scoped variable
override owned by one resource.

Command success means the resource-owned override layer no longer contains the requested
`key + exposure` identity. It does not mutate environment scope, historical deployment snapshots,
current runtime, or domains.

```ts
type UnsetResourceVariableResult = Result<{ id: string }, DomainError>;
```

## Global References

This command inherits:

- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [resources.effective-config Query Spec](../queries/resources.effective-config.md)
- [Resource Profile Lifecycle Workflow](../workflows/resource-profile-lifecycle.md)
- [resource-variable-unset Event Spec](../events/resource-variable-unset.md)
- [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Input Model

```ts
type UnsetResourceVariableCommandInput = {
  resourceId: string;
  key: string;
  exposure: "build-time" | "runtime";
  idempotencyKey?: string;
};
```

## Admission Flow

The command must:

1. Validate command input.
2. Resolve `resourceId`.
3. Reject missing or invisible resource with `not_found`.
4. Reject archived resources with `resource_archived`.
5. Resolve the resource-scoped variable identity by `key + exposure`.
6. Reject missing resource-scoped entry with `not_found`, `phase = config-read`.
7. Persist the updated `Resource` aggregate.
8. Publish or record `resource-variable-unset`.
9. Return `ok({ id })`.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Resource detail configuration row action dispatches this command and refetches `resources.effective-config`. | Required in Code Round |
| CLI | `appaloft resource unset-variable <resourceId> <key> --exposure <...>`. | Required in Code Round |
| oRPC / HTTP | `DELETE /api/resources/{resourceId}/variables/{key}` using the command schema. | Required in Code Round |
| Automation / MCP | Future command/tool over the same operation key. | Future |

## Current Implementation Notes And Migration Gaps

This command must land in the same Code Round as `resources.set-variable`,
`resources.effective-config`, and deployment snapshot precedence updates.
