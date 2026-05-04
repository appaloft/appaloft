# Postgres Dependency Resource Lifecycle

## Status

- Round: Spec Round
- Artifact state: ready for Test-First / Code Round
- Roadmap target: Phase 7 / `0.9.0` beta, Day-Two Production Controls
- Compatibility impact: `pre-1.0-policy`, additive public CLI/API/oRPC capability
- Decision state: no-ADR-needed

## Business Outcome

Operators can create or import a Postgres dependency resource in Appaloft, inspect safe ownership
and connection metadata, rename it, and delete only records that pass explicit safety checks.

Users should not SSH to a server to hand-create Postgres, hand-write connection strings, or edit
resource `.env` files for ordinary database dependency setup. This first slice establishes the
provider-neutral lifecycle baseline that later dependency bind/unbind, Redis, secret rotation,
backup/restore, deployment snapshot binding, provider-native provisioning, and runtime cleanup can
reuse.

## Discover Findings

1. Existing dependency language is `ResourceInstance` for a provisioned or imported dependency
   resource and `ResourceBinding` for the future workload-to-dependency contract. Both are
   foundational core concepts but not yet public operations or persisted read models.
2. This slice treats Postgres dependency resources as a write-side `ResourceInstance` aggregate plus
   safe read models, not as provider action orchestration. `dependency-resources.provision-postgres`
   records Appaloft-managed intent and provider-neutral metadata only; it does not create a
   provider-native database.
3. Imported external Postgres and Appaloft-managed Postgres share project/environment ownership,
   name/slug, kind, provider key, lifecycle status, connection exposure policy, masked endpoint
   metadata, future binding readiness, and backup relationship metadata.
4. Raw connection secrets are command input boundary material only. List/show/read models, events,
   errors, logs, diagnostics, and operation catalog metadata must never include raw password, token,
   auth header, cookie, SSH credential, provider token, private key, or sensitive query material.
5. Delete safety fails closed when any active/future binding blocker, backup relationship blocker,
   provider-managed unsafe state, or deployment snapshot/reference blocker exists. Imported external
   delete removes only the Appaloft control-plane record and never deletes the external database.
6. No ADR is needed because this slice reuses ADR-012/014 deployment snapshot boundaries, ADR-025
   provider/control-plane separation, ADR-026 intention-revealing command naming, and ADR-028
   command coordination policy. It does not change deployment admission, deployment snapshot
   immutability, provider contracts, runtime ownership, or binding admission.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| DependencyResource | Public operation/read-model name for dependency resource instances. | Dependency Resources | resource instance |
| ResourceInstance | Core aggregate for a dependency resource such as Postgres or Redis. | Dependency Resources | dependency resource |
| PostgresDependencyResource | A dependency resource with kind `postgres`. | Dependency Resources | Postgres resource, database resource |
| AppaloftManagedPostgres | Appaloft-owned control-plane record for a future provider-managed Postgres instance. | Dependency Resources | managed Postgres |
| ImportedExternalPostgres | External Postgres registered in Appaloft for future binding. | Dependency Resources | imported database |
| ConnectionExposurePolicy | Safe metadata describing how connection details may be exposed later. | Dependency Resources | exposure policy |
| MaskedConnection | Read-model endpoint/connection summary with secret-bearing parts redacted. | Dependency Resources | masked endpoint |
| BindingReadinessSummary | Safe statement of whether future bind/unbind work can use the dependency resource. | Dependency Resources | binding readiness |
| BackupRelationshipMetadata | Safe metadata that blocks deletion when future backup/restore relationships need retention. | Dependency Resources | backup relationship |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| DEP-RES-PG-PROVISION-001 | Provision managed Postgres record | Active project/environment context | `dependency-resources.provision-postgres` with valid name | A Postgres `ResourceInstance` is persisted, marked Appaloft-managed, emits creation event, and does not call a provider-native database API. |
| DEP-RES-PG-IMPORT-001 | Import external Postgres | Active project/environment context | `dependency-resources.import-postgres` with endpoint and secret reference or connection secret input | A Postgres `ResourceInstance` is persisted as imported-external; read models mask all secret-bearing connection data. |
| DEP-RES-PG-VALIDATION-001 | Reject invalid input | Active context | Name/slug/endpoint/connection metadata is invalid or includes unsafe secret-bearing output fields | Command returns `validation_error`, `phase = dependency-resource-validation`, no mutation. |
| DEP-RES-PG-READ-001 | List/show safe summaries | Existing managed and imported Postgres resources | `dependency-resources.list` or `dependency-resources.show` | Output includes ownership, status, exposure policy, binding readiness, backup relationship metadata, and masked connection summary only. |
| DEP-RES-PG-READ-002 | Secret masking | Imported Postgres has raw password, token, auth header, cookie, SSH credential, provider token, or sensitive query in input | list/show/error/event/log surfaces are read | Raw secret material is absent; password-like parts are replaced by a stable mask. |
| DEP-RES-PG-RENAME-001 | Rename dependency resource | Existing active dependency resource | `dependency-resources.rename` supplies a new name | Only name/slug changes; binding metadata, backup metadata, provider state, runtime state, and snapshots are unchanged. |
| DEP-RES-PG-DELETE-001 | Delete imported external record | Imported external Postgres has no blockers | `dependency-resources.delete` | Appaloft tombstones/removes the control-plane record and does not imply provider/external database deletion. |
| DEP-RES-PG-DELETE-002 | Block bound dependency delete | Dependency resource has binding blockers | `dependency-resources.delete` | Command returns `dependency_resource_delete_blocked`, no mutation. |
| DEP-RES-PG-DELETE-003 | Block backup-protected delete | Dependency resource has backup relationship metadata requiring retention | `dependency-resources.delete` | Command returns `dependency_resource_delete_blocked`, no backup data is deleted. |
| DEP-RES-PG-DELETE-004 | Block provider-managed unsafe delete | Appaloft-managed Postgres has provider-managed unsafe state | `dependency-resources.delete` | Command returns `dependency_resource_delete_blocked`; provider-native deletion remains future work. |
| DEP-RES-PG-ENTRY-001 | Public operation catalog | Specs define dependency resource operations | operation catalog/CLI/oRPC are generated or inspected | Each operation has one explicit command/query key and no generic update. |

## Domain Ownership

- Bounded context: Dependency Resources.
- Aggregate owner: `ResourceInstance` owns dependency resource identity, kind, ownership, lifecycle,
  source/management mode, provider-neutral connection metadata, connection exposure policy, backup
  relationship metadata, and delete safety state.
- Future aggregate relationship: `ResourceBinding` owns future workload-to-dependency binding
  contracts; this slice reports readiness and blockers but does not implement bind/unbind.
- Upstream/downstream contexts:
  - Workspace provides project/environment context.
  - Workload Delivery will later bind Resources to dependency resources.
  - Release Orchestration may later snapshot bindings without raw secrets.
  - Runtime/provider adapters may later provision or delete provider-native Postgres.

## Public Surfaces

- API/oRPC: add provision/import/list/show/rename/delete routes using application command/query
  schemas.
- CLI: add `appaloft dependency postgres provision/import` plus
  `appaloft dependency list/show/rename/delete`.
- Web/UI: read/write affordances are deferred unless implemented with i18n and tests.
- Config: no repository config fields in this slice.
- Events: internal domain events for create/import/rename/delete; no integration events.
- Public docs/help: record Phase 7 docs migration gap unless a Docs Round expands the public docs
  page in this PR.
- Future MCP/tools: one operation per command/query; no compound "manage database" tool.

## Output Contracts

`dependency-resources.list` and `dependency-resources.show` return JSON-first safe summaries:

- `schemaVersion`;
- dependency resource identity, project/environment ownership, kind, name, slug, lifecycle status;
- management/source mode: `appaloft-managed` or `imported-external`;
- provider key and provider-neutral management metadata;
- connection exposure policy and masked connection summary;
- future binding readiness summary;
- backup relationship metadata summary;
- delete safety summary when available;
- generated timestamp.

Outputs must not include raw passwords, tokens, auth headers, cookies, SSH credentials, provider
tokens, private keys, or sensitive query parameters. Deployment snapshots must not receive raw
binding secrets in this slice.

## Non-Goals

- No Redis.
- No dependency bind/unbind.
- No secret rotation.
- No backup/restore.
- No Docker Swarm or provider-native database realization.
- No deployment retry/redeploy/rollback.
- No runtime cleanup/prune.
- No mutation of historical deployment snapshots.

## Open Questions

- Which provider-managed Postgres states become deletable after provider-native deletion exists is
  deferred to the provider provisioning/delete slice.
