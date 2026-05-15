# dependency-resources.backup-policies.show Query Spec

## Intent

Read one safe scheduled backup policy summary.

## Input

- `policyId`

## Success

Returns the policy when found, otherwise `policy: null`. The policy includes dependency resource id,
interval hours, retention metadata, provider key, retry preference, enabled state, last run
timestamp, next run timestamp, and update timestamp.

## Output Safety

The query must not expose raw backup contents, raw connection URLs, passwords, tokens, auth headers,
cookies, SSH credentials, provider tokens, private keys, sensitive query parameters, provider SDK
payloads, or command output.

## Non-Goals

No mutation, backup execution, backup prune/delete, backup export, provider inspection, runtime
work, or deployment snapshot mutation.
