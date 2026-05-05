# resource-dependency-binding-secret-rotated Event Spec

## Normative Contract

`resource-dependency-binding-secret-rotated` records that
`resources.rotate-dependency-binding-secret` durably replaced the safe secret reference/version for
one active Resource dependency binding.

The event is a binding lifecycle fact. It is not proof that:

- provider-native database credentials were rotated;
- a runtime process received new environment variables;
- any deployment was restarted, retried, redeployed, or rolled back;
- historical deployment snapshots were rewritten.

## Payload

```ts
type ResourceDependencyBindingSecretRotatedEventPayload = {
  projectId: string;
  environmentId: string;
  resourceId: string;
  dependencyResourceId: string;
  bindingId: string;
  targetName: string;
  secretVersion: string;
  rotatedAt: string;
  previousSecretVersion?: string;
  correlationId?: string;
  causationId?: string;
};
```

Payloads must not include raw secret values, raw connection URLs, passwords, tokens, auth headers,
cookies, SSH credentials, provider tokens, private keys, sensitive query parameters, previous
plaintext secret material, materialized environment values, deployment logs, or provider
credentials.

## Publication Boundary

- Producer: `RotateResourceDependencyBindingSecretUseCase` after the ResourceBinding rotation is
  durably persisted.
- Consumers: read-model/audit projectors only in this slice.
- Ordering: ordered after the accepted rotation command for the same ResourceBinding.
- Idempotency: consumers dedupe by event id and binding id plus `secretVersion`.
- Replay/backfill: replay updates safe rotation metadata only and must not call secret stores,
  providers, runtime adapters, or deployment commands.

## Failure Visibility

Publication failure after persistence follows the current event-bus migration gap in
[Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md). It must not
reinterpret the accepted command as a provider/runtime credential rotation failure.
