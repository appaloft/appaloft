# Repository Config Dependency Graph

## Status

- Round: Code Round
- Artifact state: implemented for canonical managed and imported dependency declarations in
  repository config, CLI/Action config deploy orchestration, and preview cleanup provenance
- Roadmap target: `0.12.x` repository config hardening
- Compatibility impact: `pre-1.0-policy`, additive repository config fields
- Decision state: governed by
  [ADR-066](../../decisions/ADR-066-repository-config-dependency-graph.md)

## Business Outcome

Users can commit an `appaloft.yaml` that says the application needs managed dependencies such as
Postgres, Redis, object storage, or OpenSearch and that the app should receive them as runtime
environment variables. CLI and GitHub Action config deploy create or reuse the dependency resource,
bind it to the Resource, and let existing runtime injection deliver the variable during deployment.

Repository config can also resolve a ready external dependency that was already imported into the
same Project and Environment. This mode binds by stable Appaloft Resource name without committing a
connection URL or asking config deploy to provision external infrastructure.

For PR previews, users can mark the declared dependency ephemeral so preview cleanup removes only
the Appaloft-managed dependency resource that the config workflow created for that preview scope.

## Ubiquitous Language

| Term | Meaning | Context |
| --- | --- | --- |
| RepositoryDependencyGraph | User-facing `appaloft.yaml` dependency declarations keyed by application names such as `db`. | Repository config |
| ManagedDependencyDeclaration | A config entry that asks Appaloft to create or reuse a managed dependency resource. | Config deploy |
| ImportedDependencyDeclaration | A config entry that resolves a ready, already imported external dependency by stable Appaloft Resource name. | Config deploy |
| DependencyBindingTarget | The runtime environment variable requested by the config, for example `DATABASE_URL`. | Resource binding |
| PreviewDependencyProvenance | Safe source-link metadata proving a preview dependency was created and bound by repository config. | Preview cleanup |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| CONFIG-DEPENDENCY-001 | Parse managed dependency declaration | `appaloft.yaml` declares `dependencies.db.kind = postgres`, `source = managed`, and `bind.env = DATABASE_URL` | The config parser runs | The config is accepted, normalized, represented in the JSON schema, and does not accept unknown dependency fields. |
| CONFIG-DEPENDENCY-002 | Reject secrets and identity in dependency declarations | Config includes provider account, tenant, credential, password, database URL, raw connection string, or provider-specific settings under `dependencies` | The config parser runs | Parsing fails before mutation with strict schema, identity, unsupported, or raw-secret validation. |
| CONFIG-DEPENDENCY-003 | Provision and bind from config deploy | No matching dependency resource or binding exists for the selected Resource | CLI/Action config deploy resolves identity | The workflow dispatches `dependency-resources.list`, `dependency-resources.provision`, `resources.list-dependency-bindings`, `resources.bind-dependency`, then `deployments.create` with ids only. |
| CONFIG-DEPENDENCY-004 | Reuse existing resource and binding idempotently | A matching managed dependency resource and active binding already exist | Config deploy runs again | No duplicate provision or bind command is dispatched, and deployment admission still uses ids-only input. |
| CONFIG-DEPENDENCY-005 | Stable conflict on env target | The Resource already has an active binding for `DATABASE_URL` to a different dependency resource | Config deploy handles `dependencies.db.bind.env = DATABASE_URL` | The workflow fails before deployment with a stable conflict code and safe details. |
| CONFIG-DEPENDENCY-006 | Preview provenance is durable | A PR preview dependency has `preview.lifecycle = ephemeral` | Config deploy provisions/binds it for a preview source fingerprint | The source link records safe repository-config provenance with dependency key, target env, resource id, binding id, dependency resource id, and lifecycle. |
| CONFIG-DEPENDENCY-007 | Cleanup removes only provenance-owned ephemeral dependencies | Preview cleanup runs for a source fingerprint with matching provenance | Runtime cleanup has succeeded | Cleanup unbinds the recorded binding, deletes the recorded dependency resource through existing delete safety, removes route/source-link state, and returns safe cleanup counts. |
| CONFIG-DEPENDENCY-008 | Cleanup preserves manual/shared dependencies | Preview cleanup runs when no matching dependency provenance exists or delete safety reports another active/shared blocker | Cleanup reaches dependency stage | No unproven dependency is deleted; delete blockers are surfaced without guessing by resource name. |
| CONFIG-DEPENDENCY-010 | Support canonical dependency kinds | `appaloft.yaml` declares `postgres`, `redis`, `mysql`, `clickhouse`, `object-storage`, or `opensearch` with `source = managed` and an env binding | Parser and config deploy run | The parser accepts the canonical kind, config deploy filters/provisions that kind, records provenance with the same kind, and deployment admission remains ids-only. |
| CONFIG-DEPENDENCY-012 | Parse imported dependency declaration | Config declares `source = imported`, a stable `resourceName`, kind, and env binding | The config parser runs | The declaration is accepted without connection or provider material. Missing name and ephemeral preview lifecycle are rejected. |
| CONFIG-DEPENDENCY-014 | Bind a ready imported dependency | The named imported dependency exists, has ready lifecycle state, and is not binding-blocked in the selected Project and Environment | Config deploy resolves dependencies | The existing dependency is bound without provisioning or importing infrastructure; imported resources whose provider realization readiness is `not-implemented` remain eligible because the binding command admits every non-blocked imported connection. |
| CONFIG-DEPENDENCY-015 | Missing or mismatched imported dependency fails closed | The named dependency is missing, wrong-kind, not ready, or the env target points to a differently named imported dependency | Config deploy resolves dependencies | The workflow fails before provision/bind/deployment with safe project, environment, key, kind, and resource-name details. |

## Config Contract

Repository config fields:

```yaml
dependencies:
  db:
    kind: postgres
    source: managed
    bind:
      env: DATABASE_URL
  cache:
    kind: redis
    source: managed
    bind:
      env: REDIS_URL
    preview:
      lifecycle: ephemeral
  externalDb:
    resourceName: StockTruth Supabase
    kind: postgres
    source: imported
    bind:
      env: EXTERNAL_DATABASE_URL
```

Rules:

- dependency keys must be stable repository-local names, not Appaloft ids;
- `kind` supports the Appaloft canonical managed dependency kinds: `postgres`, `redis`, `mysql`,
  `clickhouse`, `object-storage`, and `opensearch`;
- `source` supports `managed` and `imported`;
- `source: imported` requires `resourceName`, resolves only a lifecycle-ready,
  non-binding-blocked `imported-external` dependency of the declared kind in the selected Project
  and Environment, and never provisions/imports it; `bindingReadiness = not-implemented` is eligible
  for imported connections because only explicit `blocked` readiness prevents binding;
- `bind.env` must be a safe environment variable name;
- `preview.lifecycle` supports `ephemeral` only for managed dependencies;
- omission of `preview.lifecycle` means normal dependency lifecycle; cleanup must not delete it;
- repository config must not declare provider account, credential, tenant, org, raw connection URL,
  password, database password, or secret value.

## Workflow Contract

Config dependency deploy must run before deployment admission and after Resource identity is known:

```text
resolve project/environment/resource/server identity
  -> list dependency resources for project/environment/kind
  -> list active resource dependency bindings
  -> provision missing managed dependency resource OR fail if a named imported dependency is absent
  -> bind missing dependency to the Resource env target
  -> persist preview provenance when lifecycle is ephemeral
  -> deployments.create(ids only)
```

The workflow must use command/query buses only. It must not call dependency repositories or
application services from the CLI/HTTP adapter.

Idempotency is based on current read models and source-link provenance, not on resource-name
guessing alone. Existing active binding conflict for the same target env wins over provisioning.

## Preview Cleanup Contract

`deployments.cleanup-preview` reads preview source-link provenance and may clean only entries that:

- use schema `source-link.dependency-provenance/v1`;
- have `source = repository-config`;
- have the same preview source fingerprint as the cleanup input;
- are `managed` and `ephemeral`;
- match the linked preview `resourceId`;
- include explicit `bindingId` and `dependencyResourceId`.

Cleanup order:

1. Runtime cleanup and stale preview runtime sweep.
2. Unbind provenance-marked ephemeral dependency bindings.
3. Delete provenance-marked ephemeral dependency resources through `dependency-resources.delete`.
4. Remove server-applied route desired state.
5. Delete the source link.

If dependency delete is blocked by another binding, backup, snapshot, or provider safety state, the
command fails before source-link deletion so a retry can resume with provenance intact.

## Non-Goals

- No dependency fields on `deployments.create`.
- No raw connection string, database password, provider credential, tenant, organization, or
  provider account in repository config.
- No external connection/import operation driven by repository config.
- No build-time dependency injection.
- No provider-specific database sizing or backup policy fields in `dependencies`.
- No deletion of manual, shared, imported, or unproven dependency resources during preview cleanup.

## Current Implementation Notes And Migration Gaps

This slice is a repository config workflow/profile extension over existing dependency operations.
No new operation-catalog key is introduced. `CORE_OPERATIONS.md` documents the workflow boundary,
while the executable operation catalog remains unchanged because all mutations and reads dispatch
through existing commands and queries.
