# resources.delete Command Spec

## Normative Contract

`resources.delete` is the source-of-truth command for permanently removing an archived resource
only after deletion guards prove the resource is unreferenced.

Command success means the resource aggregate/read-model identity is removed from normal active
resource queries. It must not cascade-delete deployments, domains, certificates, runtime instances,
source links, dependency resources, or logs.

```ts
type DeleteResourceResult = Result<{ id: string }, DomainError>;
```

The command contract is:

- admission failure returns `err(DomainError)`;
- accepted success returns `ok({ id })`;
- accepted success deletes or tombstones the `Resource` aggregate according to repository support;
- accepted success publishes or records `resource-deleted`;
- deletion is allowed only for archived resources that pass all deletion guards.

## Global References

This command inherits:

- [ADR-011: Resource Create Minimum Lifecycle](../decisions/ADR-011-resource-create-minimum-lifecycle.md)
- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [resources.archive Command Spec](./resources.archive.md)
- [resources.show Query Spec](../queries/resources.show.md)
- [resource-deleted Event Spec](../events/resource-deleted.md)
- [Resource Profile Lifecycle Workflow](../workflows/resource-profile-lifecycle.md)
- [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Purpose

Remove an unused resource shell from active Appaloft state when retaining it would only create
operator noise.

It is not:

- a generic resource update command;
- an archive command;
- a runtime cleanup command;
- a deployment history cleanup command;
- a domain/certificate cleanup command;
- a cascading delete.

## Input Model

```ts
type DeleteResourceCommandInput = {
  resourceId: string;
  confirmation: {
    resourceSlug: string;
  };
  idempotencyKey?: string;
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `resourceId` | Required | Archived resource being deleted. |
| `confirmation.resourceSlug` | Required | Operator confirmation matching the current resource slug. |
| `idempotencyKey` | Optional | Deduplicates retries for the same delete request. |

## Admission Flow

The command must:

1. Validate command input.
2. Resolve `resourceId`.
3. Reject missing or invisible resource with `not_found`.
4. Reject active resources with `resource_delete_blocked`.
5. Verify `confirmation.resourceSlug` matches the current resource slug.
6. Check deletion guards for deployment history, active runtime, domain bindings, certificates,
   generated/server-applied access routes, source links, dependency bindings, terminal sessions,
   and retained audit requirements.
7. Return `resource_delete_blocked` with safe blocker details when any guard fails.
8. Delete or tombstone the resource through the repository.
9. Publish or record `resource-deleted` with a safe snapshot of deleted resource identity.
10. Return `ok({ id })`.

## Resource-Specific Rules

Delete is intentionally narrower than archive. Most real deployed resources should be archived,
not deleted, because deployment history, domain/TLS state, source links, runtime state, and support
context are product data.

The command must never perform implicit cleanup of runtime containers, proxy routes, domains,
certificates, source links, dependency resources, logs, or deployment records. Each cleanup path
needs its own explicit command or workflow before deletion can pass guards.

After deletion, normal `resources.show` and `resources.list` return `not_found` or omit the
resource. Audit-only deleted-resource inspection requires a separate future query if needed.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Resource detail destructive action dispatches this command only for archived resources after typed confirmation. | Required in Code Round |
| CLI | `appaloft resource delete <resourceId> --confirm-slug <slug>`. | Required in Code Round |
| oRPC / HTTP | `DELETE /api/resources/{resourceId}` using the command schema. | Required in Code Round |
| Automation / MCP | Future command/tool over the same operation key. | Future |

## Events

Canonical event spec:

- [resource-deleted](../events/resource-deleted.md): archived unreferenced resource was removed
  from normal active resource state.

## Current Implementation Notes And Migration Gaps

Resource deletion is not active until this command appears in `CORE_OPERATIONS.md`,
`operation-catalog.ts`, application slices, transports, read-model deletion/tombstone behavior, and
tests.

## Open Questions

- None for the guarded delete boundary. Cleanup of retained blockers remains separate future
  behavior.
