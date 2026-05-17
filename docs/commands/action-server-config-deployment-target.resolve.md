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
| `trustedContext.projectId` | Optional advanced bootstrap context | Trusted project id from Action input or `controlPlane.deploymentContext`. |
| `trustedContext.environmentId` | Optional advanced bootstrap context | Trusted environment id from Action input or `controlPlane.deploymentContext`. |
| `trustedContext.resourceId` | Optional advanced bootstrap context | Trusted resource id from Action input or `controlPlane.deploymentContext`. |
| `trustedContext.serverId` | Optional advanced bootstrap context | Trusted deployment target id from Action input or `controlPlane.deploymentContext`. |
| `trustedContext.destinationId` | Optional advanced bootstrap context | Trusted destination id from Action input or `controlPlane.deploymentContext`. |
| `trustedContext.repositoryFullName` | Optional trusted repository fact | GitHub repository full name used for source-package and scope conflict checks. |
| `trustedContext.repositoryId` | Optional trusted repository fact | GitHub provider repository id. |
| `trustedContext.ref` | Optional trusted repository fact | Git ref that participated in source fingerprint construction. |
| `trustedContext.revision` | Optional trusted repository fact | Git revision that participated in source-package context. |
| `authorizedTokenScope` | Optional authorized scope fact | Safe deploy-token scope returned by the Action auth boundary. |

If any explicit deployment identity field is supplied, `projectId`, `environmentId`, `resourceId`,
and `serverId` must all be present. Repository/ref/revision facts may be supplied without ids.

## Resolution Flow

1. Validate completeness of explicit trusted deployment context when present.
2. Read existing source-link state for `sourceFingerprint`.
3. Conflict-check explicit ids, existing source-link targets, and trusted repository facts against
   deploy-token scope before config/profile/route/deployment mutation.
4. If an existing link conflicts with explicit context, reject before config mutation.
5. If a link exists, return it.
6. If no link exists and complete explicit trusted context exists, persist and return a new
   source-link record from the trusted context.
7. If no link exists and deploy-token scope uniquely identifies project/environment/resource/server,
   persist and return a new source-link record from token scope.
8. If no target can be resolved, reject with `action_deployment_target_unresolved`, phase
   `source-link-resolution`, and safe next actions.

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
