# resources.configure-access Command Spec

## Normative Contract

`resources.configure-access` is the source-of-truth command for changing the durable access profile
owned by one resource.

Command success means the new `ResourceAccessProfile` was durably stored on the resource. It does
not create a deployment, restart runtime, bind domains, issue certificates, change default access
provider policy, apply proxy routes, or prove public reachability.

```ts
type ConfigureResourceAccessResult = Result<{ id: string }, DomainError>;
```

The command contract is:

- admission failure returns `err(DomainError)`;
- accepted success returns `ok({ id })`;
- accepted success persists the `Resource` aggregate with updated access profile;
- accepted success publishes or records `resource-access-configured`;
- future `deployments.create` attempts and planned access previews use the new access profile;
- historical deployment snapshots remain unchanged.

## Global References

This command inherits:

- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [resources.show Query Spec](../queries/resources.show.md)
- [resource-access-configured Event Spec](../events/resource-access-configured.md)
- [Resource Profile Lifecycle Workflow](../workflows/resource-profile-lifecycle.md)
- [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Purpose

Replace reusable generated access preferences for an existing deployable resource.

It is not:

- a generic resource update command;
- a network profile command;
- a custom domain binding or certificate command;
- a default access domain policy command;
- a proxy repair/apply command;
- a deployment, redeploy, restart, rollback, or scale command.

## Input Model

```ts
type ConfigureResourceAccessCommandInput = {
  resourceId: string;
  accessProfile: {
    generatedAccessMode: "inherit" | "disabled";
    pathPrefix?: string;
  };
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `resourceId` | Required | Resource whose access profile is being changed. |
| `accessProfile.generatedAccessMode` | Required | `inherit` lets default access policy decide future generated route behavior. `disabled` suppresses generated default access for this resource. |
| `accessProfile.pathPrefix` | Optional | Path prefix used for generated default access routes. Defaults to `/`. Must start with `/`. |

## Admission Flow

The command must:

1. Validate command input.
2. Resolve `resourceId`.
3. Reject missing or invisible resource with `not_found`.
4. Reject archived resources with `resource_archived`.
5. Normalize and validate access profile value objects.
6. Preserve source binding, runtime profile, network profile, health policy, variables,
   deployments, domains, default access policy records, and lifecycle state.
7. Persist the updated `Resource` aggregate.
8. Publish or record `resource-access-configured`.
9. Return `ok({ id })`.

## Resource-Specific Rules

`generatedAccessMode = "disabled"` suppresses generated default access route resolution for future
deployments and planned access previews for this resource only. It must not disable durable custom
domain bindings, server-applied config domains, resource health checks, proxy configuration preview,
or the system/server default access policy records.

`generatedAccessMode = "inherit"` means the resource is eligible for generated default access when
the resource network profile, selected deployment target, edge proxy state, and default access
policy/provider allow it.

`pathPrefix` applies only to generated default access routes. Durable domain bindings and
server-applied config domains use their own route state.

Changing access profile affects only future route resolution. It does not mutate current runtime
instances, historical deployment snapshots, proxy config, generated hostnames already stored on
deployments, domain bindings, or certificates.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Resource detail access settings dispatch this command and refetch `resources.show`. | Active |
| CLI | `appaloft resource configure-access <resourceId> ...`. | Active |
| oRPC / HTTP | `POST /api/resources/{resourceId}/access-profile` using the command schema. | Active |
| Automation / MCP | Future command/tool over the same operation key. | Future |

## Events

Canonical event spec:

- [resource-access-configured](../events/resource-access-configured.md): resource access profile
  persisted for future generated access route resolution.

## Current Implementation Notes And Migration Gaps

This slice introduces the first public resource access profile command. Existing resources without
an access profile inherit generated access behavior and use `/` as the generated route path prefix.

## Open Questions

- None for this command slice.
