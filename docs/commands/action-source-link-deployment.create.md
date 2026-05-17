# action-source-link-deployment.create Internal Command Spec

## Normative Contract

`CreateActionSourceLinkDeploymentCommand` is an internal command used by the GitHub Action
self-hosted source-link deployment route:

```txt
POST /api/action/deployments/from-source-link
```

It is not a public operation-catalog entry. The public deployment admission operation remains
`deployments.create`.

Command success means the server resolved or bootstrapped a source fingerprint link, dispatched
ids-only `deployments.create`, and returned the accepted deployment id.

## Purpose

The command keeps source-link lookup and bootstrap policy inside the application layer. The oRPC
route may parse the Action request and dispatch this command, but it must not call
`SourceLinkRepository` directly.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `sourceFingerprint` | Required | Stable Action-derived source identity. |
| `projectId` / `trustedContext.projectId` | Optional advanced bootstrap context | Trusted project id from Action input or `controlPlane.deploymentContext`. |
| `environmentId` / `trustedContext.environmentId` | Optional advanced bootstrap context | Trusted environment id from Action input or `controlPlane.deploymentContext`. |
| `resourceId` / `trustedContext.resourceId` | Optional advanced bootstrap context | Trusted resource id from Action input or `controlPlane.deploymentContext`. |
| `serverId` / `trustedContext.serverId` | Optional advanced bootstrap context | Trusted deployment target id from Action input or `controlPlane.deploymentContext`. |
| `destinationId` / `trustedContext.destinationId` | Optional advanced bootstrap context | Trusted destination id from Action input or `controlPlane.deploymentContext`. |
| `trustedContext.repositoryFullName` | Optional trusted repository fact | GitHub repository full name used for scope conflict checks. |
| `trustedContext.repositoryId` | Optional trusted repository fact | GitHub provider repository id. |
| `trustedContext.ref` | Optional trusted repository fact | Git ref that participated in source fingerprint construction. |
| `trustedContext.revision` | Optional trusted repository fact | Git revision that participated in source package/source fingerprint context. |
| `authorizedTokenScope` | Optional authorized scope fact | Safe deploy-token scope returned by the Action auth boundary. |

If any explicit deployment identity field is present, `projectId`, `environmentId`, `resourceId`,
and `serverId` must all be present. `destinationId` remains optional. Ordinary Action deploys
should not need these ids when an existing source-link or unique deploy-token scope resolves the
target.

## Admission Flow

1. Read existing source-link state for `sourceFingerprint`.
2. If explicit ids were supplied, validate completeness and conflict-check them against deploy-token
   scope and trusted repository facts.
3. If a link exists, conflict-check it against deploy-token scope and any explicit ids, then use the
   link as the target.
4. If no link exists and complete explicit trusted context exists, use that target.
5. If no link exists and deploy-token scope uniquely identifies project/environment/resource/server,
   use that token-scoped target.
6. If no target can be resolved, reject with `action_deployment_target_unresolved`, phase
   `source-link-resolution`, and safe next actions before deployment mutation.
7. Dispatch `deployments.create` through `CreateDeploymentUseCase` with ids only.
8. If the link was missing and a trusted or token-scoped target was used, persist the new
   source-link record after deployment admission succeeds.

## Boundary Rules

- Transport routes must dispatch this command instead of reading or upserting source links.
- The command delegates deployment admission to `deployments.create`; it must not assemble runtime
  plans or mutate resource profile state.
- This command may be used by self-hosted Action deploy and preview deploy trigger mode, including
  preview-scoped source fingerprints.

## References

- [Control-Plane Mode Selection And Adoption](../workflows/control-plane-mode-selection-and-adoption.md)
- [Control-Plane Modes Test Matrix](../testing/control-plane-modes-test-matrix.md)
- [Adapter Command/Query Boundary](../architecture/adapter-command-query-boundary.md)
