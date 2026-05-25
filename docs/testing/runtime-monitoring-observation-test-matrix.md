# Runtime Monitoring Observation Test Matrix

## Scope

This matrix governs `RT-MON-*` runtime monitoring observation behavior.

Runtime monitoring extends `runtime-usage.inspect` with retained sanitized samples, bounded
rollups, deployment markers, log/event/diagnostic links, and non-enforcing threshold state. It does
not replace the point-in-time runtime usage attribution boundary, and it must not become cleanup,
quota, runtime sizing, autoscaling, alert routing, Prometheus-compatible storage, APM/tracing, or a
general dashboard/query engine.

## Governing Sources

- [ADR-063: Runtime Monitoring Observation Boundary](../decisions/ADR-063-runtime-monitoring-observation-boundary.md)
- [Runtime Monitoring Observation Boundary](../specs/069-runtime-monitoring-observation-boundary/spec.md)
- [runtime-monitoring.samples.list Query Spec](../queries/runtime-monitoring.samples.list.md)
- [runtime-monitoring.rollup Query Spec](../queries/runtime-monitoring.rollup.md)
- [runtime-monitoring.thresholds.configure Command Spec](../commands/runtime-monitoring-thresholds.configure.md)
- [runtime-monitoring.thresholds.show Query Spec](../queries/runtime-monitoring-thresholds.show.md)
- [ADR-072: Repository Config Runtime Monitoring Thresholds](../decisions/ADR-072-repository-config-runtime-monitoring-thresholds.md)
- [Repository Config Runtime Monitoring Thresholds](../specs/081-repository-config-runtime-monitoring-thresholds/spec.md)
- [Runtime Usage Attribution Test Matrix](./runtime-usage-attribution-test-matrix.md)
- [Runtime Target Capacity Test Matrix](./runtime-target-capacity-test-matrix.md)
- [Adapter Command/Query Boundary](../architecture/adapter-command-query-boundary.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [Error Model](../errors/model.md)

## Matrix

| ID | Behavior | Level | Automation |
| --- | --- | --- | --- |
| RT-MON-001 | Runtime monitoring collection stores only bounded sanitized samples with cadence, retention, freshness, partial state, warnings, source errors, and safe Appaloft labels. It never stores raw shell output, secrets, private paths, unbounded provider payloads, or runtime logs as samples. | Collector/persistence | Internal collector orchestration through the `runtime-usage.inspect` query boundary and retry-scheduled process visibility are automated in `packages/application/test/runtime-monitoring-collector.test.ts`; PG/PGlite sample schema, write-store readback, read-model filtering, signal filtering, safe label readback, dry-run pruning, scope-bounded pruning, and cutoff boundary behavior are automated in `packages/persistence/pg/test/runtime-monitoring-read-model.pglite.test.ts`; scheduled history retention dispatch to the runtime monitoring sample prune store is automated in `packages/application/test/scheduled-history-retention.test.ts`; disabled-by-default active-server/resource/deployment/project/environment background collector runner selection and safe failure logging are automated in `apps/shell/test/runtime-monitoring-collector-runner.test.ts`. |
| RT-MON-002 | `runtime-monitoring.rollup` returns bounded time-window series and totals for server, project, environment, resource, and deployment scopes without mutating runtime targets or loading aggregates for business predicates. | Application/read model/Web | Application rollup assembly, top-contributor ordering, and shallow project rollup behavior are automated in `packages/application/test/runtime-monitoring-query.test.ts`; PG sample/marker read models are automated in `packages/persistence/pg/test/runtime-monitoring-read-model.pglite.test.ts`; CLI dispatch is automated in `packages/adapters/cli/test/runtime-monitoring-command.test.ts`; HTTP/oRPC dispatch is automated in `packages/orpc/test/runtime-monitoring.http.test.ts`; generated MCP descriptor and handler dispatch through the shared query boundary are automated in `packages/ai/mcp/test/tool-descriptors.test.ts`; server/resource Web Monitor rollup readback and project/environment rollup-only readback are covered in `apps/web/src/lib/console/runtime-usage.test.ts`. |
| RT-MON-003 | `runtime-monitoring.samples.list` returns a bounded sanitized sample window for diagnostics and charts, with missing metric sources represented as partial/source-error state rather than zero usage. | Application/API/Web | Application bounded-window validation and sample DTO readback are automated in `packages/application/test/runtime-monitoring-query.test.ts`; PG/PGlite sample read-model coverage is automated in `packages/persistence/pg/test/runtime-monitoring-read-model.pglite.test.ts`; CLI dispatch is automated in `packages/adapters/cli/test/runtime-monitoring-command.test.ts`; HTTP/oRPC dispatch is automated in `packages/orpc/test/runtime-monitoring.http.test.ts`; generated MCP descriptor, handler dispatch, and schema-error behavior without dispatch are automated in `packages/ai/mcp/test/tool-descriptors.test.ts`; server/resource Web Monitor readback is covered in `apps/web/src/lib/console/runtime-usage.test.ts`. |
| RT-MON-004 | Web chart deployment markers are derived from deployment events/read models and represent time correlation only; they do not claim causal analysis. | Web/API/read model | Application marker DTO behavior and PG deployment marker readback are automated in `packages/application/test/runtime-monitoring-query.test.ts` and `packages/persistence/pg/test/runtime-monitoring-read-model.pglite.test.ts`; server/resource Web Monitor marker-count and latest marker list readback are covered in `apps/web/src/lib/console/runtime-usage.test.ts`; WebView marker rendering is automated in `apps/web/test/e2e-webview/home.webview.test.ts`. |
| RT-MON-005 | Runtime logs, deployment logs, deployment events, health, access, diagnostics, and safe cleanup dry-runs remain separate governed query/command surfaces. The Observe UI may hand off current monitoring time-window and stable scope ids to those surfaces, but must not duplicate log retention into monitoring samples or trigger cleanup directly. | Web/application | Operation-catalog separation coverage is automated in `packages/application/test/operation-catalog-boundary.test.ts`; server/resource Web Monitor links, `runtimeMonitoringFrom`/`runtimeMonitoringTo`/`runtimeMonitoringScopeKind`/`runtimeMonitoringScopeId` handoff parameters, resource runtime-log `since` consumption, resource/server deployment window filtering, diagnostic summary `observationFrom`/`observationTo` dispatch, resource storage cleanup dry-run cutoff handoff, and no log-line persistence/source-copying guards are automated in `apps/web/src/lib/console/runtime-usage.test.ts`; diagnostic query-service window filtering is automated by `RES-DIAG-QRY-020` in `packages/application/test/resource-diagnostic-summary.test.ts`; the resource Monitor to storage cleanup handoff is covered in `apps/web/test/e2e-webview/home.webview.test.ts`. |
| RT-MON-006 | Runtime monitoring thresholds are non-enforcing warning/critical policy. Crossed thresholds create readback/operator visibility only and never prune, stop, restart, redeploy, reject, throttle, resize, scale, bill, or mutate runtime targets. | Application/command/query/Web | Application configure/show command-query coverage, validation, disabled-policy behavior, latest-sample evaluation, sample-evidence-based inherited policy readback, exact-scope override precedence, and no-runtime-mutation boundary are automated in `packages/application/test/runtime-monitoring-thresholds.test.ts`; PG/PGlite exact-scope policy upsert/readback is automated in `packages/persistence/pg/test/runtime-monitoring-read-model.pglite.test.ts`; CLI dispatch is automated in `packages/adapters/cli/test/runtime-monitoring-command.test.ts`; HTTP/oRPC dispatch is automated in `packages/orpc/test/runtime-monitoring.http.test.ts`; generated MCP descriptor/handler dispatch is automated in `packages/ai/mcp/test/tool-descriptors.test.ts`; server/resource Web Monitor threshold readback, exact-scope CPU/memory/disk threshold editing with preservation of other advanced rules, and inherited-readback exact-scope override input building are covered in `apps/web/src/lib/console/runtime-usage.test.ts`. |
| RT-MON-007 | Server Observe surface shows server-level CPU, memory, disk, inode, Docker/cache, source workspace, runtime root, warnings, and resource/deployment rollups from typed DTOs and i18n keys. | Web | Server Monitor tab, retained sample readback, rollup summary/latest marker/top-contributor readback, threshold-state readback, browser-local CPU/memory/disk fallback sparkline derivation, and i18n wiring are covered in `apps/web/src/lib/console/runtime-usage.test.ts`; server Monitor WebView rendering is automated in `apps/web/test/e2e-webview/home.webview.test.ts`. |
| RT-MON-008 | Resource Observe surface shows resource-level charts, current health/access/proxy state, latest deployment markers, runtime logs, deployment logs, diagnostics links, and a handoff to storage cleanup dry-run from typed DTOs and i18n keys. | Web | Resource Monitor tab, retained sample readback, rollup summary/latest marker/top-contributor readback, threshold-state readback, logs/events/diagnostics/cleanup links, browser-local fallback samples, and i18n wiring are covered in `apps/web/src/lib/console/runtime-usage.test.ts`; resource Monitor WebView rendering and cleanup handoff are automated in `apps/web/test/e2e-webview/home.webview.test.ts`. |
| RT-MON-009 | Project and environment monitoring stays rollup-only with top contributors and deep links to resource/server detail; those scopes do not become owners of runtime state or resource-level diagnosis. | Application/Web | Application shallow project rollup and top-contributor ordering are automated in `packages/application/test/runtime-monitoring-query.test.ts`; Project detail Web rollup-only readback for project and selected environment scopes is automated in `apps/web/src/lib/console/runtime-usage.test.ts`; project/environment rollup WebView rendering and scoped request dispatch are automated in `apps/web/test/e2e-webview/home.webview.test.ts`. |
| RT-MON-010 | Prometheus-compatible storage/querying, custom metric ingestion, APM/tracing, dashboard builders, alert routing, billing analytics, quota, autoscaling, cleanup, and enforcement remain out of Appaloft runtime monitoring scope. | Contract/docs/review | Operation catalog scope guard is automated in `packages/application/test/operation-catalog-boundary.test.ts`; public docs handoff coverage is automated in `packages/docs-registry/test/help-topics.test.ts`. |
| RT-MON-011 | Repository config may declare exact Resource-scope non-enforcing threshold policy through `monitoring.thresholds`; config deploy must not mutate inherited parent policies or add monitoring fields to `deployments.create`. | Config workflow | Parser and CLI workflow coverage is tracked by `CONFIG-FILE-MONITORING-THRESHOLDS-001` through `CONFIG-FILE-MONITORING-THRESHOLDS-005` in `docs/testing/deployment-config-file-test-matrix.md` and automated in `packages/deployment-config/test/appaloft-config.test.ts` plus `packages/adapters/cli/test/deployment-config.test.ts`. |

## Current Implementation Notes And Governed Follow-Ups

- Web Observe e2e coverage for server/resource Monitor surfaces and project/environment
  rollup-only surfaces is automated in `apps/web/test/e2e-webview/home.webview.test.ts`. Current Web
  automation covers Monitor tab readback, retained samples, backend rollup summaries, latest
  markers, top contributors, threshold state, exact-scope CPU/memory/disk threshold configuration,
  logs/events/diagnostics links, browser-local fallback samples, and Project detail
  project/environment rollup-only readback.
- Threshold policy writes remain exact-scope. `runtime-monitoring.thresholds.show` can inherit the
  nearest parent policy from retained sample scope evidence when no exact-scope policy exists; it
  does not infer parent scopes without samples or introduce organization/system defaults.
- MCP-facing runtime monitoring tool server registration is covered by
  `packages/ai/mcp/test/tool-descriptors.test.ts`; generated descriptors, registered tool listing,
  unknown-tool errors, and handler dispatch all use the shared command/query boundary.
- `runtime-monitoring.samples.list` and `runtime-monitoring.rollup` now have local query specs,
  accepted retention/query bounds, application services, operation-catalog rows, PG/PGlite sample
  storage, PG read-model tests, PG/PGlite sample write and retention pruning, internal collector
  service process visibility, scheduled history retention dispatch, CLI commands, HTTP/oRPC routes,
  SDK operation metadata, operation docs metadata, generated MCP/tool descriptors, MCP-facing tool
  server registration, public diagnostics docs, and a disabled-by-default
  active-server/resource/deployment/project/environment background collector runner.
- Real Docker and SSH usage smoke coverage is a GitHub Actions gate with local explicit
  reproduction scripts because it touches local or remote runtime targets. The local explicit gates
  live in `packages/adapters/runtime/test/runtime-usage-smoke.test.ts` and are exposed through
  `bun run smoke:runtime-usage:docker`, `bun run smoke:runtime-usage:ssh`, and
  `bun run smoke:runtime-usage`. The SSH script runs the shared `smoke:ssh:preflight` gate before
  enabling `APPALOFT_RUNTIME_USAGE_SSH_SMOKE=1`; direct local test invocation still requires
  `APPALOFT_RUNTIME_USAGE_DOCKER_SMOKE=1` or `APPALOFT_RUNTIME_USAGE_SSH_SMOKE=1`.
  `.github/workflows/runtime-usage-e2e.yml` runs the same read-only probes from nightly and release;
  release dispatch can set `require_runtime_usage_e2e=true` to fail closed when SSH runtime-usage
  evidence is required but target secrets are absent.
- Target-side cross-surface filtering is active for the resource runtime-log surface through the
  `since` query parameter, for resource/server deployment tables through deployment timestamp
  window filtering, and for resource diagnostic summaries through `observationFrom`/`observationTo`
  input that filters deployment/runtime log evidence in the copy payload. These surfaces do not
  copy records into monitoring samples or rollups.
