# resources.set-variable Command Spec

## Normative Contract

`resources.set-variable` is the source-of-truth command for storing one resource-scoped variable or
secret override owned by one resource.

Command success means the resource-owned override layer was durably updated. It does not mutate the
environment aggregate, historical deployment snapshots, current runtime, domains, or proxy state.

```ts
type SetResourceVariableResult = Result<{ id: string }, DomainError>;
```

The command contract is:

- admission failure returns `err(DomainError)`;
- accepted success returns `ok({ id })`;
- accepted success persists the `Resource` aggregate with the updated override entry;
- accepted success publishes or records `resource-variable-set`;
- future `deployments.create` attempts materialize the effective deployment snapshot with this
  resource-owned override applied after environment precedence is resolved;
- historical deployment snapshots remain unchanged.

## Global References

This command inherits:

- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [resources.show Query Spec](../queries/resources.show.md)
- [resources.effective-config Query Spec](../queries/resources.effective-config.md)
- [Resource Profile Lifecycle Workflow](../workflows/resource-profile-lifecycle.md)
- [resource-variable-set Event Spec](../events/resource-variable-set.md)
- [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Purpose

Persist one resource-scoped variable override for future deployment snapshot materialization.

It is not:

- an environment mutation command;
- a deployment mutation command;
- a current runtime hot-reload command;
- a generic resource update command;
- a `.env` bulk import command.

## Input Model

```ts
type SetResourceVariableCommandInput = {
  resourceId: string;
  key: string;
  value: string;
  kind?: "plain-config" | "secret" | "provider-specific" | "deployment-strategy";
  exposure: "build-time" | "runtime";
  isSecret?: boolean;
  idempotencyKey?: string;
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `resourceId` | Required | Resource whose override layer is changing. |
| `key` | Required | Variable key. Identity is `key + exposure`. |
| `value` | Required | Variable value stored on the write side and masked on read surfaces when secret. |
| `kind` | Optional | Variable classification. Defaults to `plain-config` unless the entry is explicitly secret. |
| `exposure` | Required | `build-time` or `runtime`. |
| `isSecret` | Optional | Whether the value is secret and must be masked on read surfaces. |
| `idempotencyKey` | Optional | Deduplicates retries for the same intended change. |

The command must always persist `scope = "resource"` and must not accept another scope from
transport callers.

## Admission Flow

The command must:

1. Validate command input.
2. Resolve `resourceId`.
3. Reject missing or invisible resource with `not_found`.
4. Reject archived resources with `resource_archived`.
5. Normalize and validate key, exposure, kind, and secret policy through value objects.
6. Reject build-time variables without a `PUBLIC_` or `VITE_` prefix.
7. Reject build-time variables marked secret.
8. Persist the updated `Resource` aggregate.
9. Publish or record `resource-variable-set`.
10. Return `ok({ id })`.

## Resource-Specific Rules

Resource-scoped variable precedence sits above environment scope and below the immutable deployment
snapshot boundary.

Resource-owned secret values are allowed only for runtime exposure. Read models, CLI output, Web
surfaces, diagnostics, logs, and HTTP/oRPC responses must expose only masked values.

The command replaces the resource-owned entry for the same `key + exposure` identity. It must not
create duplicate active entries for the same identity at resource scope.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Resource detail configuration form dispatches this command and refetches `resources.effective-config`. | Active |
| CLI | `appaloft resource set-variable <resourceId> <key> <value> ...`. | Active |
| oRPC / HTTP | `POST /api/resources/{resourceId}/variables` using the command schema. | Active |
| Automation / MCP | Future command/tool over the same operation key. | Future |

## Events

Canonical event spec:

- [resource-variable-set](../events/resource-variable-set.md): resource-owned variable override was
  durably stored.

## Current Implementation Notes And Migration Gaps

This command is active in operation catalog, CLI, HTTP/oRPC, Web resource detail configuration,
persistence, and deployment-snapshot materialization. It remains paired with
`resources.unset-variable` and `resources.effective-config` for the observable read path.

## Open Questions

- Bulk `.env` import remains future behavior and is not introduced by this command.
