# environments.archive Command Spec

## Metadata

- Operation key: `environments.archive`
- Command class: `ArchiveEnvironmentCommand`
- Input schema: `ArchiveEnvironmentCommandInput`
- Handler: `ArchiveEnvironmentCommandHandler`
- Use case: `ArchiveEnvironmentUseCase`
- Domain / bounded context: Workspace / Environment lifecycle
- Current status: active command
- Source classification: normative contract

## Normative Contract

`environments.archive` is the source-of-truth command for retiring an environment from new
configuration mutations, resource creation, and deployment admission while retaining readable
history.

Command success means the environment lifecycle status is durably `archived`.

```ts
type ArchiveEnvironmentResult = Result<{ id: string }, DomainError>;
```

The command contract is:

- admission failure returns `err(DomainError)`;
- success returns `ok({ id })`;
- success persists archived lifecycle status and archive metadata;
- success publishes or records `environment-archived` only when state changes;
- archived environments remain readable through environment read queries.

## Global References

- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [environment-archived Event Spec](../events/environment-archived.md)
- [Environment Lifecycle Workflow](../workflows/environment-lifecycle.md)
- [Environment Lifecycle Error Spec](../errors/environments.lifecycle.md)
- [Environment Lifecycle Test Matrix](../testing/environment-lifecycle-test-matrix.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Input Model

```ts
type ArchiveEnvironmentCommandInput = {
  environmentId: string;
  reason?: string;
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `environmentId` | Required | Environment being archived. |
| `reason` | Optional | Short safe operator note for audit/read models. |

`reason` uses the shared safe archive reason rules: trim, reject empty values when present, reject
multiline/control characters, cap length to 280 characters, and reject obvious secret material.

## Lifecycle Rules

New environments start as `active`. An active environment can transition to `archived` exactly
once. Already archived environments are idempotent for this command: the command returns
`ok({ id })`, does not change `archivedAt` or `reason`, and does not publish a duplicate
`environment-archived` event.

Environment archive does not delete or archive resources, deployments, domain bindings,
certificates, source links, runtime state, logs, or audit history.

After archive:

- `environments.show`, `environments.list`, `environments.effective-precedence`, and
  `environments.diff` remain readable;
- `environments.set-variable`, `environments.unset-variable`, and `environments.promote` reject
  the archived environment;
- `resources.create` rejects the archived environment;
- `deployments.create` rejects the archived environment before creating default/configured resources
  or deployment state;
- cleanup requires separate explicit commands and safety rules.

## Admission Flow

The command must:

1. Validate command input.
2. Resolve `environmentId`.
3. Reject missing or invisible environment with `not_found`.
4. Treat an already archived environment as idempotent success.
5. Capture archive time through the injected clock.
6. Persist archived lifecycle status, archive timestamp, and optional safe reason.
7. Publish or record `environment-archived` when the state changes.
8. Return `ok({ id })`.

## Error Contract

All errors use [Environment Lifecycle Error Spec](../errors/environments.lifecycle.md).

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | `environmentId` or `reason` shape is invalid. |
| `not_found` | `context-resolution` | No | Environment does not exist or is not visible. |
| `invariant_violation` | `environment-lifecycle-guard` | No | Environment lifecycle state cannot transition to archived. |
| `infra_error` | `environment-persistence` | Conditional | Archive state could not be safely persisted. |
| `infra_error` | `event-publication` | Conditional | Event publication could not be recorded before command success. |

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Project detail environment lifecycle action dispatches this command after confirmation. | Active |
| CLI | `appaloft env archive <environmentId> [--reason ...]`. | Active |
| oRPC / HTTP | `POST /api/environments/{environmentId}/archive` using the command schema. | Active |
| Automation / MCP | Future command/tool over the same operation key. | Future |

## Current Implementation Notes And Migration Gaps

Environment archive is active in specs, operation catalog, application, persistence, CLI, HTTP/oRPC,
Web, public docs/help, and focused tests.

No migration gaps are recorded for this slice.

## Open Questions

- None for archive semantics. Clone, lock, history, delete/restore, and cleanup remain future named
  behaviors.
