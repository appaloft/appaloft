# Dependency Resource Lifecycle Workflow Spec

## Normative Contract

Dependency Resource Lifecycle is the provider-neutral workflow for managing database and service
dependencies that future Resources can bind to.

This first slice is Postgres-only. Every mutation must dispatch one explicit operation:

- `dependency-resources.provision-postgres`
- `dependency-resources.import-postgres`
- `dependency-resources.rename`
- `dependency-resources.delete`

Every read must dispatch one explicit query:

- `dependency-resources.list`
- `dependency-resources.show`

The workflow is not dependency bind/unbind, not secret rotation, not backup/restore, not
provider-native database provisioning, and not a deployment command.

## Global References

- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-025: Control-Plane Modes And Action Execution](../decisions/ADR-025-control-plane-modes-and-action-execution.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [ADR-028: Command Coordination Scope And Mutation Admission](../decisions/ADR-028-command-coordination-scope-and-mutation-admission.md)
- [Postgres Dependency Resource Lifecycle](../specs/033-postgres-dependency-resource-lifecycle/spec.md)
- [Dependency Resource Test Matrix](../testing/dependency-resource-test-matrix.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Workflow Purpose

The workflow lets operators:

1. Provision an Appaloft-managed Postgres dependency resource record.
2. Import an external Postgres dependency resource without exposing raw connection secrets later.
3. List and show dependency resources with ownership, status, connection exposure policy, future
   binding readiness, and backup relationship metadata.
4. Rename a dependency resource without changing bindings, backup metadata, provider state,
   runtime state, or snapshots.
5. Delete only dependency resources that pass safety checks.

## Operation Boundaries

| User intent | Operation | Mutates | Must not mutate |
| --- | --- | --- | --- |
| Provision managed Postgres | `dependency-resources.provision-postgres` | `ResourceInstance` | Provider-native database, Resource bindings, secrets rotation, runtime, deployment snapshots |
| Import external Postgres | `dependency-resources.import-postgres` | `ResourceInstance` | External database, Resource bindings, runtime, deployment snapshots |
| List dependency resources | `dependency-resources.list` | Nothing | Any aggregate or runtime state |
| Show dependency resource | `dependency-resources.show` | Nothing | Any aggregate or runtime state |
| Rename dependency resource | `dependency-resources.rename` | Dependency resource name/slug | Bindings, backup metadata, provider state, runtime, snapshots |
| Delete dependency resource | `dependency-resources.delete` | Dependency resource lifecycle/tombstone | External/provider database, bindings, backup data, runtime cleanup |

## Postgres Source Modes

| Source mode | Required fields | Meaning |
| --- | --- | --- |
| `appaloft-managed` | project/environment/name/provider key | Appaloft owns a control-plane record for a future provider-managed Postgres resource. First slice does not create provider-native databases. |
| `imported-external` | project/environment/name/endpoint plus secret ref or connection secret input | Appaloft records an external Postgres dependency for future binding. Delete removes only the Appaloft record. |

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

## Binding Readiness

This slice returns a binding readiness summary but does not implement bind/unbind:

- `ready` when the dependency resource has enough safe metadata for a future binding flow;
- `blocked` when required connection metadata is missing or lifecycle status is not usable;
- `not-implemented` when the only missing capability is future bind/unbind implementation.

The summary is read-model guidance. Future `resources.bind-dependency` or equivalent commands must
validate write-side state again and must not rely only on stale read models.

## Delete Safety

`dependency-resources.delete` is synchronous write-side deletion/tombstone behavior. It must fail
before mutation when:

- any active/future ResourceBinding references the dependency resource;
- backup relationship metadata marks retention, backup set ownership, restore point relationship,
  or another backup safety blocker;
- provider-managed state is unsafe to delete in this provider-neutral slice;
- deployment snapshots or other retained references are reported by the safety reader.

Failure uses stable structured errors and safe blocker details. Imported external delete never
deletes the external database. Appaloft-managed delete never calls provider-native deletion in this
slice.

## Deployment Relationship

Dependency resources do not change deployment admission in this slice. A future binding/snapshot
slice may copy provider-neutral binding references into immutable deployment snapshots, but raw
connection secrets must not be written into snapshots.

`deployments.create` must not accept dependency resource, database URL, username, password, or
secret-rotation fields.

## Entrypoints

| Entrypoint | Required behavior |
| --- | --- |
| CLI | Separate dependency commands. No generic `dependency update`. |
| oRPC / HTTP | Routes reuse command/query schemas and dispatch through bus. |
| Web | Deferred unless implemented with i18n and tests. |
| Automation / MCP | Future tools map one-to-one to operation keys. |

## Current Implementation Notes And Migration Gaps

This Code Round adds Postgres dependency resource lifecycle records and safe read models. Redis,
dependency bind/unbind, secret rotation, provider-native provisioning/deletion, backup/restore,
deployment snapshot binding, Web affordances, and runtime cleanup are future work.

## Open Questions

- The provider-native delete handshake for managed Postgres remains deferred to the provider
  provisioning slice.
