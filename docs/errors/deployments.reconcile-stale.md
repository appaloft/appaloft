# deployments.reconcile-stale Errors

| Code | Category | Phase | Retryable | Meaning |
| --- | --- | --- | --- | --- |
| `validation_error` | validation | command-validation | No | Confirmation, threshold, or state version is invalid. |
| `not_found` | not_found | reconcile-admission | No | Deployment is not visible. |
| `deployment_reconciliation_not_allowed` | conflict | reconcile-admission | Yes | Attempt is terminal, recent, or otherwise not reconcilable. |
| `deployment_reconciliation_state_stale` | conflict | reconcile-admission | Yes | Durable status/activity changed after observation. |
| `infra_error` | infra | runtime-cancel / persistence | Yes | Runtime cancellation or durable transition failed. |
