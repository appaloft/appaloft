# Dependency Binding Deployment Snapshot Reference Baseline

## Status

- Round: Spec Round
- Artifact state: ready for Test-First / Code Round
- Roadmap target: Phase 7 / `0.9.0` beta, Day-Two Production Controls
- Compatibility impact: `pre-1.0-policy`, additive deployment snapshot/read-model schema
- Decision state: no-ADR-needed

## Business Outcome

Operators who bind a Postgres or imported Redis dependency resource to a Resource can see that a
later deployment attempt recognized the binding and recorded safe dependency binding references in
the immutable deployment snapshot.

The snapshot reference baseline must help users inspect "this deployment knew about this dependency
binding" without exposing raw connection secrets, materialized environment values, or implying that
runtime environment injection is implemented.

This first slice established provider-neutral binding snapshot references that later runtime env
injection, secret rotation, backup/restore, and provider-native database realization can reuse.

## Discover Findings

1. `ResourceBinding` is already the canonical write-side association between a Resource and a
   Dependency Resource. It stores provider-neutral safe metadata and explicitly keeps runtime env
   injection and deployment snapshot materialization out of the first binding slice.
2. ADR-012 and ADR-014 already define the deployment snapshot boundary: `deployments.create`
   consumes Resource-owned profile state and persists immutable attempt context. This slice fits
   that boundary by copying safe binding references into the deployment attempt snapshot.
3. Safe binding references belong to the Deployment attempt snapshot and deployment read surfaces,
   not to runtime plan input. Runtime plan input is consumed by runtime adapters; placing binding
   references there would look like runtime injection.
4. `deployments.plan` is a read-only preview and should report the same safe binding readiness
   summary without creating a deployment or snapshot row.
5. Removed bindings are not active and must not be included in a new snapshot reference set.
6. Missing or not-ready binding dependencies are not deployment admission blockers in this slice
   because runtime injection remains deferred. They are safe readiness diagnostics for plan/show
   surfaces and future injection work. ADR-040 governs the later runtime injection behavior that
   will turn non-injectable active bindings into deployment admission blockers.
7. No ADR was needed for this safe-reference slice because it did not change deployment admission,
   runtime env injection, provider contracts, rollback semantics, retry semantics, or snapshot
   immutability.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| DependencyBindingSnapshotReference | Immutable safe reference copied from an active ResourceBinding into one deployment attempt snapshot. | Release Orchestration / Dependency Resources | dependency binding reference |
| SnapshotReadiness | Whether a binding can be safely recorded as snapshot reference metadata. | Release Orchestration | snapshot readiness |
| RuntimeInjectionReadiness | Whether the binding is currently materialized into runtime environment/file/reference delivery. | Runtime / Dependency Resources | env injection readiness |
| Safe Binding Reference | Binding metadata that excludes raw secrets and materialized env values. | Dependency Resources | safe reference |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| DEP-BIND-SNAP-REF-001 | Snapshot includes active Postgres binding references | Resource has an active Postgres dependency binding with ready dependency metadata | `deployments.create` accepts a deployment | The deployment attempt snapshot includes one safe reference with binding id, dependency resource id, kind, target name, scope, injection mode, and ready snapshot readiness. |
| DEP-BIND-SNAP-REF-002 | Snapshot excludes raw secrets and materialized env | Bound Postgres dependency was imported with secret-bearing connection material | Deployment snapshot, `deployments.show`, and `deployments.plan` are read | No raw connection URL, password, token, auth header, cookie, provider credential, secret value, sensitive query parameter, or materialized env value appears. |
| DEP-BIND-SNAP-REF-003 | Removed binding is not snapshotted | Resource had a binding that was unbound before deployment | `deployments.create` accepts a deployment | The removed binding is absent from the dependency binding snapshot reference list. |
| DEP-BIND-SNAP-REF-004 | Not-ready binding is diagnostic only | Resource has an active binding whose dependency metadata is not ready for safe snapshot reference | `deployments.plan` or `deployments.create` evaluates the resource | Deployment admission is not blocked in this slice; plan/show readiness reports blocked snapshot readiness and runtime injection remains deferred. |
| DEP-BIND-SNAP-REF-005 | Plan preview reports binding readiness without side effects | Resource has an active Postgres dependency binding | `deployments.plan` runs | The preview reports dependency binding snapshot readiness and runtime injection deferred without creating a deployment id, snapshot row, events, or runtime work. |
| DEP-BIND-SNAP-REF-006 | Deployment show reports immutable binding snapshot | Deployment was accepted with dependency binding references | `deployments.show` reads the attempt snapshot | The snapshot section reports the immutable binding references captured at admission, not the Resource's current binding state. |
| DEP-BIND-REDIS-SNAPSHOT-001 | Snapshot includes active imported Redis binding references | Resource has an active imported Redis dependency binding with ready dependency metadata | `deployments.create`, `deployments.plan`, or `deployments.show` reports dependency binding references | Safe references carry kind `redis` without raw Redis connection material or materialized env values; runtime injection remains deferred until ADR-040 Code Round. |

## Domain Ownership

- Bounded context: Release Orchestration, coordinated with Dependency Resources.
- Aggregate/resource owner:
  - `ResourceBinding` owns current binding lifecycle and target metadata.
  - `Deployment` owns the immutable copied binding references for one attempt.
  - Runtime adapters do not own binding admission or secret materialization in this slice.
- Upstream/downstream contexts:
  - Dependency Resources supplies active safe binding summaries.
  - Release Orchestration snapshots safe references during deployment admission.
  - Runtime/provider adapters later consume explicit runtime injection specs, not this slice.

## Public Surfaces

- API/oRPC: existing `deployments.plan` and `deployments.show` response schemas add optional safe
  dependency binding snapshot/readiness summaries.
- CLI: existing `appaloft deployments plan` and `appaloft deployments show --json` expose the same
  JSON fields when present. Human output may show a safe compact summary.
- Web/UI: no new write UI. Existing read surfaces may consume the typed fields; no new Web UI is
  required in this slice.
- Config: no repository config fields.
- Events: no new domain or integration events.
- Public docs/help: record Phase 7 docs migration gap unless a Docs Round expands public pages.
- Future MCP/tools: future tools should reuse `deployments.plan` and `deployments.show` schemas.

## Output Contracts

Deployment snapshot and deployment read surfaces may expose:

- binding id;
- dependency resource id;
- dependency kind, currently `postgres` or `redis`;
- target name;
- scope;
- injection mode;
- snapshot readiness status/reason;
- runtime injection readiness as `deferred`.

They must not expose:

- raw connection URLs;
- passwords, tokens, auth headers, cookies, SSH credentials, provider tokens, private keys;
- sensitive query parameters;
- raw secret values;
- materialized environment variable values;
- provider-native connection payloads.

## Non-Goals

- No runtime env injection.
- No raw secret materialization.
- No secret rotation.
- No backup/restore.
- No runtime delivery of Redis bindings; safe imported Redis references are covered by
  [Redis Dependency Resource Lifecycle](../037-redis-dependency-resource-lifecycle/spec.md).
- No provider-native database realization.
- No deployment retry/redeploy/rollback.
- No runtime cleanup/prune.
- No Web write UI.

## Open Questions

- Runtime injection is now governed by
  [ADR-040](../../decisions/ADR-040-dependency-binding-runtime-injection-boundary.md) and
  [Dependency Binding Runtime Injection](../047-dependency-binding-runtime-injection/spec.md).
