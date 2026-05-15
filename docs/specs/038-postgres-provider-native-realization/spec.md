# Postgres Provider-Native Realization

## Status

- Round: Code Round / Post-Implementation Sync
- Artifact state: implemented with Docker-backed single-server shell capability, hermetic fallback,
  and source-of-truth alignment
- Roadmap target: Phase 7 / `0.9.0` beta, Day-Two Production Controls
- Compatibility impact: `pre-1.0-policy`, semantic upgrade to managed Postgres lifecycle
- Decision state: no-ADR-needed

## Business Outcome

Operators can provision an Appaloft-managed Postgres dependency resource and have Appaloft realize
the provider-native database through an injected provider capability, then bind it to a Resource and
delete it only through explicit safety and provider cleanup rules.

This closes the realization/delete gap between the provider-neutral Postgres record baseline and
the first useful managed-database loop. The default shell composition can now realize Postgres as a
Docker container and named volume on a registered `local-shell` or `generic-ssh` single-server
target when the command supplies `serverId`. It does not rotate provider credentials, restart
running workloads, or schedule recurring backups.
Later Phase 7 slices added dependency runtime injection, backup/restore, scheduled backup policy,
and the Redis provider-native loop; this artifact remains the Postgres-specific realization/delete
contract.

## Discover Findings

1. `dependency-resources.provision-postgres` is already the public command for Appaloft-managed
   Postgres. This slice upgrades that command from metadata-only to managed realization when the
   selected provider supports the capability.
2. Provider-native realization belongs behind an application/provider port. `core` continues to own
   only value objects, aggregate state, lifecycle transitions, and safe provider metadata.
3. Command success follows the async lifecycle contract: admission succeeds when the dependency
   resource and realization attempt are durably recorded. Provider follow-up failure is visible
   through resource state, events, and read models, not by rewriting the original command result.
4. `resources.bind-dependency` can bind only realized/ready Postgres resources. A managed Postgres
   record whose provider realization is pending, failed, or unsupported is not bindable.
5. `dependency-resources.delete` remains fail-closed. For Appaloft-managed realized Postgres it must
   first pass binding, backup, snapshot, and provider safety checks, then use provider cleanup before
   tombstoning the Appaloft record.
6. Docker-backed single-server realization uses a safe provider handle to retain the owning server
   id and container name. The shell provider resolves that handle for delete, backup, and restore;
   raw connection URLs are stored only through `DependencyResourceSecretStore`.
7. Backup/restore execution is now governed by ADR-036 and the dependency backup/restore spec.
   This Postgres realization slice supplies the lifecycle fields and delete blockers consumed by
   that closed loop.

## Ubiquitous Language

| Term | Meaning | Context |
| --- | --- | --- |
| ProviderNativePostgres | A database instance created and owned through an Appaloft provider capability. | Dependency Resources |
| RealizationAttempt | Durable attempt to create, observe, or delete provider-native Postgres. | Dependency Resources |
| RealizationStatus | Safe state of provider-native lifecycle: `pending`, `ready`, `failed`, `delete-pending`, or `deleted`. | Dependency Resources |
| ProviderResourceHandle | Safe provider identifier for the managed database. It is not a secret. | Dependency Resources |
| ManagedDelete | Provider cleanup plus Appaloft record tombstone after safety checks pass. | Dependency Resources |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| DEP-RES-PG-NATIVE-001 | Accept managed Postgres realization | Active project/environment and provider supports managed Postgres | `dependency-resources.provision-postgres` is admitted | A `postgres` `ResourceInstance` and realization attempt are persisted, command returns `ok({ id })`, provider realization is requested, and running process-attempt visibility is recorded without leaking secrets. |
| DEP-RES-PG-NATIVE-002 | Mark realized provider database ready | Provider realization succeeds with safe handle and endpoint metadata | The realization result is applied | Dependency resource status becomes `ready`, connection summary is safe/masked, binding readiness is `ready`, process-attempt success is recorded, and `dependency-resource-realized` is emitted. |
| DEP-RES-PG-NATIVE-003 | Surface provider realization failure | Provider realization fails after admission | The realization result is applied | Dependency resource status becomes `degraded`, binding readiness is `blocked`, failure code/category/phase and process-attempt failure are safe, and the original provision command remains accepted. |
| DEP-RES-PG-NATIVE-004 | Reject bind before realization readiness | Managed Postgres is pending, failed, unsupported, or deleted | `resources.bind-dependency` is called | Command returns structured blocked/not-found/conflict result, no binding is persisted. |
| DEP-RES-PG-NATIVE-005 | Delete managed realized Postgres safely | Realized managed Postgres has no binding, backup, snapshot, or provider safety blockers | `dependency-resources.delete` is called | Provider delete is requested/applied, process-attempt cleanup visibility is recorded, Appaloft record is tombstoned only after cleanup state is durable, and no runtime or deployment snapshot is mutated. |
| DEP-RES-PG-NATIVE-006 | Block managed delete while protected | Resource has active binding, backup retention, retained snapshot, or provider unsafe blocker | `dependency-resources.delete` is called | Returns `dependency_resource_delete_blocked`, no provider cleanup is requested. |
| DEP-RES-PG-NATIVE-007 | Provider unsupported | Selected provider lacks managed Postgres realization | `dependency-resources.provision-postgres` is called | Admission returns `provider_capability_unsupported`, `phase = dependency-resource-realization-admission`, no resource is persisted unless caller explicitly requested metadata-only mode. |
| DEP-RES-PG-NATIVE-008 | Realize on a single-server Docker target | Active project/environment, active `local-shell` or `generic-ssh` single-server target, and default managed Postgres provider | `dependency-resources.provision-postgres` includes `serverId` | Shell provider creates/replaces a Docker container, named Docker volume, and `appaloft-edge` network attachment; returns a safe Docker provider handle, masked endpoint, and raw connection value for Appaloft-owned secret storage. |
| DEP-RES-PG-NATIVE-009 | Entrypoint contract remains stable | CLI/oRPC/HTTP call provision/delete/bind operations | Operation catalog and transports are inspected | Existing command/query schemas are reused or explicitly extended; no provider SDK shape or raw secret field leaks into transport contracts. |

## Domain Ownership

- Bounded context: Dependency Resources.
- Aggregate owner: `ResourceInstance` owns provider-native realization state, safe provider handle,
  binding readiness, lifecycle status, backup relationship blockers, and deletion admission.
- Application owner: `dependency-resources.provision-postgres` coordinates project/environment
  context, repository persistence, provider capability selection, and realization attempts.
- Provider owner: provider packages implement managed Postgres create/delete/observe capability
  through an application/provider port. Provider SDK types do not cross into `core`.
- Operator/Internal State relationship: provider realization/delete attempts are mirrored into the
  process attempt journal for `operator-work.*` visibility and repair, but provider execution still
  runs inline through the command use cases rather than process-attempt atomic claim/completion.
- Workload Delivery relationship: `ResourceBinding` validates realized ready state before binding.
- Release Orchestration relationship: deployment snapshots may copy safe binding references only;
  they do not run database realization or deletion.

## Public Surfaces

- API/oRPC: keep `POST /api/dependency-resources/postgres/provision` for managed creation and
  `DELETE /api/dependency-resources/{dependencyResourceId}` for managed cleanup after safety.
- CLI: keep `appaloft dependency postgres provision`; add optional `--server <serverId>` for the
  Docker-backed single-server target; keep `appaloft dependency delete`.
- Web/UI: `/dependency-resources` can create Docker-backed managed Postgres on a selected
  single-server target and expose dependency rename/delete, backup create/list/acknowledged
  restore, scheduled backup policy, and Resource dependency bind/unbind affordances through
  existing HTTP/oRPC contracts. Backup prune/delete, export/download, and cross-resource restore
  remain later Web rounds.
- Events: add provider-safe lifecycle event specs during Code Round:
  `dependency-resource-realization-requested`, `dependency-resource-realized`,
  `dependency-resource-realization-failed`, and `dependency-resource-provider-delete-requested`.
- Public docs/help: covered by the `dependency.resource-lifecycle` public docs topic and stable
  help anchor.

## Output Contracts

Dependency resource list/show summaries may add safe provider-native realization fields:

- realization status and last attempt id;
- provider key and safe provider resource handle;
- last realization attempt timestamp and safe failure code/category/phase when failed;
- masked endpoint/connection summary;
- binding readiness derived from realized state;
- delete safety blockers, including backup retention and provider unsafe blockers.

Outputs must not include raw provider credentials, database passwords, access tokens, private keys,
full connection URLs with secrets, provider SDK response bodies, or command output.

## Failure Semantics

- `validation_error`, phase `dependency-resource-validation`
- `not_found`, phase `context-resolution`
- `provider_capability_unsupported`, category `integration`, phase
  `dependency-resource-realization-admission`, retriable `false`
- `provider_error`, category `integration`, phase `dependency-resource-realization`, retriable by
  provider policy
- `dependency_resource_delete_blocked`, category `conflict`, phase
  `dependency-resource-delete-safety`, retriable `false`
- `dependency_resource_provider_delete_failed`, category `integration`, phase
  `dependency-resource-provider-delete`, retriable by provider policy

Every error detail must be safe and must include only stable ids, provider key, operation, phase,
attempt id, and sanitized provider error code/message.

## Non-Goals

- No Redis provider-native lifecycle in this spec.
- No backup pruning.
- No runtime restart or forced redeploy of running workloads.
- No backup export/download or cross-resource restore.
- No deployment retry/redeploy/rollback.
- No provider SDK types in `core`, contracts, CLI, or Web.
- No mutation of historical deployment snapshots.

## Open Questions

The Code Round still keeps a hermetic fallback when no `serverId` is supplied so existing tests and
metadata-only development flows remain stable. The Code Round uses an injected provider capability
with the same safe durable status shape that a later background provider worker or concrete cloud
provider must preserve. The shell provider also materializes safe local realization/delete
artifacts under the configured Appaloft data directory. Provider realization/delete and
backup/restore attempts are mirrored into operator-visible process state; automatic provider retry
execution remains a separate governed worker slice rather than a hidden platform gap.
