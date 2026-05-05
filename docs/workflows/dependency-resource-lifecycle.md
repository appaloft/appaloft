# Dependency Resource Lifecycle Workflow Spec

## Normative Contract

Dependency Resource Lifecycle is the provider-neutral workflow for managing database and service
dependencies that future Resources can bind to.

This slice supports provider-neutral Postgres and Redis dependency records. Every mutation must
dispatch one explicit operation:

- `dependency-resources.provision-postgres`
- `dependency-resources.import-postgres`
- `dependency-resources.provision-redis`
- `dependency-resources.import-redis`
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

Backup/restore is planned by ADR-036 and
[Dependency Resource Backup And Restore](../specs/039-dependency-resource-backup-restore/spec.md)
and becomes active during Code Round. The current implemented workflow is not provider-native
credential rotation, not runtime env injection, and not a deployment command. Provider-native
Postgres realization is implemented through a hermetic provider capability under
[Postgres Provider-Native Realization](../specs/038-postgres-provider-native-realization/spec.md).

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

1. Provision an Appaloft-managed Postgres dependency resource record with provider-native
   realization state.
2. Import an external Postgres dependency resource without exposing raw connection secrets later.
3. List and show dependency resources with ownership, status, connection exposure policy, future
   binding readiness, and backup relationship metadata.
4. Rename a dependency resource without changing bindings, backup metadata, provider state,
   runtime state, or snapshots.
5. Bind a Postgres dependency resource to a Resource with safe target metadata.
6. List/show Resource dependency binding summaries without exposing raw secrets.
7. Unbind without deleting the dependency resource or any external/provider database.
8. Record provider-neutral safe dependency binding references in new deployment attempt snapshots.
9. Rotate a binding-scoped secret reference for future deployment snapshots without changing
   historical deployments.
10. Register Redis dependency resources as safe provider-neutral records.
11. Create safe backup restore points and restore them in place after explicit acknowledgement.
12. Delete only dependency resources that pass safety checks.

## Operation Boundaries

| User intent | Operation | Mutates | Must not mutate |
| --- | --- | --- | --- |
| Provision managed Postgres | `dependency-resources.provision-postgres` | `ResourceInstance`; future provider-native realization attempt | Resource bindings, secrets rotation, runtime, deployment snapshots |
| Import external Postgres | `dependency-resources.import-postgres` | `ResourceInstance` | External database, Resource bindings, runtime, deployment snapshots |
| Provision managed Redis | `dependency-resources.provision-redis` | `ResourceInstance` | Provider-native Redis, Resource bindings, secrets rotation, runtime, deployment snapshots |
| Import external Redis | `dependency-resources.import-redis` | `ResourceInstance` | External Redis, Resource bindings, runtime, deployment snapshots |
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
| Create deployment with dependency binding references | `deployments.create` | Deployment attempt snapshot | ResourceBinding lifecycle, Dependency Resource lifecycle, raw secrets, runtime env injection |

## Postgres Source Modes

| Source mode | Required fields | Meaning |
| --- | --- | --- |
| `appaloft-managed` | project/environment/name/provider key | Appaloft owns a control-plane record for a future provider-managed Postgres resource. First slice does not create provider-native databases. |
| `imported-external` | project/environment/name/endpoint plus secret ref or connection secret input | Appaloft records an external Postgres dependency for future binding. Delete removes only the Appaloft record. |

Redis dependency resources reuse these source modes. Managed Redis records remain provider-neutral,
while imported external Redis records capture only safe endpoint metadata and secret references.

## Provider-Native Postgres Realization

`dependency-resources.provision-postgres` is the public command that owns managed Postgres
realization. The provider-native slice changes Appaloft-managed Postgres from metadata-only intent
to a durable realization lifecycle:

- command admission persists a `ResourceInstance` and realization attempt;
- provider follow-up stores safe provider handle, masked endpoint metadata, status, and sanitized
  failure information;
- command success means request accepted, not necessarily provider completion;
- binding is allowed only when the dependency resource is realized and ready;
- managed delete uses provider cleanup only after binding, backup, snapshot, and provider-safety
  checks pass.

The current implementation uses a synchronous hermetic provider adapter while keeping the durable
status shape required by future background provider work. Provider-native realization must not leak
provider SDK response bodies, credentials, passwords,
tokens, private keys, raw connection URLs, or command output into core state, read models, events,
errors, logs, or public contracts.

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

- `ready` when the dependency resource has enough safe metadata for a future binding flow;
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
deletes the external database. Realized Appaloft-managed Postgres delete calls the managed provider
cleanup only after explicit provider delete safety and cleanup succeeds.

## Backup And Restore

Backup/restore is an accepted Phase 7 candidate governed by ADR-036 and
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
not-ready dependency metadata is a readiness diagnostic in this first snapshot reference slice, not
a deployment admission blocker, because runtime env injection remains deferred.

`deployments.create` must not accept dependency resource, database URL, username, password, or
secret-rotation fields.

## Entrypoints

| Entrypoint | Required behavior |
| --- | --- |
| CLI | Separate dependency and Resource dependency binding commands. No generic `dependency update`. |
| oRPC / HTTP | Routes reuse command/query schemas and dispatch through bus. |
| Web | Deferred unless implemented with i18n and tests. |
| Automation / MCP | Future tools map one-to-one to operation keys. |

## Current Implementation Notes And Migration Gaps

The current implementation adds Postgres dependency resource lifecycle records, Resource binding
metadata, safe read models, real active-binding delete blockers, and safe dependency binding
snapshot references. Binding secret rotation updates binding-scoped safe secret references for
future deployment snapshots only. Redis dependency resource lifecycle records are implemented as
provider-neutral safe metadata. Provider-native Postgres realization is implemented with a
hermetic provider capability. Backup/restore is specified by ADR-036/039 but not implemented yet.
Runtime env injection, Web affordances, and runtime cleanup remain future work.

## Open Questions

- Whether the first provider-native Code Round uses synchronous fake-provider completion or durable
  background processing remains an implementation choice, but read models must expose the same safe
  realization status shape either way.
