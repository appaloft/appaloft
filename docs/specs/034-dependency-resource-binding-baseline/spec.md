# Dependency Resource Binding Baseline

## Status

- Round: Post-Implementation Sync
- Artifact state: implemented first slice
- Roadmap target: Phase 7 / `0.9.0` beta, Day-Two Production Controls
- Compatibility impact: `pre-1.0-policy`, additive public CLI/API/oRPC capability and read-model
  schema
- Decision state: no-ADR-needed

## Business Outcome

Operators can bind a Postgres dependency resource to a Resource after the dependency resource is
provisioned or imported. The binding gives users a safe, inspectable control-plane relationship
between the application Resource and the database dependency without exposing raw connection
secrets, mutating historical deployment snapshots, injecting runtime environment variables, or
creating/deleting provider-native databases.

This first slice establishes the provider-neutral binding metadata that later secret rotation,
backup/restore, deployment snapshot binding, runtime cleanup/prune, and Redis bind/unbind can
reuse.

## Discover Findings

1. Existing dependency language already separates `ResourceInstance` for dependency resources from
   `ResourceBinding` for workload-to-dependency contracts.
2. Binding is modeled as an independent write-side association/aggregate, not as internal
   `ResourceInstance` state and not as a read-only join. The bind command loads Resource and
   Dependency Resource for admission, then persists a `ResourceBinding` that owns binding lifecycle,
   target exposure policy, and scope/injection coherence.
3. Binding ownership is accepted only when Resource and Dependency Resource share project and
   environment. Cross-environment binding is rejected until an explicit sharing/tenant policy is
   specified.
4. Raw connection secret material remains command/input-boundary material owned by the Dependency
   Resource secret boundary. Binding stores only safe metadata such as variable name, connection
   profile label, secret reference pointer, and masked connection summary.
5. `unbind` tombstones/removes only the binding association. It does not delete the Dependency
   Resource, delete external databases, rotate secrets, trigger runtime cleanup, or rewrite
   deployment snapshots.
6. No ADR is needed because this slice reuses ADR-012/014 deployment snapshot boundaries, ADR-025
   provider/control-plane separation, ADR-026 intention-revealing command naming, and ADR-028
   command coordination policy. It does not change deployment admission, deployment snapshot
   immutability, runtime env injection, provider contracts, or delete ownership.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| DependencyResource | Public read/operation name for a dependency resource instance. | Dependency Resources | ResourceInstance |
| ResourceInstance | Core aggregate for a dependency resource such as Postgres or Redis. | Dependency Resources | dependency resource |
| ResourceBinding | Explicit Resource-to-DependencyResource contract. | Dependency Resources / Workload Delivery | dependency binding |
| BindingTarget | Safe Resource-side exposure metadata such as env var name or profile label. | Dependency Resources | variable policy |
| BindingReadinessSummary | Safe read-model statement of whether a binding is usable for future snapshot/runtime work. | Dependency Resources | readiness |
| SnapshotReadinessSummary | Safe read-model statement that deployment snapshot materialization is deferred in this slice. | Release Orchestration | snapshot readiness |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| DEP-BIND-PG-BIND-001 | Bind Postgres dependency to Resource | Active Resource and ready Postgres Dependency Resource share project/environment | `resources.bind-dependency` with variable exposure metadata | A `ResourceBinding` is persisted, emits `resource-dependency-bound`, and returns a stable binding id. |
| DEP-BIND-PG-BIND-002 | Reject cross-context bind | Resource and Dependency Resource differ by project or environment | `resources.bind-dependency` runs | Command returns `resource_dependency_binding_context_mismatch`, no mutation. |
| DEP-BIND-PG-BIND-003 | Reject missing or inactive participants | Resource or Dependency Resource is missing, archived, deleted, or not bindable | `resources.bind-dependency` runs | Command returns structured `not_found`, lifecycle, or validation error, no mutation. |
| DEP-BIND-PG-BIND-004 | Reject duplicate active binding | Same Resource, Dependency Resource, target variable/profile policy already has an active binding | `resources.bind-dependency` runs again | Command returns `conflict`, `phase = resource-dependency-binding`, no mutation. |
| DEP-BIND-PG-READ-001 | List/show safe binding summaries | A Resource has one or more dependency bindings | `resources.list-dependency-bindings` or `resources.show-dependency-binding` runs | Output includes Resource, Dependency Resource, kind, source mode, status, masked connection, target policy, binding readiness, and snapshot readiness. |
| DEP-BIND-PG-READ-002 | Preserve secret masking | Dependency Resource was imported with a raw connection secret | Binding list/show, Dependency Resource list/show, CLI/API outputs are read | No raw password, token, auth header, cookie, SSH credential, provider token, private key, sensitive query, or raw connection URL appears. |
| DEP-BIND-PG-UNBIND-001 | Unbind without deleting dependency | Active binding exists | `resources.unbind-dependency` runs | Binding becomes inactive/tombstoned, Resource and Dependency Resource remain, and no external/provider database deletion occurs. |
| DEP-BIND-PG-DELETE-001 | Block Dependency Resource delete by active binding | Active binding references a Dependency Resource | `dependency-resources.delete` runs | Command returns `dependency_resource_delete_blocked` with a `resource-binding` blocker and no mutation. |
| DEP-BIND-PG-DELETE-002 | Imported external unbind/delete behavior | Imported external Postgres was bound then unbound | Binding is removed and Dependency Resource delete runs | Appaloft removes only control-plane records; no provider/external database deletion is implied. |
| DEP-BIND-PG-ENTRY-001 | Public operation catalog | Specs define binding operations | operation catalog/CLI/oRPC are inspected | Each operation has an explicit command/query key and no generic update operation. |
| DEP-BIND-PG-SNAPSHOT-001 | Snapshot boundary is deferred | Resource has an active dependency binding | deployment snapshot creation or read-model summary is inspected | Raw secrets are not written to snapshots; binding snapshot materialization is reported as deferred. |

## Domain Ownership

- Bounded context: Dependency Resources, coordinated with Workload Delivery for Resource admission.
- Aggregate/resource owner:
  - `ResourceBinding` owns binding lifecycle, Resource/Dependency Resource references, target
    exposure metadata, scope/injection mode coherence, and active/removed status.
  - `ResourceInstance` continues to own dependency resource lifecycle, source mode, masked
    connection metadata, secret reference, backup metadata, and provider-managed delete safety.
  - `Resource` remains the workload owner and is loaded for admission; this slice does not persist
    dependency binding state inside the Resource aggregate.
- Upstream/downstream contexts:
  - Workspace provides project/environment ownership.
  - Release Orchestration may later snapshot safe binding references without raw secrets.
  - Runtime/provider adapters may later inject environment variables or realize provider-native
    databases under separate specs.

## Public Surfaces

- API/oRPC: add Resource-scoped bind/unbind/list/show routes using application command/query
  schemas.
- CLI: add Resource dependency binding subcommands.
- Web/UI: deferred; Resource detail may later show read-only safe summaries with i18n/test coverage.
- Config: no repository config fields in this slice.
- Events: internal domain events for bind/unbind; no integration events.
- Public docs/help: record Phase 7 docs migration gap unless a Docs Round expands public docs in
  this PR.
- Future MCP/tools: one operation per command/query.

## Output Contracts

`resources.list-dependency-bindings` and `resources.show-dependency-binding` return JSON-first safe
summaries:

- `schemaVersion`;
- binding identity, Resource identity, Dependency Resource identity, project/environment ownership;
- dependency kind, source mode, lifecycle status, provider key, provider-managed flag;
- binding target metadata: variable name/profile label, scope, injection mode, and secret reference
  pointer when present;
- masked connection summary from the Dependency Resource read model;
- binding readiness summary;
- snapshot readiness summary, with deferred reason in this slice;
- created/removed timestamps.

Outputs must not include raw passwords, tokens, auth headers, cookies, SSH credentials, provider
tokens, private keys, sensitive query parameters, raw connection URLs, or raw environment values.

## Non-Goals

- No secret rotation.
- No backup/restore.
- No Redis.
- No provider-native database realization.
- No runtime env injection, redeploy, retry, rollback, or cleanup/prune.
- No mutation of historical deployment snapshots.
- No Web UI beyond a later read-only safe summary.

## Open Questions

- Whether Resource delete/archive should surface dependency binding blockers in this slice is
  implementation-dependent. If not implemented now, it remains a documented Phase 7 gap.
