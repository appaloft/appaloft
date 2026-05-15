# dependency-resources.backup-policies.list Query Spec

## Intent

List safe scheduled backup policy summaries.

## Input

- optional `dependencyResourceId`
- optional `enabledOnly`
- optional `dueAt`

## Success

Returns policy summaries with dependency resource id, interval hours, retention metadata, provider
key, retry preference, enabled state, last run timestamp, next run timestamp, and update timestamp.

## Output Safety

The query must not expose raw backup contents, raw connection URLs, passwords, tokens, auth headers,
cookies, SSH credentials, provider tokens, private keys, sensitive query parameters, provider SDK
payloads, or command output.

## Non-Goals

No mutation, backup execution, backup prune/delete, backup export, provider inspection, runtime
work, or deployment snapshot mutation.
