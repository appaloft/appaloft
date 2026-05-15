# ADR-063: Runtime Monitoring Observation Boundary

Status: Accepted

Date: 2026-05-13

## Context

`0.12.0` introduced `runtime-usage.inspect` as a read-only point-in-time attribution query. It
answers who currently owns runtime capacity signals, but it intentionally does not persist samples,
draw time-window charts, evaluate thresholds, or create a continuous monitoring surface.

Operators still need an Appaloft-native way to maintain deployments without SSHing into targets or
assembling Docker output, logs, deployment events, and health state by hand. The missing product
shape is not a Prometheus-class observability platform. It is a bounded deployment-platform
observation loop that joins:

- runtime usage samples and rollups;
- CPU, memory, disk, inode, Docker artifact/cache, and optional network charts;
- resource runtime logs and deployment logs;
- deployment event markers;
- health, access, proxy, and diagnostic state;
- non-enforcing threshold state.

Existing decisions remain authoritative:

- ADR-018 owns resource runtime log observation.
- ADR-020 owns resource health observation.
- ADR-023 owns runtime target adapter boundaries.
- ADR-047 and ADR-050 own safe runtime artifact, workspace, Docker cache, and image prune.
- ADR-053 owns runtime log archive retention.
- ADR-062 owns current runtime usage attribution and forbids sample persistence in the first slice.

The next monitoring slice needs a durable decision because it adds retained observation state,
time-window query contracts, threshold language, and Web/CLI/API presentation boundaries.

## Decision

Appaloft will model runtime monitoring as a bounded observation layer over Appaloft-managed
deployment targets and resources.

The canonical term is `Runtime monitoring observation`: retained, bounded, sanitized observation of
runtime usage, health, logs, deployment events, and diagnostic state for Appaloft-owned scopes.
Public copy may say "Monitoring" or "Observe", but source-of-truth docs, specs, tests, operation
catalog entries, and code must distinguish:

- `runtime-usage.inspect`: current read-only attribution;
- `runtime-monitoring.samples.list`: bounded raw sample windows for charts and diagnostics;
- `runtime-monitoring.rollup`: bounded time-window rollups for server, project, environment,
  resource, and deployment scopes;
- `runtime-monitoring.thresholds.configure`: non-enforcing threshold policy;
- `runtime-monitoring.thresholds.show`: threshold policy and latest evaluation readback.

Runtime monitoring samples are retained read-side observation records. They are not domain events,
audit rows, billing facts, deployment snapshots, or quota ledgers. Sample writes may be performed by
an internal collector or explicit collection workflow only after the sample store, retention policy,
failure visibility, and test matrix rows are accepted.

Samples must be bounded and sanitized:

- default collection cadence should target operator diagnosis, not high-cardinality metric storage;
- default retention should be short and product-oriented, for example live high-resolution windows
  plus coarser short-term rollups;
- labels must be limited to safe Appaloft identifiers and coarse artifact kinds;
- sample payloads must not contain raw shell output, environment values, credentials, private host
  paths beyond safe Appaloft root summaries, registry secrets, tokens, request payloads, user logs,
  or provider-native unbounded blobs.

Runtime monitoring charts must be decision-oriented. A chart belongs in Appaloft only when it helps
an operator decide whether to inspect logs, compare with a deployment event, run a safe dry-run
cleanup, resize/configure a runtime in a later governed slice, or escalate to an external
observability system.

Runtime logs are part of Appaloft observability, but they remain governed by ADR-018 and ADR-053.
The monitoring surface may link, filter, and correlate resource runtime logs, deployment logs, and
deployment events by time window and stable ids. It must not merge logs into metric samples, persist
every live runtime log line as monitoring data, or replace runtime log archive retention.

Thresholds are non-enforcing observation policies. Crossing a threshold may mark warning or
critical state, appear in Web/API/CLI readback, and guide the next diagnostic action. It must not
stop, restart, prune, redeploy, reject, throttle, resize, scale, or bill anything without a
separate accepted command/spec/ADR.

## Long-Term Boundary

Appaloft runtime monitoring may include:

- short-retention CPU, memory, disk, inode, Docker image/cache, container writable byte, runtime
  root, state root, source workspace, rollback-candidate, and optional network samples;
- server, project, environment, resource, and deployment rollups;
- deployment markers on charts;
- resource health, access, proxy, and diagnostic status in the same Observe surface;
- links from chart windows to relevant runtime logs, deployment logs, event timeline, diagnostic
  summary, `runtime-usage.inspect`, and safe prune dry-runs;
- non-enforcing warning and critical threshold state;
- collector failure visibility through operator work or equivalent process state.

Appaloft runtime monitoring must not become:

- a Prometheus-compatible TSDB;
- a PromQL, LogQL, or arbitrary query-language engine;
- a general dashboard builder;
- a high-cardinality custom metrics ingestion platform;
- application APM, distributed tracing, request-level analytics, business KPI storage, or billing
  analytics;
- an alert-routing product with escalation policies, on-call schedules, dedupe, or incident
  workflow ownership;
- a quota, autoscaling, runtime sizing, cleanup, rollback, restart, or enforcement mechanism.

External observability integrations may be added later as integrations, exporters, or documented
handoff points, but they must not leak provider SDK types or external metric languages into
`core`, `application`, Web components, or public command schemas.

## Consequences

- `runtime-usage.inspect` remains the point-in-time current attribution query.
- Runtime monitoring sample and rollup queries must be separate read operations with explicit
  bounded time-window inputs.
- Threshold configuration is a command because it persists policy, but threshold evaluation remains
  observation and must not mutate runtime targets.
- Runtime monitoring Web UI should be an `Observe` or `Monitoring` surface on resource and server
  detail pages, with project/environment pages showing rollups only.
- Resource logs and deployment logs remain separate query surfaces, but monitoring UI may correlate
  them with charts and event markers.
- CLI, HTTP/oRPC, Web, generated SDK, and MCP/tool descriptors must share operation catalog schemas
  when each slice is implemented.
- Code Round for retained sample and rollup reads can begin after Test-First because local query
  specs, testing matrix rows, retention bounds, and persistence/read-model ownership are accepted
  for `runtime-monitoring.samples.list` and `runtime-monitoring.rollup`.
- Threshold policy writes remain exact-scope. Threshold readback may inherit the nearest parent
  policy only from retained sample scope evidence when no exact policy exists; organization/system
  defaults remain a future governed policy slice.

## Governed Specs

- [Runtime Monitoring Observation Boundary](../specs/069-runtime-monitoring-observation-boundary/spec.md)
- [Runtime Usage Attribution And Monitoring](../specs/068-runtime-usage-attribution-and-monitoring/spec.md)
- [runtime-usage.inspect Query Spec](../queries/runtime-usage.inspect.md)
- [Runtime Usage Attribution Test Matrix](../testing/runtime-usage-attribution-test-matrix.md)
- [Runtime Monitoring Observation Test Matrix](../testing/runtime-monitoring-observation-test-matrix.md)
- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Product Roadmap](../PRODUCT_ROADMAP.md)
- [Adapter Command/Query Boundary](../architecture/adapter-command-query-boundary.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Error Model](../errors/model.md)

## Current Implementation Notes And Remaining Gaps

- `runtime-usage.inspect` is implemented for current attribution. Retained samples, time-window
  rollups, collector process visibility, and a disabled-by-default active-server/resource/
  deployment/project/environment collector runner are implemented.
- Local query specs now accept `runtime-monitoring.samples.list` and `runtime-monitoring.rollup`.
  Application, persistence, collector, scheduled retention dispatch, CLI, HTTP/oRPC, server/resource
  Web Monitor readback, SDK metadata, public docs, and generated MCP/tool descriptors now exist for
  retained monitoring reads.
- Exact-scope `runtime-monitoring.thresholds.configure` and
  `runtime-monitoring.thresholds.show` are implemented through application, PG/PGlite, CLI,
  HTTP/oRPC, server/resource Web Monitor threshold state readback and exact-scope CPU/memory/disk
  threshold configuration, sample-evidence-based parent policy inheritance, SDK metadata, and
  generated MCP/tool descriptor/handler dispatch.
- A short-term Web Monitor now reads retained `runtime-monitoring.samples.list` data when available
  and falls back to `runtime-usage.inspect` browser-local rolling samples for CPU, memory, and disk
  sparklines. It also reads `runtime-monitoring.rollup` for latest deployment markers and top
  contributors. Browser-local samples are not persisted monitoring samples.
- Resource runtime logs, deployment logs, deployment events, health, access, and diagnostics already
  exist as separate observation surfaces. The Web Monitor links to logs/events/diagnostics and
  retained rollup/deployment-marker read models are implemented; full cross-surface time-window
  filtering across logs, events, diagnostics, and monitoring charts remains a later Web Code Round.
- Public docs mention runtime usage inspect, capacity diagnostics, retained sample/rollup read APIs,
  exact-scope threshold policy CLI/API entrypoints, server/resource Web Monitor readback and
  CPU/memory/disk threshold configuration, sample-evidence-based threshold inheritance,
  project/environment rollup-only readback, external observability handoff, and the
  disabled-by-default collector runner without claiming organization/system threshold defaults,
  alert routing, Prometheus-compatible storage, or long-retention analytics exist yet.
