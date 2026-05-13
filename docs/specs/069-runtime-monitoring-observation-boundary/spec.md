# Runtime Monitoring Observation Boundary

## Status

- Round: Spec Round / accepted boundary planning
- Artifact state: accepted candidate, not implemented
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
| RT-MON-005 | Logs are part of observability | a chart window overlaps runtime or deployment logs | Web renders Observe | runtime logs, deployment logs, and event timeline remain separate queries but are linked and filtered by stable ids/time windows. |
| RT-MON-006 | Non-enforcing thresholds | a monitored signal crosses a warning or critical threshold | Appaloft evaluates threshold state | readback shows warning/critical state and next diagnostic actions, but does not prune, stop, restart, redeploy, reject, resize, scale, throttle, or bill anything. |
| RT-MON-007 | Server surface | an operator opens a server detail page | monitoring data exists | the primary observation view shows server-level CPU, memory, disk, inode, Docker/cache, source workspace, runtime root, warnings, and rollups by resource/deployment. |
| RT-MON-008 | Resource surface | an operator opens a resource detail page | monitoring data exists | the primary observation view shows resource-level charts, current health/access/proxy state, latest deployment markers, runtime logs, deployment logs, and diagnostics links. |
| RT-MON-009 | Project/environment rollups stay shallow | an operator opens project or environment monitoring | multiple resources exist | Appaloft shows rollups and top contributors only; deep diagnosis links to resource or server detail. |
| RT-MON-010 | Prometheus boundary remains closed | a user needs custom metric ingestion, PromQL, APM, traces, long retention, or alert routing | Appaloft evaluates scope | Appaloft documents the external observability handoff instead of adding those capabilities to runtime monitoring. |

## Operation Boundary

Proposed operation keys:

| Operation | Kind | Role | Code Round state |
| --- | --- | --- | --- |
| `runtime-monitoring.samples.list` | Query | Return bounded sanitized sample windows for one scope. | Future Code Round after sample store spec. |
| `runtime-monitoring.rollup` | Query | Return bounded time-window rollups and chart series for one scope. | Future Code Round after sample store spec. |
| `runtime-monitoring-thresholds.configure` | Command | Persist non-enforcing threshold policy for one scope or inherited scope. | Future Code Round after policy spec. |
| `runtime-monitoring-thresholds.show` | Query | Read threshold policy and latest warning/critical evaluation state. | Future Code Round after policy spec. |

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

- CLI: future commands should prefer `appaloft monitor ...` or `appaloft runtime-monitoring ...`
  only after help naming is accepted. Compatibility shortcuts such as `appaloft server monitor
  <serverId>` and `appaloft resource monitor <resourceId>` may dispatch the same query schemas.
- HTTP/oRPC: future read routes must use shared query schemas, likely under
  `/api/runtime-monitoring/*`.
- Web/UI: server and resource detail should expose `Observe` or `Monitoring` as a first-class
  surface; project/environment pages should show rollups and top contributors only.
- Config: no repository config fields for monitoring thresholds until threshold policy specs are
  accepted.
- Events: deployment events may appear as chart markers; monitoring samples are not domain events.
- Public docs/help: add or reuse stable anchors under `observe/*` only after implementation enters
  Docs Round.
- Future MCP/tools: expose the same operation catalog entries; no tool-only metric schema.

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

## Current Implementation Notes And Migration Gaps

- `runtime-usage.inspect` exists as the current read-only attribution query and Web server/resource
  readback.
- Web server/resource pages now expose a first-class Monitor tab that uses `runtime-usage.inspect`
  polling to render browser-local CPU, memory, and disk sparklines plus logs/events/diagnostics
  links. This is a short-term live monitor, not a retained sample store.
- There is no retained runtime monitoring sample store, backend rollup query, sample query,
  threshold policy, or persistent chart history.
- Logs, health, deployment events, access/proxy status, diagnostics, and capacity inspect already
  exist as separate surfaces but are not yet composed into one monitoring loop.
- Public docs should not claim monitoring charts or thresholds exist until Code and Docs Rounds
  implement them.

## Open Questions

- Exact default cadence and retention windows for local/PGlite and PostgreSQL deployments.
- Whether threshold policy inheritance follows `system -> organization -> project -> environment ->
  resource -> server` or a narrower scope set for the first slice.
- Whether collection runs only when a server has active resources or also for idle registered
  servers.
- Whether the Web label should be `Observe` or `Monitoring` in English and Chinese locales.
