# Plan: Runtime Usage Attribution And Monitoring

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Decisions/ADRs: ADR-012, ADR-013, ADR-018, ADR-020, ADR-021, ADR-023, ADR-047, ADR-050,
  ADR-054, ADR-055
- Global contracts:
  - `docs/architecture/adapter-command-query-boundary.md`
  - `docs/architecture/async-lifecycle-and-acceptance.md`
  - `docs/errors/model.md`
  - `docs/errors/neverthrow-conventions.md`
- Local specs:
  - `docs/workflows/deployment-runtime-target-abstraction.md`
  - `docs/specs/055-runtime-artifact-workspace-prune/spec.md`
  - `docs/specs/061-scheduled-runtime-prune-automation/spec.md`
  - `docs/queries/resources.health.md`
  - `docs/queries/resources.runtime-logs.md`
  - `docs/queries/resources.diagnostic-summary.md`
  - `docs/commands/servers.capacity.prune.md`
- Test matrices:
  - `docs/testing/runtime-target-capacity-test-matrix.md`
  - future `docs/testing/runtime-usage-attribution-test-matrix.md`

## Architecture Approach

- Requirement filter: the `0.12.0` slice includes only metrics that answer an operator decision
  about current attribution, capacity pressure, disk class ownership, deployment/runtime context,
  next diagnostic action, or safe deferral to cleanup/sizing specs. It excludes metrics whose only
  value is dashboard completeness.
- Domain/application placement: usage inspection and rollups are query-side observation. Query
  services live in `packages/application` and depend on injected runtime usage reader/sample
  reader ports plus safe read models. They must not mutate aggregates or call runtime adapters
  directly from transports.
- Runtime adapter placement: local-shell, generic-SSH, Docker/Compose, Swarm, and future
  Kubernetes implementations collect target-specific evidence behind a provider-neutral
  `RuntimeUsageInspector` or equivalent port. Adapter code owns shell/Docker/Kubernetes details and
  returns sanitized DTOs only.
- Persistence/read-model impact: time-series samples require a retained sample store with bounded
  retention and scope indexes. The first Code Round can avoid persistence by implementing current
  `runtime-usage.inspect`; `runtime-usage.rollup` should wait for sample retention specs.
- Event/CQRS impact: first slice is read-only query behavior. Background collection, threshold
  evaluation, and alerting become durable process/worker behavior and must use process attempts or
  another ADR-054-compatible delivery boundary.
- Entrypoint impact: CLI, HTTP/oRPC, Web, SDK, and future MCP must share the same query schemas and
  operation catalog entries. Web renders compact cards/charts from query DTOs; it must not compute
  business ownership or parse raw Docker output.

## Recommended Roadmap Slices

### Slice 1: Current Usage Inspect

- Add ADR for runtime usage attribution operation/read-model boundary.
- Add `runtime-usage.inspect` query for one scope: server, project, environment, resource, or
  deployment.
- Reuse existing runtime target capacity primitives where possible.
- Attribute containers/workspaces/artifacts only through Appaloft labels, deployment snapshots, or
  retained runtime identity.
- Add CLI/HTTP/oRPC entrypoints and compact Web readback for server/resource detail.
- Keep output point-in-time with `freshness = live` or `unknown`; no sample persistence required.

### Slice 2: Sample Retention And Rollups

- Add retained sample schema, retention rules, and migration.
- Add disabled-by-default collector worker that records bounded samples through a runtime usage
  reader port.
- Add `runtime-usage.rollup` and `runtime-usage.samples.list` queries.
- Add charts for resource, deployment, project, and server scopes.
- Add sample pruning/retention docs; do not reuse runtime artifact prune for sample rows.

### Slice 3: Threshold Evaluation And Operator Visibility

- Add non-enforcing `runtime-usage-thresholds.configure/show` command/query surfaces.
- Evaluate warning/critical threshold state from current or recent samples.
- Surface threshold state in Web, CLI, API, and operator work.
- Add notification hooks only after public docs and failure/retry behavior are specified.

### Slice 4: Runtime Sizing, Quotas, And Enforcement

- Add a separate ADR before accepting CPU, memory, replicas, restart policy, rollout
  overlap/drain, or quota fields from repository config, Web, CLI, or API.
- Define resource/runtime target profile ownership for sizing values.
- Enforce sizing through runtime target adapters and verify through usage/readiness tests.
- Keep quotas distinct from billing and from threshold-only monitoring.

## Roadmap And Compatibility

- Roadmap target: `0.12.0`.
- Version target: pre-1.0 policy. `0.12.0` should include the read-only attribution slice first;
  sample retention, thresholds, and runtime sizing remain separate pull-forward decisions.
- Compatibility impact: additive query surfaces and read models at first. Thresholds add additive
  policy state. Runtime sizing/enforcement may become breaking for repository config and deployment
  behavior and therefore needs an explicit ADR/version gate.

## Testing Strategy

- Matrix ids: `RT-USAGE-001` through `RT-USAGE-010`.
- Test-first rows:
  - read-only dispatch and adapter boundary for `runtime-usage.inspect`;
  - safe attribution from labels/snapshots and uncertain item handling;
  - aggregation correctness for project/environment/resource/deployment scopes;
  - disk bucket separation for active runtime, rollback candidate, source workspace, Docker
    image/cache, Appaloft state-root, volume, and unknown classes;
  - current deployment/runtime identity visibility when ownership evidence exists;
  - partial/freshness/warning semantics for Docker unavailable, timeout, or unsupported provider;
  - no raw shell output, credentials, secret paths, registry secrets, or environment values in
    output/errors;
  - entrypoint schema parity across CLI and HTTP/oRPC;
  - Web rendering uses typed DTOs and i18n keys;
  - future collector worker records process-attempt visibility for sample failures;
  - unsupported runtime sizing fields remain rejected until the sizing ADR/spec is accepted.
- Acceptance/e2e: start with fake adapter and persisted read-model tests; add opt-in Docker/SSH
  smoke only after destructive behavior is explicitly out of path and fixtures are stable.

## Risks And Migration Gaps

- Container CPU/memory metrics are backend-specific and may be unavailable on some targets; output
  must report partial data rather than normalizing to zero.
- Disk attribution is harder than server disk totals because Docker build cache and unused images
  often lack strong Appaloft ownership. Conservative unattributed/unknown buckets are required.
- Time-series retention can grow quickly; sample resolution and retention must be governed before
  background collection is enabled.
- Runtime usage monitoring overlaps with, but must remain separate from, OpenTelemetry export,
  application APM, billing, quotas, and destructive runtime prune.
- Web charts should avoid implying exact per-project cost allocation until the attribution model is
  proven across Docker/Compose, Swarm, and future targets.
