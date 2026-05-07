# dependency-resources.list-backups Query Spec

## Intent

List safe backup and restore point summaries for one dependency resource.

## Input

- `dependencyResourceId`
- optional `status`

## Success

Returns backup summaries with safe owner metadata, status, attempt ids, restore point metadata,
retention metadata, and sanitized failure metadata.

## Output Safety

The query must not expose raw dump contents, raw connection URLs, passwords, tokens, auth headers,
cookies, SSH credentials, provider tokens, private keys, sensitive query parameters, provider SDK
payloads, or command output.

## Non-Goals

No mutation, provider inspection, dump download, restore, backup prune/delete, runtime work, or
deployment snapshot mutation.

## Current Implementation Notes

Pagination is deferred; this slice supports dependency-resource id filtering plus optional status.
