# Dependency Resource Lifecycle Workflow Spec

## Normative Contract

Dependency Resource Lifecycle is the provider-neutral workflow for managing database and service
dependencies that future Resources can bind to.

This slice supports provider-neutral dependency resources for `postgres`, `redis`, `mysql`,
`clickhouse`, `object-storage`, and `opensearch`. `object-storage` is the canonical kind for
S3-compatible services such as S3 and MinIO. Creation and import use one kind-driven command path
for every kind; Postgres and Redis no longer have separate command, CLI, or HTTP compatibility
routes. Every mutation must dispatch one explicit operation:

- `dependency-resources.provision`
- `dependency-resources.import`
- `dependency-resources.rename`
- `dependency-resources.delete`
- `dependency-resources.create-backup`
- `dependency-resources.restore-backup`
- `resources.bind-dependency`
- `resources.unbind-dependency`
- `resources.rotate-dependency-binding-secret`

Every read must dispatch one explicit query:

- `dependency-resources.list`
- `dependency-resources.show`
- `dependency-resources.list-backups`
- `dependency-resources.show-backup`
- `resources.list-dependency-bindings`
- `resources.show-dependency-binding`

Backup/restore is governed by ADR-036 and
[Dependency Resource Backup And Restore](../specs/039-dependency-resource-backup-restore/spec.md)
and is active for ready dependency resources with provider backup capability. Runtime environment
injection is active through ADR-040/ADR-041 as a deployment-time materialization boundary, not as
dependency-specific fields on `deployments.create`. The current implemented workflow is not
provider-native credential rotation and not a deployment command. Provider-native realization is
implemented through generic provider capability boundaries. The historical Postgres and Redis
provider-native specs remain background references for lifecycle shape, but their public operation
entries are superseded by `dependency-resources.provision` and `dependency-resources.import`.

## Global References

- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-025: Control-Plane Modes And Action Execution](../decisions/ADR-025-control-plane-modes-and-action-execution.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [ADR-028: Command Coordination Scope And Mutation Admission](../decisions/ADR-028-command-coordination-scope-and-mutation-admission.md)
- [ADR-036: Dependency Resource Backup And Restore Lifecycle](../decisions/ADR-036-dependency-resource-backup-restore-lifecycle.md)
- [Postgres Dependency Resource Lifecycle](../specs/033-postgres-dependency-resource-lifecycle/spec.md)
- [Dependency Resource Binding Baseline](../specs/034-dependency-resource-binding-baseline/spec.md)
- [Dependency Binding Deployment Snapshot Reference Baseline](../specs/035-dependency-binding-snapshot-reference-baseline/spec.md)
- [Dependency Binding Secret Rotation](../specs/036-dependency-binding-secret-rotation/spec.md)
- [Redis Dependency Resource Lifecycle](../specs/037-redis-dependency-resource-lifecycle/spec.md)
- [Postgres Provider-Native Realization](../specs/038-postgres-provider-native-realization/spec.md)
- [Dependency Resource Backup And Restore](../specs/039-dependency-resource-backup-restore/spec.md)
- [Dependency Binding Runtime Injection](../specs/047-dependency-binding-runtime-injection/spec.md)
- [Dependency Runtime Secret Value Resolution](../specs/048-dependency-runtime-secret-value-resolution/spec.md)
- [Redis Provider-Native Realization](../specs/049-redis-provider-native-realization/spec.md)
- [ADR-040: Dependency Binding Runtime Injection Boundary](../decisions/ADR-040-dependency-binding-runtime-injection-boundary.md)
- [ADR-041: Dependency Runtime Secret Value Resolution](../decisions/ADR-041-dependency-runtime-secret-value-resolution.md)
- [resource-dependency-binding-secret-rotated](../events/resource-dependency-binding-secret-rotated.md)
- [dependency-resource-realization-requested](../events/dependency-resource-realization-requested.md)
- [dependency-resource-realized](../events/dependency-resource-realized.md)
- [dependency-resource-realization-failed](../events/dependency-resource-realization-failed.md)
- [dependency-resource-provider-delete-requested](../events/dependency-resource-provider-delete-requested.md)
- [dependency-resource-backup-requested](../events/dependency-resource-backup-requested.md)
- [dependency-resource-backup-completed](../events/dependency-resource-backup-completed.md)
- [dependency-resource-backup-failed](../events/dependency-resource-backup-failed.md)
- [dependency-resource-restore-requested](../events/dependency-resource-restore-requested.md)
- [dependency-resource-restore-completed](../events/dependency-resource-restore-completed.md)
- [dependency-resource-restore-failed](../events/dependency-resource-restore-failed.md)
- [Dependency Resource Test Matrix](../testing/dependency-resource-test-matrix.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Workflow Purpose

The workflow lets operators:

1. Provision an Appaloft-managed dependency resource record with provider-native realization state
   and operator-visible process-attempt projection.
2. Import an external dependency resource without exposing raw connection secrets later.
3. List and show dependency resources with ownership, status, connection exposure policy, binding
   readiness, and backup relationship metadata.
4. Rename a dependency resource without changing bindings, backup metadata, provider state,
   runtime state, or snapshots.
5. Bind a ready dependency resource to a Resource with safe target metadata.
6. List/show Resource dependency binding summaries without exposing raw secrets.
7. Unbind without deleting the dependency resource or any external/provider database.
8. Record provider-neutral safe dependency binding references in new deployment attempt snapshots.
9. Rotate a binding-scoped secret reference for future deployment snapshots without changing
   historical deployments.
10. Register and realize dependency resources through the generic provider capability with
    operator-visible process-attempt projection, then copy ready bindings into safe deployment
    snapshot references.
11. Materialize active ready dependency bindings into runtime environment injection snapshots during
    deployment planning/execution.
12. Create safe backup restore points and restore them in place after explicit acknowledgement.
13. Delete only dependency resources that pass safety checks.

## Operation Boundaries

| User intent | Operation | Mutates | Must not mutate |
| --- | --- | --- | --- |
| Provision managed dependency | `dependency-resources.provision` | `ResourceInstance`; provider-native realization attempt | Resource bindings, secrets rotation, runtime, deployment snapshots |
| Import external dependency | `dependency-resources.import` | `ResourceInstance` | External service, Resource bindings, runtime, deployment snapshots |
| List dependency resources | `dependency-resources.list` | Nothing | Any aggregate or runtime state |
| Show dependency resource | `dependency-resources.show` | Nothing | Any aggregate or runtime state |
| Rename dependency resource | `dependency-resources.rename` | Dependency resource name/slug | Bindings, backup metadata, provider state, runtime, snapshots |
| Delete dependency resource | `dependency-resources.delete` | Dependency resource lifecycle/tombstone | External/provider database, bindings, backup data, runtime cleanup |
| Create dependency resource backup | `dependency-resources.create-backup` | `DependencyResourceBackup` attempt/restore point | Resource bindings, dependency resource lifecycle, runtime, deployment snapshots |
| Restore dependency resource backup | `dependency-resources.restore-backup` | Restore attempt and provider data behind dependency resource | Resource bindings, deployment rollback/redeploy, runtime restart, snapshots |
| List dependency resource backups | `dependency-resources.list-backups` | Nothing | Any aggregate, provider, runtime, or deployment state |
| Show dependency resource backup | `dependency-resources.show-backup` | Nothing | Any aggregate, provider, runtime, or deployment state |
| Bind dependency to Resource | `resources.bind-dependency` | ResourceBinding | Provider database, ResourceInstance lifecycle, runtime, historical deployment snapshots |
| Unbind dependency from Resource | `resources.unbind-dependency` | ResourceBinding lifecycle/tombstone | Dependency resource, external/provider database, runtime cleanup, snapshots |
| Rotate binding secret reference | `resources.rotate-dependency-binding-secret` | ResourceBinding safe secret reference/version | Provider database credentials, Dependency Resource lifecycle, runtime env injection, historical deployment snapshots |
| List Resource dependency bindings | `resources.list-dependency-bindings` | Nothing | Any aggregate or runtime state |
| Show Resource dependency binding | `resources.show-dependency-binding` | Nothing | Any aggregate or runtime state |
| Create deployment with dependency binding references | `deployments.create` | Deployment attempt snapshot and safe runtime injection snapshot | ResourceBinding lifecycle, Dependency Resource lifecycle, raw secrets |
| Materialize dependency binding runtime environment | internal capability during `deployments.plan` / `deployments.create` | Deployment runtime injection snapshot | ResourceBinding lifecycle, Dependency Resource lifecycle, raw secrets, historical snapshots |

## Dependency Source Modes

| Source mode | Required fields | Meaning |
| --- | --- | --- |
| `appaloft-managed` | kind/project/environment/name/provider key | Appaloft owns a control-plane record plus provider-native realization state for a managed dependency resource. |
| `imported-external` | kind/project/environment/name/endpoint plus secret ref or connection secret input | Appaloft records an external dependency for binding. Delete removes only the Appaloft record. |

All canonical dependency kinds reuse these source modes. Imported external records capture only safe
endpoint metadata and secret references.

## Provider-Native Dependency Realization

`dependency-resources.provision` is the public command that owns managed dependency realization for
all canonical kinds. The provider-native slice uses one durable realization lifecycle:

- command admission persists a `ResourceInstance` and realization attempt;
- provider follow-up stores safe provider handle, masked endpoint metadata, status, and sanitized
  failure information;
- command success means request accepted, not necessarily provider completion;
- binding is allowed only when the dependency resource is realized and ready;
- managed delete uses provider cleanup only after binding, backup, snapshot/reference, and provider-safety
  checks pass.

The current shell provider writes safe local realization/delete artifacts and Docker-backed
single-server realizations for `postgres`, `redis`, `mysql`, `clickhouse`, `object-storage`, and
`opensearch`. It keeps the durable status shape required by future background provider work and
external provider packages. Provider-native realization must not leak provider SDK response bodies,
credentials, passwords, tokens, private keys, raw connection URLs, or command output into core
state, read models, events, errors, logs, or public contracts.

## Connection Safety

Connection metadata is split into:

- safe endpoint fields such as host, port, database name, SSL mode, and masked connection display;
- secret reference metadata such as a control-plane secret ref;
- raw command input boundary material that must not be echoed, logged, emitted, or projected.

Read models must mask or omit:

- password;
- access token;
- auth header;
- cookie;
- SSH credential;
- provider token;
- private key;
- sensitive query parameters such as `password`, `token`, `secret`, `sslcert`, `sslkey`, and
  `sslpassword`.

## Binding Readiness And Binding Metadata

Dependency resources and Resource dependency bindings return binding readiness summaries:

- `ready` when the dependency resource has enough safe metadata for binding and runtime injection;
- `blocked` when required connection metadata is missing or lifecycle status is not usable;
- `not-implemented` only for dependency resources that predate concrete binding support.

The summary is read-model guidance. `resources.bind-dependency` validates write-side Resource and
Dependency Resource state again and must not rely only on stale read models.

Resource dependency bindings store only provider-neutral control-plane metadata:

- Resource and Dependency Resource references;
- project/environment ownership;
- binding target name/profile label;
- scope and injection mode;
- safe secret reference pointer when present;
- safe secret version or rotated-at metadata when the binding secret reference has been rotated;
- active/removed status and timestamps.

They must not store raw connection strings, raw passwords, tokens, auth headers, cookies, SSH
credentials, provider tokens, private keys, sensitive query parameters, or raw environment values.

`resources.rotate-dependency-binding-secret` replaces only the binding-scoped safe secret reference
or version used by future deployment snapshot references. It must reject missing or removed
bindings, require explicit acknowledgement that historical deployment snapshots remain unchanged,
and publish `resource-dependency-binding-secret-rotated` only after the new safe reference is
durably persisted. Rotation does not prove runtime reachability, update provider-native database
passwords, inject runtime environment variables, or schedule redeploy.

## Delete Safety

`dependency-resources.delete` is synchronous write-side deletion/tombstone behavior. It must fail
before mutation when:

- any active/future ResourceBinding references the dependency resource;
- backup relationship metadata marks retention, backup set ownership, restore point relationship,
  or another backup safety blocker;
- provider-managed state is unsafe to delete in this provider-neutral slice;
- deployment snapshots or other retained references are reported by the safety reader.

Failure uses stable structured errors and safe blocker details. Imported external delete never
deletes the external database. Realized Appaloft-managed Postgres or Redis delete calls the managed
provider cleanup only after explicit provider delete safety and cleanup succeeds, and provider
cleanup attempts are mirrored into operator-visible process-attempt state with safe dependency and
provider metadata.

## Backup And Restore

Backup/restore is an active Phase 7 workflow governed by ADR-036 and
[Dependency Resource Backup And Restore](../specs/039-dependency-resource-backup-restore/spec.md).
The first slice:

- creates one `DependencyResourceBackup` attempt for one ready dependency resource;
- records a ready restore point only as safe provider artifact metadata;
- restores in place to the same dependency resource after explicit data-overwrite and
  runtime-not-restarted acknowledgements;
- reports backup and restore progress through safe read models and lifecycle events;
- blocks dependency resource delete while retained restore points or in-flight backup/restore
  attempts exist.

Backup/restore must not expose raw dump contents, raw connection URLs, passwords, tokens, auth
headers, cookies, SSH credentials, provider tokens, private keys, sensitive query parameters,
provider SDK payloads, or command output. It also must not mutate ResourceBindings, historical
deployment snapshots, runtime environment values, workload process state, deployment retry,
redeploy, or rollback state.

## Deployment Relationship

Dependency resources do not add input fields to deployment admission in this slice.
`deployments.create` copies provider-neutral safe binding references from active Resource
dependency bindings into the immutable Deployment attempt snapshot. The copied reference may include
binding id, dependency resource id, dependency kind, target name, scope, injection mode, and
snapshot readiness. It must not include raw connection secrets, provider credentials, sensitive
connection query parameters, materialized environment values, or runtime-rendered secret values.

`resources.bind-dependency` and `resources.unbind-dependency` do not mutate historical deployment
snapshots and do not inject current runtime environment variables. New deployments see active
bindings at admission time only. Removed bindings are excluded from new snapshots. Missing or
not-ready dependency metadata now blocks deployment admission once runtime injection is required.

ADR-040 and the dependency binding runtime injection spec govern the runtime path:
`deployments.plan` reports `ready` or `blocked` runtime injection readiness, and
`deployments.create` rejects active non-injectable bindings before acceptance. Runtime target
adapters deliver safe dependency secret handles as close to execution as possible and redact command
display, logs, events, errors, and diagnostics. Store-backed resolution of Appaloft-owned
dependency and retained binding secret references is governed by
[Dependency Runtime Secret Value Resolution](../specs/048-dependency-runtime-secret-value-resolution/spec.md).

`deployments.create` must not accept dependency resource, database URL, username, password, or
secret-rotation fields.

## Entrypoints

| Entrypoint | Required behavior |
| --- | --- |
| CLI | Separate dependency and Resource dependency binding commands. No generic `dependency update`. |
| oRPC / HTTP | Routes reuse command/query schemas and dispatch through bus. |
| Web | Resource detail Settings provides managed Postgres/Redis provision, external Postgres/Redis import through the safe connection boundary, dependency rename/delete with safety blockers, backup create/list/acknowledged restore, ready dependency bind, active binding list, acknowledged binding-secret rotation, unbind, i18n text, and public help links. Scheduled backup policy, backup prune/delete, export/download, cross-resource restore, and runtime cleanup remain later Web rounds. |
| Automation / MCP | Future tools map one-to-one to operation keys. |

## Current Implementation Notes And Governed Follow-Ups

The current implementation adds Postgres dependency resource lifecycle records, Resource binding
metadata, safe read models, real active-binding delete blockers, and safe dependency binding
snapshot references. Binding secret rotation updates binding-scoped safe secret references for
future deployment snapshots only. Redis dependency resource lifecycle records are implemented as
provider-neutral safe metadata, and ready imported Redis records can bind to Resources and appear as
safe deployment snapshot references. Provider-native Postgres and Redis realization are implemented
with injected provider capabilities, shell-local realization/delete artifact materialization, and
safe operator-visible process-attempt projection for realization/delete attempts. Dependency
resource backup/restore is implemented with an injected provider capability, shell-local
native Postgres backup/restore command execution for imported Postgres resources with resolvable
Appaloft-owned connection refs, safe metadata-only backup/restore artifact materialization for
other references, safe backup read models, restore attempt metadata, lifecycle events,
process-attempt pending/claim/completion handoff when a journal is available, operator-visible
fallback projection when it is not, and delete-safety blockers.
Dependency binding runtime
injection is specified by ADR-040, and
store-backed dependency runtime secret value resolution is implemented for imported Postgres,
imported Redis, managed Postgres Appaloft-owned refs, managed Redis refs, single-server runtimes,
Docker Swarm, and retained rotated binding refs through
[Dependency Runtime Secret Value Resolution](../specs/048-dependency-runtime-secret-value-resolution/spec.md).
Postgres and Redis closed-loop verification are covered in the dependency resource test matrix.
Resource-detail Web dependency-resource write affordances are implemented for managed
Postgres/Redis provision, external import through the safe connection boundary, dependency
rename/delete with safety blockers, backup create/list/acknowledged restore, ready binding, active
binding list, acknowledged binding-secret rotation, unbind, and help links. Runtime cleanup,
scheduled backup policy, backup prune/delete, export/download, and cross-resource restore are
separate governed Phase 7+ capabilities rather than missing pieces of the current dependency
resource lifecycle baseline.

## Open Questions

- Provider-native realization/delete still executes inline through the command use cases after
  `ResourceInstance` realization state is persisted. A full process-attempt atomic
  claim/completion worker remains a separate durable-delivery slice.
- Dependency resource backup/restore still executes provider work inline after
  `DependencyResourceBackup` state is persisted, but uses process-attempt atomic claim/completion
  when a process journal is available. Automatic background retry execution remains a separate
  durable-delivery slice.
