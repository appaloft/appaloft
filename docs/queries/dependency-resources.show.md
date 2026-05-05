# dependency-resources.show Query Spec

## Intent

Read one dependency resource detail without mutating aggregate, provider, runtime, binding, backup,
or deployment state.

## Input

- `dependencyResourceId`

## Output

- `schemaVersion = dependency-resources.show/v1`
- `dependencyResource`
- `generatedAt`

The dependency resource detail includes ownership, status, source mode, provider key, masked
connection summary, binding readiness, backup relationship metadata, and delete-safety summary when
available. Raw secret material must never be returned.

Appaloft-managed Postgres details may also include safe realization status, last attempt id, safe
provider resource handle, sanitized failure code/category/phase, and masked provider endpoint
metadata. Provider SDK payloads and raw connection secrets must never be returned.
