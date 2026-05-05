# Source Event Auto Deploy Error Spec

## Status

Spec Round error contract for accepted candidate source auto-deploy operations. These errors become
active only when their owning command/query slices are implemented.

## Governing Sources

- [Error Model](./model.md)
- [neverthrow Conventions](./neverthrow-conventions.md)
- [ADR-037: Source Event Auto Deploy Ownership](../decisions/ADR-037-source-event-auto-deploy-ownership.md)
- [resources.configure-auto-deploy Command Spec](../commands/resources.configure-auto-deploy.md)
- [source-events.ingest Command Spec](../commands/source-events.ingest.md)
- [source-events.list Query Spec](../queries/source-events.list.md)
- [source-events.show Query Spec](../queries/source-events.show.md)
- [Source Binding Auto Deploy Test Matrix](../testing/source-binding-auto-deploy-test-matrix.md)

## Stable Error Codes

| Code | Category | Phase | Retriable | Owner | Required safe details |
| --- | --- | --- | --- | --- | --- |
| `resource_auto_deploy_source_missing` | `application` or `conflict` | `auto-deploy-policy-admission` | No | `resources.configure-auto-deploy` | resource id, required source kind when known |
| `resource_auto_deploy_policy_blocked` | `conflict` | `auto-deploy-policy-admission` | No | `resources.configure-auto-deploy`, `source-events.ingest` | resource id, blocked reason, source binding fingerprint when safe |
| `resource_auto_deploy_secret_required` | `validation` | `auto-deploy-policy-admission` | No | `resources.configure-auto-deploy` | resource id, trigger kind |
| `resource_auto_deploy_secret_unavailable` | `application` or `infra` | `auto-deploy-policy-admission` or `source-event-verification` | Conditional | `resources.configure-auto-deploy`, `source-events.ingest` | resource id, secret reference id/version when safe |
| `source_event_signature_invalid` | `integration` or `validation` | `source-event-verification` | No | `source-events.ingest` | source kind, event kind, delivery id or idempotency key when safe |
| `source_event_unsupported_kind` | `validation` | `source-event-normalization` | No | `source-events.ingest` | source kind, event kind |
| `source_event_dispatch_failed` | `application` or `infra` | `source-event-dispatch` | Conditional | `source-events.ingest` | source event id, resource id, deployment id when created, underlying safe error code |
| `source_event_scope_required` | `validation` | `source-event-read` | No | `source-events.list`, `source-events.show` | required scope kind |
| `source_event_not_found` | `not-found` | `source-event-read` | No | `source-events.show` | source event id |
| `source_event_read_unavailable` | `infra` | `source-event-read` | Yes | `source-events.list`, `source-events.show` | project id or resource id, storage/read model name when safe |

## Ignored And Blocked Reason Codes

Reason codes may appear in source event read models without being top-level errors:

- `no-matching-policy`
- `ref-not-matched`
- `policy-disabled`
- `policy-blocked`
- `duplicate-delivery`
- `dispatch-failed`

## Consumer Mapping

- Web maps top-level error code plus reason code to i18n keys and links to the source auto-deploy
  help anchors.
- CLI structured output includes `code`, `category`, `phase`, and safe source event ids. Human
  output should suggest `source-event show` for accepted events with failed or ignored outcomes.
- HTTP/oRPC maps `validation` to 400, `not-found` to 404, `conflict` to 409, and retryable infra
  failures to 503 or 504 depending on the adapter boundary.
- Future MCP/tool output must preserve status, reason codes, and created deployment ids without
  relying on localized prose.

## Secret Handling

Error details and source event read models must not include raw webhook payloads, signatures,
webhook secret values, provider tokens, raw authorization headers, private source URLs with
credentials, or unbounded provider error output.

For the first generic signed webhook slice, `genericWebhookSecretRef` resolves only through the
`resource-secret:<KEY>` family. The referenced value must be a Resource-owned runtime secret
variable on the same Resource. Missing, non-secret, build-time, environment-scope, dependency,
certificate, provider-token, or arbitrary secret references return
`resource_auto_deploy_secret_unavailable` without exposing the raw key value or secret value.
