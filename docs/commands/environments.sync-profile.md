# environments.sync-profile Command Spec

## Contract

- Operation key: `environments.sync-profile`
- Message: `SyncEnvironmentProfileCommand`
- Input schema: `SyncEnvironmentProfileCommandInput`
- CLI: `appaloft env sync-profile <environmentId> <targetEnvironmentId> --resource-ids <ids>`
- HTTP/oRPC: `POST /api/environments/{environmentId}/sync-profile/{targetEnvironmentId}`

## Behavior

`environments.sync-profile` applies selected Environment Profile shape from a source environment
into an existing target environment. The first active slice supports selected resource-shape sync:
operators pass one or more source resource ids, and Appaloft creates only missing target resources
whose slug is not already present in the target environment.

The command must not overwrite target-only resources, variables, dependency bindings, route choices,
storage choices, secret references, provider credentials, or deployment history. When copied source
shape references dependency bindings, custom domains, storage data, resource variables, access
profiles, auto-deploy policy, or unsupported health-check shape, the command records deferred
Environment Profile decisions for the target resource instead of copying environment-specific
values.

## Result

The command returns `EnvironmentProfileSyncResult`:

- `syncedResources`: selected source resources created in the target environment;
- `skippedResources`: selected resources skipped because a target resource with the same slug
  already exists;
- `deferredDecisions`: follow-up decisions that must be resolved before the copied shape can safely
  deploy;
- `warnings`: user-visible warnings when follow-up decisions remain.

Secret-bearing values must not appear in the result.
