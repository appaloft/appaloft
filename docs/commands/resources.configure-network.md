# resources.configure-network Command Spec

## Normative Contract

`resources.configure-network` is the source-of-truth command for changing the durable network
endpoint profile owned by one resource.

Command success means the new `ResourceNetworkProfile` was durably stored on the resource. It does
not create a deployment, restart runtime, bind domains, issue certificates, apply proxy routes,
edit default access policy, or prove public reachability.

```ts
type ConfigureResourceNetworkResult = Result<{ id: string }, DomainError>;
```

The command contract is:

- admission failure returns `err(DomainError)`;
- accepted success returns `ok({ id })`;
- accepted success persists the `Resource` aggregate with updated network profile;
- accepted success publishes or records `resource-network-configured`;
- future `deployments.create` attempts and route planning use the new network profile;
- historical deployment snapshots remain unchanged.

## Global References

This command inherits:

- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [resources.create Command Spec](./resources.create.md)
- [resources.show Query Spec](../queries/resources.show.md)
- [resource-network-configured Event Spec](../events/resource-network-configured.md)
- [Resource Profile Lifecycle Workflow](../workflows/resource-profile-lifecycle.md)
- [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Purpose

Replace reusable workload endpoint defaults for an existing deployable resource.

It is not:

- a generic resource update command;
- a runtime profile command;
- a domain binding or certificate command;
- a default access domain policy command;
- a proxy repair/apply command;
- a deployment, redeploy, restart, rollback, or scale command.

## Input Model

```ts
type ConfigureResourceNetworkCommandInput = {
  resourceId: string;
  networkProfile: {
    internalPort?: number;
    upstreamProtocol?: "http" | "tcp";
    exposureMode?: "none" | "reverse-proxy" | "direct-port";
    targetServiceName?: string;
    hostPort?: number;
  };
  idempotencyKey?: string;
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `resourceId` | Required | Resource whose network profile is being changed. |
| `networkProfile.internalPort` | Conditionally required | Workload listener port inside the runtime/container network. |
| `networkProfile.upstreamProtocol` | Optional | Defaults to `http` for HTTP inbound resources. |
| `networkProfile.exposureMode` | Optional | Defaults to `reverse-proxy` for HTTP inbound resources and `none` for workers/internal resources. |
| `networkProfile.targetServiceName` | Conditional | Required for compose stacks when more than one service could receive inbound traffic. |
| `networkProfile.hostPort` | Conditional | Valid only for explicitly accepted `direct-port` exposure. |
| `idempotencyKey` | Optional | Deduplicates retries for the same intended network profile change. |

## Admission Flow

The command must:

1. Validate command input.
2. Resolve `resourceId`.
3. Reject missing or invisible resource with `not_found`.
4. Reject archived resources with `resource_archived`.
5. Normalize and validate network profile value objects.
6. Reject direct host-port exposure unless the implementation includes placement conflict guards,
   runtime adapter support, and transport tests for that exposure mode.
7. Preserve source binding, runtime profile, health policy, deployments, domains, access summary,
   and lifecycle state.
8. Persist the updated `Resource` aggregate.
9. Publish or record `resource-network-configured`.
10. Return `ok({ id })`.

## Resource-Specific Rules

`internalPort` is not `hostPort`. Reverse-proxy exposure uses `internalPort` as the destination-local
upstream target and must not require a stable public host port.

Multiple reverse-proxy resources on the same server may use the same `internalPort`. Runtime
replacement and cleanup must remain scoped by resource/workload identity, not by shared port.

`direct-port` is the explicit future host-publication path. It must not become the default Web/CLI
path, and it must not remove another resource's runtime instance to free a host port.

Changing network profile affects only future deployment admission and route planning. It does not
mutate current runtime instances, deployment snapshots, proxy config, generated access hostnames,
domain bindings, or certificates.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Resource detail network settings dispatch this command and refetch `resources.show`. | Active |
| CLI | `appaloft resource configure-network <resourceId> ...`. | Active |
| oRPC / HTTP | `POST /api/resources/{resourceId}/network-profile` using the command schema. | Active |
| Automation / MCP | Future command/tool over the same operation key. | Future |

## Events

Canonical event spec:

- [resource-network-configured](../events/resource-network-configured.md): network endpoint profile
  persisted for future deployment admission and route planning.

## Current Implementation Notes And Migration Gaps

Current network profile persistence exists through `resources.create` and
`resources.configure-network`. The dedicated network mutation is active in application command
handling, operation catalog, CLI, HTTP/oRPC routes, and the Web resource detail profile form for
reverse-proxy network profiles.

The Web form observes resources through the dedicated `resources.show` detail query and refetches
that query after network profile changes. This preserves the command boundary: the form dispatches
`resources.configure-network` and observes state through `resources.show`.

Direct-port configuration remains blocked unless the Code Round also implements the explicit guard
and runtime behavior required by ADR-015.

## Open Questions

- None for the resource network profile command name. Public access policy, generated domains,
  custom domains, and TLS remain separate operations.
