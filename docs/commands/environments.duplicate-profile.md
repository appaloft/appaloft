# environments.duplicate-profile Command Spec

## Status

- Operation key: `environments.duplicate-profile`
- Message: `DuplicateEnvironmentProfileCommand`
- Input schema: `DuplicateEnvironmentProfileCommandInput`
- Handler: `DuplicateEnvironmentProfileCommandHandler`
- Use case: `DuplicateEnvironmentProfileUseCase`
- State: active command, staged apply slice

## Intent

`environments.duplicate-profile` applies reviewed Environment Profile Duplication decisions for a
source environment. The apply flow creates the target environment by reusing `environments.clone`,
recreates selected source resources by dispatching `resources.create`, realizes non-deferred
dependency decisions through public dependency commands, then recreates resource dependency
bindings against the reviewed target dependency ids.

The command is decision-first. It requires explicit dependency decisions before mutation so a
production database, cache, storage backend, or external service is never silently reused or
recreated.

## Input

```ts
type DuplicateEnvironmentProfileCommandInput = {
  environmentId: string;
  targetName: string;
  targetKind?: "local" | "development" | "test" | "staging" | "production" | "preview" | "custom";
  dependencyDecisions: Array<{
    dependencyResourceId: string;
    decision: "create-new-managed" | "bind-existing" | "reuse-source" | "defer";
    targetDependencyResourceId?: string;
    providerKey?: string;
    accessMode?: "read-only" | "read-write";
    acknowledgement?: string;
  }>;
  resourceDecisions?: Array<{
    resourceId: string;
    decision: "copy-shape" | "defer";
  }>;
  dependencyKindsToRequire?: Array<"postgres" | "redis" | "object-storage" | "external-service">;
};
```

Rules:

- `environmentId` must identify an existing source environment.
- `targetName` must be valid for `environments.clone`.
- Every required source dependency resource must have a decision before any mutation happens.
- `bind-existing` requires `targetDependencyResourceId`.
- `reuse-source` requires an explicit acknowledgement.
- Resource decisions default to `copy-shape` when omitted.
- `reuse-source` returns a `environment_profile_shared_source_dependency` warning so UI, tools, and
  audit consumers can keep shared dependency use visible.

## Processing Rules

1. Validate command input.
2. Resolve the source environment and source dependency resources.
3. Reject missing dependency decisions before dispatching child commands.
4. Dispatch `CloneEnvironmentCommand` to create the target environment and copy environment-owned
   variables.
5. Apply non-deferred dependency decisions:
   - `create-new-managed` dispatches `ProvisionDependencyResourceCommand` in the target environment;
   - `bind-existing` validates the target dependency id and uses it as the binding target;
   - `reuse-source` requires acknowledgement and uses the source dependency id as the binding
     target while returning a shared-source warning.
6. Read source resources and load each resource aggregate selected for `copy-shape`.
7. Dispatch `CreateResourceCommand` for each selected source resource with:
   - project id;
   - target environment id;
   - destination id when present;
   - name, kind, description, services;
   - source binding;
   - runtime profile;
   - network profile.
8. Read active source resource dependency bindings and dispatch `BindResourceDependencyCommand`
   against the copied target resource whenever the dependency decision produced a target dependency
   id.
9. Return copied resource summaries, applied dependency summaries, created binding summaries, and
   deferred decisions.

## Deferred Decisions

This command does not implicitly copy:

- dependency secret material;
- production database/cache/storage data;
- custom domains or generated routes;
- resource variables;
- resource access profile;
- storage attachments;
- auto-deploy policy;
- command-based health checks.

These are returned as `deferredDecisions` and must be handled by later provider, admission, route,
storage, or UI phases.

## Default Copy Policy

The neutral `appaloft env copy <source-env> <target-env>` surface maps to the safe duplicate-profile
path:

- services and resource shape: copy and redeploy in the target environment;
- network: create an isolated network boundary for copied resources;
- dependencies: `create-new-managed` for provider-managed Appaloft dependencies;
- secrets: regenerate target secret references and never print or copy raw source values;
- database data: start empty unless an explicit restore policy is supplied;
- domains: create a generated route and do not move production custom domains by default;
- storage data: start with empty volumes unless an explicit restore/import policy is supplied.

Advanced policies must be explicit:

| Console policy | CLI form | Meaning |
| --- | --- | --- |
| Reuse source dependencies | `--reuse-source db --acknowledge-shared-source` | Bind the copied resource to the same source dependency. This can mix data between environments and returns a shared-source warning. |
| Restore database from backup | `--database restore:<backupId>` | Create the target environment with database data restored from a named backup instead of an empty database. |
| Bind a custom domain | `--domain rebind:<hostname>` | Bind the target environment to an explicit hostname instead of a generated route. |
| Restore storage from backup | `--storage restore:<backupId>` | Restore target volume data from a backup. |
| Import storage artifact | `--storage import:<artifactRef>` | Import target volume data from an artifact reference. |

`--dry-run --json` returns the reviewed plan without mutation. `--yes` accepts the safe defaults
without an interactive prompt. Generated secrets are not printed by default; a future reveal surface
must stay one-time and must be rejected in non-interactive JSON output.

## Entrypoints

| Surface | Contract |
| --- | --- |
| CLI | `appaloft env copy <source-env> <target-env> [--dry-run] [--json] [--yes] [--database restore:<backupId>] [--domain rebind:<hostname>] [--storage restore:<backupId>\|import:<artifactRef>] [--reuse-source db --acknowledge-shared-source]`; compatibility alias: `appaloft env duplicate apply <environmentId> --name <targetName> ...` |
| HTTP/oRPC | `POST /api/environments/{environmentId}/duplicate-profile` |
| Web | Console "Copy environment" opens a dialog with safe defaults and advanced policy switches; submit dispatches this command after review. |
| Future MCP/tools | Generated from operation catalog metadata and this command schema. |

## Non-Goals

- Long-running provider-backed dependency provisioning.
- Copying plaintext secrets.
- Copying storage data.
- Copying deployment history, logs, runtime instances, or audit records.
- Making `environments.clone` broad enough to copy resources implicitly.
