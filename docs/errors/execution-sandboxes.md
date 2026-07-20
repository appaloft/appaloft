# Execution Sandbox Error Contract

## Stable Codes

| Code | Category | Phase | Retriable | Required safe details |
| --- | --- | --- | --- | --- |
| `sandbox_not_found` | not-found | context-resolution | false | sandbox id |
| `sandbox_template_not_found` | not-found | context-resolution | false | template id |
| `sandbox_snapshot_not_found` | not-found | context-resolution | false | snapshot id |
| `sandbox_state_conflict` | conflict | lifecycle-admission | false | sandbox id, current state, attempted transition |
| `sandbox_provider_unavailable` | integration | placement | true | requested capability/region, safe provider key when known |
| `sandbox_isolation_unsupported` | application | placement | false | requested and available isolation levels |
| `sandbox_capability_unsupported` | application | capability-admission | false | requested capability and safe provider key |
| `sandbox_quota_exceeded` | application | quota-admission | conditional | quota dimension, requested/available units, retry hint when temporal |
| `sandbox_expiry_invalid` | validation | command-validation | false | rejected field and allowed range |
| `sandbox_network_policy_invalid` | validation | command-validation | false | rule index/field without secret values |
| `sandbox_credential_grant_invalid` | validation | credential-admission | false | grant id/host/reason without secret value |
| `sandbox_provision_failed` | async-processing | provider-provision | conditional | sandbox id, attempt id, provider key, sanitized failure code |
| `sandbox_cleanup_failed` | async-processing | provider-cleanup | true | sandbox id, attempt id, exact safe ownership handle |
| `sandbox_exec_rejected` | application | runtime-admission | false | sandbox id, current state, rejected limit |
| `sandbox_exec_failed` | integration | runtime-execution | conditional | sandbox id, process id when allocated, sanitized provider code |
| `sandbox_process_not_found` | not-found | runtime-observation | false | sandbox id, process id |
| `sandbox_workspace_path_invalid` | validation | workspace-confinement | false | normalized safe relative path/reason |
| `sandbox_workspace_escape_blocked` | permission | workspace-confinement | false | sandbox id, reason; never a host path |
| `sandbox_file_too_large` | validation | file-transfer | false | requested/max bytes |
| `sandbox_port_invalid` | validation | port-admission | false | port/protocol/visibility |
| `sandbox_port_not_ready` | conflict | port-observation | true | sandbox id, port, readiness state |
| `sandbox_stream_cursor_expired` | conflict | stream-replay | false | stream kind, safe newest cursor and status-query operation |
| `sandbox_snapshot_failed` | async-processing | snapshot-capture | conditional | snapshot id, sandbox id, attempt id, sanitized provider code |

## Security Rules

- Errors never contain SSH/private keys, provider tokens, cookies, resolved credential values,
  registry credentials, raw environment secrets, raw command output, host filesystem paths or
  unredacted provider stderr.
- Provider exceptions are translated to a stable code and safe classification at the adapter
  boundary.
- A capability mismatch is not retried on the same placement; placement may select another
  compatible provider before command acceptance.

## Async Semantics

Provisioning, pause/resume, termination cleanup and snapshot capture may fail after command
acceptance. The original command remains `ok` with persisted attempt identity; status/events expose
retryable or terminal failure. Retry creates a new attempt id.
