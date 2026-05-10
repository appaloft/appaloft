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
| `projectId` | Optional bootstrap context | Trusted project id from Action config. |
| `environmentId` | Optional bootstrap context | Trusted environment id from Action config. |
| `resourceId` | Optional bootstrap context | Trusted resource id from Action config. |
| `serverId` | Optional bootstrap context | Trusted server id from Action config. |
| `destinationId` | Optional bootstrap context | Trusted destination id from Action config. |

If any bootstrap context field is present, `projectId`, `environmentId`, `resourceId`, and
`serverId` must all be present. `destinationId` remains optional.

## Admission Flow

1. Read existing source-link state for `sourceFingerprint`.
2. If no link exists and no complete trusted context was supplied, reject with not found.
3. If a link exists and trusted context conflicts with it, reject before deployment admission.
4. Resolve deployment target from the link or trusted bootstrap context.
5. Dispatch `deployments.create` through `CreateDeploymentUseCase` with ids only.
6. If the link was missing and trusted context was used, persist the new source-link record after
   deployment admission succeeds.

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
