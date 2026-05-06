# Redis Provider-Native Realization

## Status

- Round: Code Round
- Artifact state: application realization, bind admission, and provider cleanup implemented;
  persistence/contract/runtime verification follow-ups remain open
- Roadmap target: Phase 7 / `0.9.0` beta, Day-Two Production Controls
- Compatibility impact: `pre-1.0-policy`, semantic upgrade to managed Redis lifecycle
- Decision state: no-ADR-needed; this reuses ADR-025, ADR-026, ADR-036, ADR-040, and ADR-041
  provider/control-plane, command-boundary, backup/restore, runtime-injection, and secret-resolution
  decisions.

## Business Outcome

Operators can provision an Appaloft-managed Redis dependency resource and have Appaloft realize the
provider-native Redis instance through an injected provider capability, then bind it to a Resource,
deploy with a runtime `REDIS_URL`, observe the resulting workload path, and delete the Redis
resource only through explicit safety and provider cleanup rules.

This closes the managed Redis realization gap left by the provider-neutral Redis baseline. It does
not add provider-native Redis credential rotation, scheduled backup policies, runtime cleanup, or
new dependency-specific fields on `deployments.create`.

## Discover Findings

1. `dependency-resources.provision-redis` is already the public command for Appaloft-managed Redis.
   This behavior upgrades that command from metadata-only to managed realization when the selected
   provider supports Redis.
2. The Postgres provider-native realization shape is the correct precedent: `ResourceInstance`
   owns safe provider state while application/provider ports own provider side effects.
3. `resources.bind-dependency` already admits imported Redis and blocks managed Redis until
   provider-native realization exists. Code Round should change only the managed-ready branch.
4. ADR-041 requires Appaloft-owned connection values produced by provider realization to be stored
   behind safe dependency secret refs before runtime injection can be ready.
5. Backup/restore is generic by dependency kind through provider capability checks. Managed Redis
   can participate once ready and supported by the injected backup provider.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| ProviderNativeRedis | A Redis instance created and owned through an Appaloft provider capability. | Dependency Resources | managed Redis |
| RedisRealizationAttempt | Durable attempt to create, observe, or delete provider-native Redis. | Dependency Resources | realization attempt |
| RedisProviderResourceHandle | Safe provider identifier for the managed Redis instance. It is not a secret. | Dependency Resources | provider handle |
| RedisConnectionSecretRef | Safe Appaloft-owned or provider-owned reference to the Redis connection value. | Dependency Resources / Runtime Injection | connection ref |
| ManagedRedisDelete | Provider cleanup plus Appaloft record tombstone after safety checks pass. | Dependency Resources | provider cleanup |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| DEP-RES-REDIS-NATIVE-001 | Accept managed Redis realization | Active project/environment and provider supports managed Redis | `dependency-resources.provision-redis` is admitted | A `redis` `ResourceInstance` and realization attempt are persisted, command returns `ok({ id })`, and provider realization is requested without leaking secrets. |
| DEP-RES-REDIS-NATIVE-002 | Mark realized provider Redis ready | Provider realization succeeds with safe handle, endpoint metadata, and a resolvable connection reference | The realization result is applied | Dependency resource status becomes `ready`, connection summary is safe/masked, binding readiness is `ready`, and `dependency-resource-realized` is emitted for the Redis resource. |
| DEP-RES-REDIS-NATIVE-003 | Surface provider realization failure | Provider realization fails after admission | The realization result is applied | Dependency resource status becomes `degraded`, binding readiness is `blocked`, failure code/category/phase are safe, and the original provision command remains accepted. |
| DEP-RES-REDIS-NATIVE-004 | Reject bind before Redis realization readiness | Managed Redis is pending, failed, unsupported, deleted, or has an unresolved Appaloft-owned connection ref | `resources.bind-dependency` is called | Command returns structured blocked/not-found/conflict result, no binding is persisted, and no provider action runs. |
| DEP-RES-REDIS-NATIVE-005 | Bind realized managed Redis | Managed Redis is realized ready with a resolvable runtime connection ref | `resources.bind-dependency` is called with a target such as `REDIS_URL` | An active `ResourceBinding` is persisted with safe runtime injection metadata, and no raw Redis connection material appears in binding read models or events. |
| DEP-RES-REDIS-NATIVE-006 | Delete managed realized Redis safely | Realized managed Redis has no binding, backup, snapshot/reference, or provider blockers | `dependency-resources.delete` is called | Provider delete is requested/applied, Appaloft tombstones the record only after cleanup state is durable, and no runtime state or deployment snapshot is mutated. |
| DEP-RES-REDIS-NATIVE-007 | Block managed Redis delete while protected | Redis has active binding, backup retention, retained snapshot/reference, or provider unsafe blocker | `dependency-resources.delete` is called | Returns `dependency_resource_delete_blocked`, no provider cleanup is requested. |
| DEP-RES-REDIS-NATIVE-008 | Provider unsupported | Selected provider lacks managed Redis realization | `dependency-resources.provision-redis` is called | Admission returns `provider_capability_unsupported`, `phase = dependency-resource-realization-admission`, and no resource is persisted unless a later spec adds explicit metadata-only mode. |
| DEP-RES-REDIS-NATIVE-009 | Entrypoint contract remains stable | CLI/oRPC/HTTP call provision/delete/bind operations | Operation catalog and transports are inspected | Existing command/query schemas are reused or explicitly extended; no provider SDK shape or raw secret field leaks into transport contracts. |

## Domain Ownership

- Bounded context: Dependency Resources.
- Aggregate owner: `ResourceInstance` owns Redis provider-native realization state, safe provider
  handle, lifecycle status, binding readiness, backup relationship blockers, and deletion
  admission.
- Application owner: `dependency-resources.provision-redis` coordinates context resolution,
  repository persistence, provider capability selection, dependency secret-value storage, and
  realization attempts.
- Provider owner: provider packages implement managed Redis create/delete/observe capability
  through an application/provider port. Provider SDK types do not cross into `core`.
- Workload Delivery relationship: `ResourceBinding` validates realized ready state before binding.
- Release Orchestration relationship: deployment snapshots copy only safe binding references and
  runtime secret refs; they do not run Redis realization or deletion.

## Public Surfaces

- API/oRPC: keep `POST /api/dependency-resources/redis/provision`,
  `POST /api/resources/{resourceId}/dependency-bindings`, and
  `DELETE /api/dependency-resources/{dependencyResourceId}` as the public operations.
- CLI: keep `appaloft dependency redis provision`, `appaloft resource dependency bind`, and
  `appaloft dependency delete`.
- Web/UI: migration gap unless a Docs/Web round adds managed Redis affordances in the Code Round.
- Config: no repository config fields.
- Events: reuse provider-safe dependency realization lifecycle events. Consumers resolve kind from
  the dependency resource id/read model unless a Code Round explicitly extends the event payload.
- Public docs/help: update the dependency resource public help anchor during Code Round or record a
  user-visible migration gap.
- Future MCP/tools: reuse the existing one-operation-per-command catalog entries.

## Output Contracts

Dependency resource list/show summaries may expose safe Redis realization fields:

- realization status and latest attempt id;
- provider key and safe provider resource handle;
- safe endpoint fields such as host, port, database index, TLS mode, and masked connection display;
- safe connection secret ref when present;
- safe failure code/category/phase when failed;
- binding readiness derived from realized state and secret ref resolvability;
- delete safety blockers, including backup retention and provider unsafe blockers.

Outputs must not include raw Redis passwords, ACL credentials, tokens, auth headers, cookies, TLS
private keys, provider tokens, sensitive query parameters, full secret-bearing Redis URLs, provider
SDK response bodies, or command output.

## Failure Semantics

- `validation_error`, phase `dependency-resource-validation`
- `not_found`, phase `context-resolution`
- `provider_capability_unsupported`, category `integration`, phase
  `dependency-resource-realization-admission`, retriable `false`
- `provider_error`, category `integration`, phase `dependency-resource-realization`, retriable by
  provider policy
- `dependency_runtime_injection_blocked`, category `application` or `conflict`, phase
  `dependency-runtime-secret-resolution`, retriable `false` when Appaloft-owned connection refs are
  unresolved
- `dependency_resource_delete_blocked`, category `conflict`, phase
  `dependency-resource-delete-safety`, retriable `false`
- `dependency_resource_provider_delete_failed`, category `integration`, phase
  `dependency-resource-provider-delete`, retriable by provider policy

Every error detail must be safe and include only stable ids, provider key, operation, phase,
attempt id, and sanitized provider error classification.

## Non-Goals

- No provider-native Redis credential rotation.
- No scheduled backup policy, backup prune/delete, dump export, or cross-resource restore.
- No build-time dependency injection.
- No dependency-specific fields on `deployments.create`.
- No runtime cleanup/prune.
- No provider SDK types in `core`, contracts, CLI, Web, events, or public docs.
- No mutation of historical deployment snapshots.

## Open Questions

- Whether the first Code Round uses the same generic managed provider port as Postgres or a
  Redis-specific sibling port is an implementation choice, but the application boundary must remain
  provider-SDK-free.
- Concrete provider package support may begin with a hermetic fake provider; real cloud provider
  onboarding and smoke tests can remain release enablement work if the safe capability contract is
  implemented and tested.
