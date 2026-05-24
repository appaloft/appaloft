# Redis Dependency Resource Lifecycle

## Status

- Round: Code Round / Post-Implementation Sync
- Artifact state: implemented and aligned
- Roadmap target: Phase 7 / `0.9.0` beta, Day-Two Production Controls
- Compatibility impact: `pre-1.0-policy`, additive public CLI/API/oRPC capability
- Decision state: no-ADR-needed

## Business Outcome

Operators can create or import a Redis dependency resource in Appaloft, inspect safe ownership and
connection metadata, bind ready imported Redis records to Resources as safe dependency references,
rename them, and delete only records that pass explicit safety checks.

This slice extends the existing provider-neutral Dependency Resource lifecycle from Postgres to
Redis. Later Phase 7 slices added provider-native Redis realization, managed Redis binding
admission, runtime environment injection, backup/restore, and Redis closed-loop verification on top
of this provider-neutral baseline.

## Discover Findings

1. `ResourceInstanceKindValue` already includes `redis`, but the public Dependency Resource
   lifecycle and read models are currently Postgres-only.
2. Generic `dependency-resources.list`, `dependency-resources.show`,
   `dependency-resources.rename`, and `dependency-resources.delete` are the correct public
   operations for Redis after their schemas/read models accept `redis`.
3. New write operations are needed only for Redis creation/import because ADR-026 requires explicit
   provider-kind commands instead of a generic dependency create/update bag.
4. Redis import must sanitize URI and ACL-style secret material the same way Postgres import
   sanitizes connection material.
5. No new ADR is needed because this slice reuses ADR-012/014 deployment snapshot boundaries,
   ADR-025 provider/control-plane separation, ADR-026 intention-revealing command naming, and
   ADR-028 command coordination policy.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| RedisDependencyResource | A dependency resource with kind `redis`. | Dependency Resources | Redis resource, cache resource |
| AppaloftManagedRedis | Appaloft-owned control-plane record for a provider-managed Redis instance. | Dependency Resources | managed Redis |
| ImportedExternalRedis | External Redis registered in Appaloft for binding. | Dependency Resources | imported cache |
| RedisEndpoint | Safe host/port/database/TLS metadata for Redis connectivity. | Dependency Resources | Redis connection metadata |
| RedisSecretBoundary | Command input boundary for Redis password, ACL username/password, token, TLS key/cert, or full URI secret material. | Dependency Resources | Redis secret input |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| DEP-RES-REDIS-PROVISION-001 | Provision managed Redis record | Active project/environment context | `dependency-resources.provision` with valid name | A Redis `ResourceInstance` is persisted, marked Appaloft-managed, emits `dependency-resource-created`, and, when provider-native realization is available, records safe provider realization attempt state through the later provider-native realization slice. |
| DEP-RES-REDIS-IMPORT-001 | Import external Redis | Active project/environment context | `dependency-resources.import` supplies endpoint metadata and a secret reference or secret-bearing input | A Redis `ResourceInstance` is persisted as imported-external; read models mask all secret-bearing connection data. |
| DEP-RES-REDIS-VALIDATION-001 | Reject invalid Redis input | Name, host, port, database index, TLS mode, URI, or secret reference is invalid | Redis provision/import runs | Command returns `validation_error`, `phase = dependency-resource-validation`, no mutation. |
| DEP-RES-REDIS-READ-001 | List/show safe Redis summaries | Managed and imported Redis resources exist | `dependency-resources.list` or `dependency-resources.show` runs | Output includes ownership, status, kind `redis`, provider key, binding readiness, backup relationship metadata, and masked Redis connection summary only. |
| DEP-RES-REDIS-READ-002 | Mask Redis secret material | Redis import receives a raw password, ACL credential, token, TLS key/cert, or secret-bearing URI | Any output, event, error, log, or snapshot surface is inspected | Raw secret material is absent and password-like parts are replaced by a stable mask. |
| DEP-RES-REDIS-RENAME-001 | Rename Redis dependency resource | Existing active Redis dependency resource | `dependency-resources.rename` supplies a new name | Only name/slug changes; bindings, backup metadata, provider state, runtime state, and snapshots are unchanged. |
| DEP-RES-REDIS-DELETE-001 | Delete imported external Redis record | Imported external Redis has no blockers | `dependency-resources.delete` runs | Appaloft tombstones/removes the control-plane record and does not imply provider/external Redis deletion. |
| DEP-RES-REDIS-DELETE-002 | Block unsafe Redis delete | Redis has binding, backup, provider-managed unsafe, or retained snapshot/reference blockers | `dependency-resources.delete` runs | Command returns `dependency_resource_delete_blocked`, no mutation, no provider/runtime cleanup. |
| DEP-RES-REDIS-ENTRY-001 | Public Redis operation catalog | Redis lifecycle operations are active | Operation catalog, CLI, and HTTP/oRPC are inspected | Entrypoints dispatch explicit Redis provision/import commands and existing dependency list/show/rename/delete messages; no generic update command is exposed. |
| DEP-BIND-REDIS-BIND-001 | Bind imported Redis to Resource | Active Resource and ready imported Redis share project/environment | `resources.bind-dependency` runs with a safe target name such as `REDIS_URL` | An active `ResourceBinding` is persisted, safe Redis binding summaries are readable, and no provider-native Redis action runs. |
| DEP-BIND-REDIS-SNAPSHOT-001 | Capture Redis binding snapshot reference | Resource has an active ready Redis binding | `deployments.create`, `deployments.plan`, or `deployments.show` reports dependency binding references | Safe references carry kind `redis` without raw Redis connection material or materialized env values; later runtime-injection slices govern safe Redis env delivery and blocked readiness. |

## Domain Ownership

- Bounded context: Dependency Resources.
- Aggregate owner: `ResourceInstance` owns Redis dependency resource identity, kind, ownership,
  lifecycle, source/management mode, provider-neutral endpoint metadata, secret reference, binding
  readiness, backup relationship metadata, and delete safety state.
- Aggregate relationship: `ResourceBinding` owns provider-neutral Resource-to-imported-Redis
  binding metadata and safe snapshot-reference readiness. Provider-native managed Redis admission
  and materialized runtime injection are governed by later provider-native realization and
  runtime-injection slices.
- Upstream/downstream contexts:
  - Workspace provides project/environment context.
  - Workload Delivery binds Resources to ready Redis dependency resources.
  - Release Orchestration snapshots safe Redis binding references.
  - Runtime/provider adapters provision provider-native Redis only after the provider-native Redis
    realization Code Round, and runtime env injection follows ADR-040/ADR-041.

## Public Surfaces

- API/oRPC: use `POST /api/dependency-resources/provision` and
  `POST /api/dependency-resources/import` with `kind = redis`; extend existing list/show/rename/delete routes to
  accept and return `redis`; existing dependency binding and deployment plan/show contracts accept
  Redis safe binding references.
- CLI: use `appaloft dependency provision --kind redis` and `appaloft dependency import --kind redis`; reuse
  `appaloft dependency list/show/rename/delete`; existing dependency binding commands can bind
  ready imported Redis.
- Web/UI: Resource detail exposes dependency resource provision/import/list, rename/delete, backup
  create/list/acknowledged restore, and binding controls through shared commands/read models with
  i18n and tests; scheduled backup policy, backup prune/delete, export/download, and cross-resource
  restore remain later Web slices.
- Config: no repository config fields in this slice.
- Events: reuse generic dependency resource domain events; no Redis-specific event is required.
- Public docs/help: covered by the `dependency.resource-lifecycle` public docs topic and stable
  help anchor.
- MCP/tools: generated descriptors use one operation per command/query; no compound "manage Redis" tool.

## Output Contracts

Redis list/show summaries include:

- dependency resource identity, project/environment ownership, kind `redis`, name, slug, lifecycle
  status;
- management/source mode: `appaloft-managed` or `imported-external`;
- provider key and provider-neutral management metadata;
- safe endpoint fields such as host, port, database index, TLS mode, and masked connection display;
- safe secret reference when present;
- binding readiness summary;
- backup relationship metadata summary;
- delete safety summary when available;
- generated timestamp.

Outputs must not include raw passwords, ACL credentials, tokens, auth headers, cookies, TLS private
keys, provider tokens, sensitive query parameters, raw connection URIs, or materialized environment
values.

## Non-Goals

- No managed Redis binding admission in the original provider-neutral baseline; later Redis
  provider-native realization governs managed Redis readiness.
- No provider-native Redis provisioning/deletion in this baseline artifact.
- No provider-native credential rotation.
- No runtime environment injection in this baseline artifact; ADR-040/041 govern safe runtime
  injection and store-backed secret resolution.
- No backup/restore.
- No deployment retry/redeploy/rollback.
- No runtime cleanup/prune.
- No mutation of historical deployment snapshots.

## Open Questions

- Future provider-specific Redis credential rotation and TLS material delivery need their own
  governed provider/runtime slices.
