# environments.clone Command Spec

## Status

- Operation key: `environments.clone`
- Message: `CloneEnvironmentCommand`
- Input schema: `CloneEnvironmentCommandInput`
- Handler: `CloneEnvironmentCommandHandler`
- Use case: `CloneEnvironmentUseCase`
- State: active command

## Intent

`environments.clone` creates a new active environment in the same project as an active source
environment. It copies the source environment's current environment-owned configuration entries at
clone time and records the source environment as the new environment's parent.

Clone is configuration copy only. It does not promote a release, create a deployment, copy resource
state, or perform runtime cleanup.

## Input

```ts
type CloneEnvironmentCommandInput = {
  environmentId: string;
  targetName: string;
  targetKind?: "local" | "development" | "test" | "staging" | "production" | "preview" | "custom";
};
```

Rules:

- `environmentId` must identify an existing source environment.
- `targetName` must be non-empty and unique within the source project.
- `targetKind` defaults to the source environment kind when omitted.

## Processing Rules

1. Validate command input.
2. Resolve the source environment by id.
3. Resolve the source project and reject archived projects with `project_archived`.
4. Reject archived source environments with `environment_archived`.
5. Reject a duplicate `targetName` inside the same project with `conflict`.
6. Generate the new environment id through the injected `IdGenerator`.
7. Create the cloned environment in the same project with:
   - active lifecycle status;
   - target name;
   - target kind or source kind;
   - `parentEnvironmentId = source environment id`;
   - current clock timestamp as `createdAt`;
   - source environment-owned variables copied into the new environment scope.
8. Persist the new environment with the environment repository.
9. Return `ok({ id })`.

## Error Profile

| Error code | Category | Phase | Retriable | Details |
| --- | --- | --- | --- | --- |
| `validation_error` | `validation` | `command-validation` | No | Invalid source id, target name, or target kind. |
| `not_found` | `not-found` | `context-resolution` | No | Source environment or source project is missing. |
| `environment_archived` | `conflict` | `environment-lifecycle-guard` | No | Source environment is archived. |
| `project_archived` | `conflict` | `project-lifecycle-guard` | No | Source project is archived. |
| `conflict` | `conflict` | `environment-admission` | No | Target environment name already exists in the source project. |
| `infra_error` | `infra` | `environment-persistence` | Conditional | Cloned environment state could not be safely persisted. |

Error details must include the safest relevant ids or names and must never include plaintext
environment values or provider credentials.

## Events

No public domain event is introduced for this slice. A future environment-created event family may
cover create, clone, and promotion together when specified.

## Entrypoints

| Surface | Contract |
| --- | --- |
| CLI | `appaloft env clone <environmentId> --name <targetName> [--kind <kind>]` |
| HTTP/oRPC | `POST /api/environments/{environmentId}/clone` |
| Web | Project detail environment list clone control dispatches this command. |
| Future MCP/tools | Generated from operation catalog metadata and this command schema. |

## Non-Goals

- Cross-project clone.
- Copying resources, deployments, domains, certificates, source links, runtime state, logs, or
  audit records.
- Generic environment update.
