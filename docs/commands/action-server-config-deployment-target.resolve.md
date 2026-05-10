# action-server-config-deployment-target.resolve Internal Command Spec

## Normative Contract

`ResolveActionServerConfigDeploymentTargetCommand` is an internal command used by server-side Action
config bootstrap to resolve the target selected by a source fingerprint.

It is not a public operation-catalog entry. Public entry workflow behavior is governed by Action
server config deploy, and final deployment admission remains `deployments.create`.

Command success returns the source-link target record:

```ts
{
  sourceFingerprint: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId?: string;
  destinationId?: string;
  updatedAt: string;
  reason?: string;
}
```

## Purpose

Server-side config bootstrap needs a stable project/environment/resource/server target before it can
apply resource profile, environment, secret, route, and deployment commands. That source-link policy
belongs in application code, not oRPC route code.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `sourceFingerprint` | Required | Stable Action-derived source identity. |
| `trustedContext.projectId` | Optional bootstrap context | Trusted project id from Action config. |
| `trustedContext.environmentId` | Optional bootstrap context | Trusted environment id from Action config. |
| `trustedContext.resourceId` | Optional bootstrap context | Trusted resource id from Action config. |
| `trustedContext.serverId` | Optional bootstrap context | Trusted server id from Action config. |
| `trustedContext.destinationId` | Optional bootstrap context | Trusted destination id from Action config. |

If any trusted context field is supplied, `projectId`, `environmentId`, `resourceId`, and `serverId`
must all be present.

## Resolution Flow

1. Validate completeness of trusted context when present.
2. Read existing source-link state for `sourceFingerprint`.
3. If an existing link conflicts with trusted context, reject before config mutation.
4. If a link exists, return it.
5. If no link exists and no complete trusted context exists, reject with not found.
6. Persist and return a new source-link record from the trusted context.

## Boundary Rules

- oRPC may parse request JSON and dispatch this command; it must not call `SourceLinkRepository`.
- Config bootstrap must continue applying durable changes through explicit resource/environment/route
  commands before `deployments.create`.
- This command only resolves identity; it does not mutate resource profiles, domains, routes, or
  deployment state.

## References

- [Action Server Config Deploy](../workflows/action-server-config-deploy.md)
- [Action Server Config Deploy Spec](../specs/050-action-server-config-deploy/spec.md)
- [Control-Plane Modes Test Matrix](../testing/control-plane-modes-test-matrix.md)
- [Adapter Command/Query Boundary](../architecture/adapter-command-query-boundary.md)
