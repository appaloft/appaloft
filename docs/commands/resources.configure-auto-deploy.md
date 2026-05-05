# resources.configure-auto-deploy Command Spec

## Status

Accepted candidate. Do not expose this command until source event ingestion, source event read
models, error contracts, public docs/help, `CORE_OPERATIONS.md`, `operation-catalog.ts`, CLI,
HTTP/oRPC, Web, and tests are aligned in Code Round.

## Governing Sources

- [ADR-037: Source Event Auto Deploy Ownership](../decisions/ADR-037-source-event-auto-deploy-ownership.md)
- [Source Binding And Auto Deploy](../specs/042-source-binding-auto-deploy/spec.md)
- [Source Binding Auto Deploy Test Matrix](../testing/source-binding-auto-deploy-test-matrix.md)
- [Source Event Auto Deploy Error Spec](../errors/source-events.md)
- [resources.configure-source Command Spec](./resources.configure-source.md)
- [source-events.ingest Command Spec](./source-events.ingest.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Intent

`resources.configure-auto-deploy` enables, disables, replaces, or acknowledges one Resource-owned
auto-deploy policy for the Resource's current source binding.

It does not change source binding, create a deployment, run source detection, store webhook secret
values, or add source event fields to `deployments.create`.

## Input

```ts
type ConfigureResourceAutoDeployInput = {
  resourceId: string;
  mode: "enable" | "disable" | "replace" | "acknowledge-source-binding";
  sourceBindingFingerprint?: string;
  policy?: {
    triggerKind: "git-push" | "generic-signed-webhook";
    refs: readonly string[];
    eventKinds: readonly ("push" | "tag")[];
    genericWebhookSecretRef?: string;
    dedupeWindowSeconds?: number;
  };
  idempotencyKey?: string;
};
```

Rules:

- `resourceId` identifies the Resource that owns the policy.
- `mode = "enable"` requires `policy`.
- `mode = "replace"` requires `policy` and replaces the existing policy atomically.
- `mode = "disable"` clears or disables the existing policy without changing source binding.
- `mode = "acknowledge-source-binding"` requires `sourceBindingFingerprint` for the current source
  binding and unblocks the existing policy only when it still matches the current source kind.
- `genericWebhookSecretRef` is required when `triggerKind = "generic-signed-webhook"` and must be a
  safe reference/version handle, never a secret value.

## Admission

The command must:

1. Validate input and normalize refs/event kinds.
2. Load the Resource aggregate.
3. Reject missing, archived, or deleted Resources.
4. Reject enable/replace when the Resource has no compatible source binding.
5. Reject generic signed webhook policy without a safe Resource-scoped secret reference.
6. Bind the policy to the current source binding fingerprint.
7. Persist policy state on the Resource-owned configuration boundary.
8. Return safe policy status and blocked reason, if any.

When `resources.configure-source` changes the Resource source binding after policy creation, the
policy becomes blocked pending explicit acknowledgement by this command.

## Result

```ts
type ConfigureResourceAutoDeployResult = {
  resourceId: string;
  status: "enabled" | "disabled" | "blocked";
  triggerKind?: "git-push" | "generic-signed-webhook";
  refs?: readonly string[];
  eventKinds?: readonly ("push" | "tag")[];
  sourceBindingFingerprint?: string;
  blockedReason?: "source-binding-changed";
};
```

Command success means only the policy state was durably stored. Source events and deployment
attempts are observed through `source-events.*` and normal deployment queries.

## Error Contract

Use [Source Event Auto Deploy Error Spec](../errors/source-events.md). Minimum codes:

- `resource_auto_deploy_source_missing`
- `resource_auto_deploy_policy_blocked`
- `resource_auto_deploy_secret_required`
- `resource_auto_deploy_secret_unavailable`
- `validation_error`

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Resource source/profile settings auto-deploy panel. | Future Code Round |
| CLI | `appaloft resource auto-deploy configure <resourceId> ...`. | Future Code Round |
| oRPC / HTTP | `POST /api/resources/{resourceId}/auto-deploy` using this command schema. | Future Code Round |
| Automation / MCP | Future tool over the same operation key. | Future |

## Tests

Stable matrix coverage:

- `SRC-AUTO-POLICY-001`
- `SRC-AUTO-POLICY-002`
- `SRC-AUTO-POLICY-003`
- `SRC-AUTO-EVENT-004`
