# resource-created Event Spec

## Normative Contract

`resource-created` means a `Resource` aggregate has been persisted and can be referenced by later commands.

It does not mean the resource has been deployed, source binding has been verified or materialized,
routing is ready, variables are set, or the resource is healthy.

## Global References

This event inherits:

- [ADR-011: Resource Create Minimum Lifecycle](../decisions/ADR-011-resource-create-minimum-lifecycle.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Event Type

Domain event emitted by the `Resource` aggregate and publishable as an application event for projections, audit, and workflow observers.

## Trigger

Publish or record after `resources.create` persists the `Resource` aggregate.

## Publisher

Publisher: `resources.create` use case after durable persistence, using domain events recorded by the `Resource` aggregate.

## Consumers

Expected consumers:

- resource read-model projection;
- audit/notification consumers;
- Quick Deploy workflow observers;
- future resource detail/status projections;
- future automation/MCP observers.

Consumers must not assume that a deployment should start automatically from this event.

## Payload

```ts
type ResourceCreatedPayload = {
  resourceId: string;
  projectId: string;
  environmentId: string;
  destinationId?: string;
  name: string;
  slug: string;
  kind: "application" | "service" | "database" | "cache" | "compose-stack" | "worker" | "static-site" | "external";
  services: Array<{
    name: string;
    kind: "web" | "api" | "worker" | "database" | "cache" | "service";
  }>;
  sourceBinding?: {
    kind: string;
    locator: string;
    displayName: string;
    metadata?: {
      gitRef?: string;
      commitSha?: string;
      baseDirectory?: string;
      originalLocator?: string;
      repositoryId?: string;
      repositoryFullName?: string;
      defaultBranch?: string;
      imageName?: string;
      imageTag?: string;
      imageDigest?: string;
      dockerfilePath?: string;
      dockerComposeFilePath?: string;
      [key: string]: string | undefined;
    };
  };
  runtimeProfile?: {
    strategy: "auto" | "dockerfile" | "docker-compose" | "prebuilt-image" | "workspace-commands";
    installCommand?: string;
    buildCommand?: string;
    startCommand?: string;
    healthCheckPath?: string;
    dockerfilePath?: string;
    dockerComposeFilePath?: string;
    publishDirectory?: string;
  };
  networkProfile?: {
    internalPort: number;
    upstreamProtocol: "http" | "tcp";
    exposureMode: "none" | "reverse-proxy" | "direct-port";
    targetServiceName?: string;
    hostPort?: number;
  };
  createdAt: string;
  correlationId?: string;
  causationId?: string;
};
```

Payload must not contain source credentials, environment secret values, provider credentials, or raw deployment logs.

When a resource is created with first-deploy source/runtime profile input, the event payload may
include non-secret source variant and runtime profile metadata for projections and audit. It must
not include provider access tokens, deploy key material, private registry credentials, or local file
contents.

When a resource has a network profile, the event payload may include the safe network endpoint metadata needed by read-model and audit consumers. It must not include public domain/TLS state, because that lifecycle is owned by domain binding and certificate commands.

## State Progression

```text
no Resource
  -> Resource persisted
  -> resource-created
```

The event corresponds to resource profile creation only.

## Follow-Up Actions

Consumers may:

- update resource read models;
- update audit history;
- unblock entry workflows waiting for a `resourceId`;
- notify observers that a resource was created.

Consumers must not automatically dispatch `deployments.create` unless a separate workflow command/process explicitly owns that behavior.

## Idempotency

Consumers must dedupe by event id when available, otherwise by `(resourceId, "resource-created")`.

Duplicate consumption must not create duplicate resource summaries or start duplicate deployments.

## Ordering

`resource-created` must occur after the resource is durably persisted and before dependent workflow steps rely on the resource id.

There is no required ordering with deployment events unless a specific workflow creates a resource and then dispatches `deployments.create`.

## Retry And Failure Handling

Consumer failure is event-processing failure, not resource creation failure.

If event publication cannot be safely recorded before returning command success, `resources.create` must return `err(DomainError)` with `code = infra_error` and `phase = event-publication`.

If a projection consumer fails after the event is recorded, the resource remains created and projection retry belongs to the consumer/process infrastructure.

## Current Implementation Notes And Migration Gaps

Current `Resource.create` records `resource-created` as the canonical source-of-truth event name.

Current deployment bootstrap publishes the aggregate event when it creates a resource during deployment context resolution.

`resources.create` publishes this event from the explicit resource lifecycle operation after durable resource persistence.

Current code includes source/runtime/network profile payload when present. Source variant fields are
created from typed source value objects, while the event payload still projects those fields under
safe `sourceBinding.metadata` for read-model and audit consumers.

## Open Questions

- None for the minimum lifecycle.
