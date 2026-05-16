# Deployment Archive And Prune Error Spec

## Governing Operations

- `deployments.archive`
- `deployments.prune`

## Error Codes

| Code | Category | Phase | Retryable | Applies to | Safe details |
| --- | --- | --- | --- | --- | --- |
| `validation_error` | `user` | command-validation | No | archive, prune | deployment id, cutoff, field name |
| `not_found` | `user` | deployment-load | No | archive | deployment id |
| `resource_context_mismatch` | `user` | deployment-resource-context | No | archive | requested Resource id and actual Resource id |
| `deployment_archive_not_allowed` | `user` | archive-admission | No | archive | deployment id, Resource id, current deployment status |
| `infra` | `infra` | deployment-attempt-retention | Conditional | prune | sanitized persistence phase and reason |

## Redaction

Errors must not expose runtime logs, provider payloads, raw source payloads, environment values,
secret values, provider credentials, SSH output, or filesystem paths beyond safe deployment/resource/
server ids and stable retention phases.
