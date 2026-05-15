# Runtime Monitoring Observation Boundary

## Status

- Round: Code Round / server-resource Monitor baseline implemented
- Artifact state: active baseline; retained samples, rollups, deployment markers, threshold
  persistence/readback, sample-evidence-based threshold inheritance, CLI/API/Web readback,
  generated MCP/tool handlers, and disabled-by-default collector runner are implemented
- Roadmap target: post-`0.12.0` / `1.0.0-rc` candidate unless maintainers explicitly pull it into
  a patch release
- Compatibility impact: pre-1.0 policy; additive read surfaces and non-enforcing policy first

## Business Outcome

Operators can keep Appaloft-managed deployments healthy from the product surface without SSHing into
servers or manually combining Docker output, logs, deployment events, health state, and diagnostics.

The next monitoring slice should make the current `0.12.0` usage attribution visible as an
operator-facing observation loop:

1. see short-term CPU, memory, disk, inode, Docker artifact/cache, and optional network pressure;
2. know which server, project, environment, resource, deployment, or artifact class owns usage;
3. line up usage changes with deployment events;
4. jump from charts to runtime logs, deployment logs, health, diagnostics, or safe cleanup dry-runs;
5. see warning/critical threshold state without Appaloft enforcing limits.

The long-term product boundary is deliberately smaller than Prometheus/Grafana. Appaloft owns the
deployment-platform maintenance view. External observability systems own deep metrics, custom
queries, APM, traces, dashboards, incident routing, and long-retention analytics.

## Operator Questions

| Question | Required Appaloft answer | Boundary |
| --- | --- | --- |
| Did this deployment change CPU, memory, disk, or log behavior? | Chart markers and links to deployment events/logs. | Required for Slice 2. |
| Is a resource or server under pressure right now? | Recent samples, rollups, freshness, and threshold state. | Required for Slice 2. |
| Which resource/deployment/artifact owns disk or memory usage? | Safe attribution inherited from `runtime-usage.inspect` evidence. | Required for Slice 2. |
| What should I inspect next? | Links to runtime logs, deployment logs, diagnostics, capacity inspect, and prune dry-run. | Required for Slice 2 UI. |
| Can Appaloft warn before capacity becomes dangerous? | Non-enforcing warning/critical threshold state. | Required for threshold slice; no enforcement. |
| Can Appaloft be my full metrics platform? | No. Use external observability integrations for that. | Explicit non-goal. |

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Runtime monitoring observation | Bounded retained observation of Appaloft runtime usage, health, logs, deployment events, and diagnostics. | DeploymentTarget runtime observation / Resource observation | monitoring, observe |
| Runtime monitoring sample | One sanitized point-in-time observation retained for chart windows and rollups. | Read model / monitoring store | metric sample |
| Runtime monitoring rollup | Aggregated sample values for one scope and time window. | Query read model | usage chart data, metrics rollup |
| Monitoring threshold | Non-enforcing warning or critical policy over a monitored signal. | Observation policy | alert threshold |
| Deployment marker | A chart annotation derived from deployment event/read-model state. | Web/API read model | release marker |
| Observe surface | Product UI surface that joins charts, logs, events, health, diagnostics, and next actions. | Web / public docs | monitoring page |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| RT-MON-001 | Bounded sample retention | monitoring collection is enabled for a server or resource | a collector records samples | Appaloft stores sanitized CPU, memory, disk, inode, Docker artifact/cache, and optional network observations with bounded cadence, retention, safe labels, freshness, partial state, and source errors. |
| RT-MON-002 | Rollup query | an operator opens a server, project, environment, resource, or deployment monitoring window | Appaloft reads rollups | the query returns bounded time-window series and totals without mutating runtime targets or loading aggregates for business predicates. |
| RT-MON-003 | Raw sample query | an operator or diagnostic tool requests a small chart window | Appaloft reads samples | the query returns bounded sanitized samples for the requested scope and interval, never raw shell output or unbounded provider payloads. |
| RT-MON-004 | Chart/event correlation | a resource has deployment events inside the selected window | Web renders monitoring | charts include deployment markers and let users navigate to deployment events and logs without implying causality when evidence only shows time correlation. |
| RT-MON-005 | Handoffs are part of observability | a chart window overlaps runtime logs, deployment logs, events, diagnostics, or safe cleanup inspection | Web renders Observe | runtime logs, deployment logs, event timeline, diagnostics, and safe cleanup dry-run remain separate query/command surfaces but are linked and filtered by stable ids/time windows where applicable. |
| RT-MON-006 | Non-enforcing thresholds | a monitored signal crosses a warning or critical threshold | Appaloft evaluates threshold state | readback shows warning/critical state and next diagnostic actions, but does not prune, stop, restart, redeploy, reject, resize, scale, throttle, or bill anything. |
| RT-MON-007 | Server surface | an operator opens a server detail page | monitoring data exists | the primary observation view shows server-level CPU, memory, disk, inode, Docker/cache, source workspace, runtime root, warnings, and rollups by resource/deployment. |
| RT-MON-008 | Resource surface | an operator opens a resource detail page | monitoring data exists | the primary observation view shows resource-level charts, current health/access/proxy state, latest deployment markers, runtime logs, deployment logs, diagnostics links, and a safe storage cleanup dry-run handoff. |
| RT-MON-009 | Project/environment rollups stay shallow | an operator opens project or environment monitoring | multiple resources exist | Appaloft shows rollups and top contributors only; deep diagnosis links to resource or server detail. |
| RT-MON-010 | Prometheus boundary remains closed | a user needs custom metric ingestion, PromQL, APM, traces, long retention, or alert routing | Appaloft evaluates scope | Appaloft documents the external observability handoff instead of adding those capabilities to runtime monitoring. |

## Operation Boundary

Proposed operation keys:

| Operation | Kind | Role | Code Round state |
| --- | --- | --- | --- |
| `runtime-monitoring.samples.list` | Query | Return bounded sanitized sample windows for one scope. | Application/PG, CLI, HTTP/oRPC, server/resource Web Monitor readback, SDK metadata, and generated MCP/tool descriptors implemented. |
| `runtime-monitoring.rollup` | Query | Return bounded time-window rollups and chart series for one scope. | Application/PG, CLI, HTTP/oRPC, server/resource Web Monitor summary and marker readback, SDK metadata, and generated MCP/tool descriptors implemented. |
| `runtime-monitoring.thresholds.configure` | Command | Persist non-enforcing threshold policy for one exact monitoring scope. | Application command/use case, PG/PGlite policy persistence, CLI, HTTP/oRPC, server/resource Web Monitor exact-scope CPU/memory/disk threshold configuration, SDK metadata, and generated MCP/tool descriptor/handler dispatch implemented. Web saves inherited readback as an exact-scope override instead of mutating the parent policy. |
| `runtime-monitoring.thresholds.show` | Query | Read threshold policy and latest warning/critical evaluation state. | Application query service, PG/PGlite policy readback/evaluation, sample-evidence-based parent policy inheritance, CLI, HTTP/oRPC, server/resource Web Monitor readback, SDK metadata, and generated MCP/tool descriptor/handler dispatch implemented. |

These operations extend `runtime-usage.inspect`; they do not replace it. Point-in-time inspection
remains the current attribution query.

## Domain Ownership

- Bounded context: DeploymentTarget runtime observation with Resource observation read-model
  collaboration.
- Aggregate/resource owner: `DeploymentTarget` supplies target identity and runtime backend
  capability; `Resource` and `Deployment` supply safe ownership context through read models,
  events, and snapshots.
- Read model owner: application monitoring query services over retained sample and rollup records.
- Adapter owner: runtime target adapters collect sanitized provider-neutral observations.
- Persistence owner: `packages/persistence/pg` stores retained samples, rollups, and threshold
  policies when implemented.

## Public Surfaces

- CLI: `appaloft runtime-monitoring samples ...`, `appaloft runtime-monitoring rollup ...`,
  `appaloft runtime-monitoring thresholds configure ...`, and
  `appaloft runtime-monitoring thresholds show ...` dispatch through the shared command/query
  boundary. Compatibility shortcuts such as `appaloft server monitor <serverId>` and
  `appaloft resource monitor <resourceId>` may dispatch the same query schemas in a future
  affordance slice.
- HTTP/oRPC: `/api/runtime-monitoring/samples`, `/api/runtime-monitoring/rollup`, and
  `/api/runtime-monitoring/thresholds` use shared command/query schemas.
- Web/UI: server and resource detail expose a first-class Monitor tab with retained samples,
  sparklines, rollup summaries, deployment markers, top contributors, logs/events/diagnostics
  links, threshold readback, and exact-scope CPU/memory/disk threshold configuration. Project detail exposes
  project and selected-environment rollup-only readback with top contributors and deep links.
- Config: monitoring threshold policy is stored as exact-scope application state. Readback may
  inherit the nearest parent policy from retained sample scope evidence when no exact policy exists.
  There are no repository config fields, organization/system defaults, or sample-free inferred
  parent relationships in the current slice.
- Events: deployment events may appear as chart markers; monitoring samples are not domain events.
- Public docs/help: stable diagnostics anchors under `observe/*` describe the first sample and
  rollup read APIs.
- MCP/tools: generated descriptors expose the same operation catalog entries; runtime monitoring
  tool handlers dispatch through the same query messages and must not introduce tool-only metric
  schemas.

## First Retained Monitoring Slice

The first retained monitoring Code Round is limited to `runtime-monitoring.samples.list` and
`runtime-monitoring.rollup`.

Accepted retention and query bounds:

- default collector cadence: 60 seconds;
- minimum supported cadence: 30 seconds;
- local/PGlite raw sample retention: 6 hours by default;
- PostgreSQL raw sample retention: 24 hours by default;
- sample list windows: 24 hours maximum and 720 samples maximum;
- rollup windows: 14 days maximum and 720 buckets maximum;
- supported rollup buckets: minute, five-minute, and hour.

The first slice may compute rollups from retained raw samples at read time. A separate precomputed
rollup table is optional and must follow the same retention and sanitization rules if added.

Sample collection is disabled by default and starts only when the shell collector runner is
explicitly enabled. The internal collector service can call the `runtime-usage.inspect` query
boundary, record durable process visibility, and write sanitized retained samples through the
PG/PGlite sample write store. The shell background collector runner can collect samples for active
servers and for resources, deployments, projects, and environments that already have
runtime-owning resources after explicit enablement. Retention pruning is wired through the
disabled-by-default scheduled history retention runner and the PG/PGlite sample retention store.
Query surfaces may exist before collection is enabled, but they must return explicit `partial`,
freshness, and source-error sections when no retained samples exist.

## Long-Term Non-Goals

- Prometheus-compatible storage, scraping, or PromQL.
- Grafana-style dashboard building or arbitrary chart composition.
- High-cardinality custom metric ingestion.
- Application-level APM, distributed tracing, request analytics, or business KPI storage.
- Long-retention billing, cost allocation, or chargeback analytics.
- Alert routing, on-call schedules, dedupe, escalation policies, or incident workflow ownership.
- Runtime sizing, quota, autoscaling, cleanup, rollback, restart, redeploy, stop/start, throttle,
  or enforcement.
- Raw Docker, provider SDK, shell, or host-specific metric payloads in public contracts.

## Current Implementation Notes And Governed Follow-Ups

- `runtime-usage.inspect` exists as the current read-only attribution query and Web server/resource
  readback.
- `RT-MON-*` acceptance rows are governed by the dedicated
  [Runtime Monitoring Observation Test Matrix](../../testing/runtime-monitoring-observation-test-matrix.md).
  The runtime usage attribution matrix remains the `RT-USAGE-*` source of truth for the
  point-in-time attribution query.
- Web server/resource pages now expose a first-class Monitor tab that reads retained
  `runtime-monitoring.samples.list` data and `runtime-monitoring.thresholds.show` state when
  available, including exact-scope policies or the nearest parent policy derivable from retained
  sample scope evidence. It also reads `runtime-monitoring.rollup` for backend rollup summaries and
  latest deployment marker/top-contributor readback. It falls back to `runtime-usage.inspect`
  browser-local CPU, memory, and disk live samples when retained data is absent. The surface links
  to logs/events/diagnostics and, for resources, the storage cleanup dry-run surface with the
  observation window as the default cleanup cutoff; it does not duplicate log retention into
  monitoring samples or trigger cleanup directly.
- The first retained monitoring backend slice now has application query schemas/handlers/services,
  operation-catalog entries, a PG/PGlite `runtime_monitoring_samples` table, a PG sample read model,
  PG/PGlite sample write and retention prune stores, an internal collector service with durable
  process visibility, and a PG deployment marker read model. Backend rollups are computed from
  retained raw samples at read time. Project and environment rollups stay shallow: they summarize
  retained evidence and top contributors from resource/deployment/server samples without treating
  the project or environment scope as a runtime-state owner.
- The disabled-by-default shell background collector runner now selects active server targets and
  resource/deployment/project/environment targets derived from runtime-owning resources, then
  writes retained samples through the internal collector service. Runtime monitoring MCP/tool
  server registration now lists and dispatches `runtime-monitoring.samples.list`, `runtime-monitoring.rollup`,
  `runtime-monitoring.thresholds.configure`, and `runtime-monitoring.thresholds.show` through the
  shared command/query boundary. Full Observe visual/browser verification now covers the
  server/resource Monitor surfaces and project/environment rollup-only surfaces in WebView.
  Scheduled history retention can now run `runtime-monitoring-samples` policies through the PG/PGlite sample
  retention store. CLI, HTTP/oRPC, SDK operation metadata, generated MCP/tool descriptors,
  operation docs metadata, and public diagnostics documentation now exist for sample, rollup, and
  threshold reads/configuration.
- Logs, health, deployment events, access/proxy status, diagnostics, and capacity inspect remain
  separate governed surfaces while Web Monitor composes them into the current observation loop
  through stable scope/window handoffs instead of copying those records into monitoring samples.
- Public docs distinguish server/resource Monitor retained-sample/threshold readback,
  project/environment rollup-only readback, exact-scope CPU/memory/disk threshold configuration,
  sample-evidence-based threshold inheritance, current WebView coverage, and Monitor-window
  handoffs into runtime logs, deployment lists, deployment logs, and resource diagnostics.
- Threshold command/query specs now exist for exact-scope non-enforcing policy configuration,
  sample-evidence-based parent policy inheritance, and safe latest-state readback. Threshold
  persistence, CLI/API adapters, SDK metadata, generated MCP/tool descriptor/handler dispatch, Web
  readback, server/resource Web Monitor CPU/memory/disk threshold configuration, and evaluation code
  are implemented.
- `RT-MON-010` now has catalog and public-docs guard coverage: runtime monitoring operation keys
  remain limited to retained samples, rollups, and non-enforcing thresholds, and public diagnostics
  docs carry an explicit external observability handoff for Prometheus/PromQL, custom metrics,
  APM/tracing, dashboards, alert routing, billing analytics, autoscaling, quota, and long-retention
  analytics.
- `RT-MON-005` now has Web/API guard coverage for the current server/resource Monitor surfaces:
  logs, deployment events, health/access/proxy state, and diagnostics remain separate operation
  surfaces, Monitor links to logs/events/diagnostics with stable
  `runtimeMonitoringFrom`/`runtimeMonitoringTo`/scope handoff parameters, resource runtime-log
  reads consume the Monitor window as `since`, resource/server deployment lists filter by the same
  window, and resource diagnostic summaries pass `observationFrom`/`observationTo` into the shared
  query so copied deployment/runtime log evidence stays scoped. Monitoring samples/rollups do not
  persist or copy log lines.

## Open Questions

- Whether later organization/system threshold defaults should be modeled as repository config,
  organization policy, or explicit monitoring policy records.
- Whether future collector target selection should move from derived runtime-owning resources to an
  explicit monitoring policy.
- Whether the Web label should be `Observe` or `Monitoring` in English and Chinese locales.
