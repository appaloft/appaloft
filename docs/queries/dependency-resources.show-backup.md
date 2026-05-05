# dependency-resources.show-backup Query Spec

## Intent

Read one dependency resource backup and its safe restore point/restore attempt metadata.

## Input

- `backupId`

## Success

Returns safe backup detail for one `DependencyResourceBackup`, including dependency resource
ownership, dependency kind, status, attempt ids, provider artifact handle, retention metadata,
size/checksum metadata when safe, latest restore attempt status, and sanitized failure metadata.

## Output Safety

The query must not expose raw dump contents, raw connection URLs, passwords, tokens, auth headers,
cookies, SSH credentials, provider tokens, private keys, sensitive query parameters, provider SDK
payloads, or command output.

## Non-Goals

No mutation, provider inspection, dump download, restore, backup prune/delete, runtime work, or
deployment snapshot mutation.

