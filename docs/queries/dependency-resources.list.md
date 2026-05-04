# dependency-resources.list Query Spec

## Intent

List non-deleted dependency resources with safe ownership, status, connection exposure, binding
readiness, and backup relationship summaries.

## Input

- optional `projectId`
- optional `environmentId`
- optional `kind`

## Output

- `schemaVersion = dependency-resources.list/v1`
- `items[]`
- `generatedAt`

Each item must mask or omit raw secret material.
