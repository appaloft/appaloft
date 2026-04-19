# resources.diagnostic-summary Query Spec

## Metadata

- Operation key: `resources.diagnostic-summary`
- Query class: `ResourceDiagnosticSummaryQuery`
- Input schema: `ResourceDiagnosticSummaryQueryInput`
- Handler: `ResourceDiagnosticSummaryQueryHandler`
- Query service: `ResourceDiagnosticSummaryQueryService`
- Domain / bounded context: Workload Delivery / Resource observation
- Current status: active query, implemented
- Source classification: target contract

## Normative Contract

`resources.diagnostic-summary` produces a copyable, resource-scoped diagnostic summary for support,
bug reporting, and operator debugging.

It is a read-only query. It must not create deployments, apply proxy configuration, run health
checks, install proxies, open long-running log streams, mutate deployment state, or change resource
configuration.

The query exists because successful deployment acceptance or terminal success is not enough for
operator debugging. A user must be able to copy stable identifiers, status, route state, log
availability, and sanitized recent evidence when access, proxy configuration, or runtime logs are
missing.

The query must be useful when other observation surfaces are empty or failed. Missing access route,
missing runtime logs, missing proxy configuration, or missing deployment logs should normally appear
as section statuses inside an `ok` result, not as a whole-query failure.

## Global References

This query inherits:

- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-018: Resource Runtime Log Observation](../decisions/ADR-018-resource-runtime-log-observation.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [Resource Diagnostic Summary Workflow Spec](../workflows/resource-diagnostic-summary.md)
- [Resource Diagnostic Summary Error Spec](../errors/resources.diagnostic-summary.md)
- [Resource Diagnostic Summary Test Matrix](../testing/resource-diagnostic-summary-test-matrix.md)
- [Resource Diagnostic Summary Implementation Plan](../implementation/resource-diagnostic-summary-plan.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Purpose

Let Web, desktop, CLI, HTTP/oRPC, automation, and future MCP users answer:

- which resource, deployment attempt, project, environment, server, and destination are involved?
- did deployment admission, runtime execution, generated access, proxy route realization, and log
  observation each succeed, fail, or remain unavailable?
- what stable error codes, phases, related ids, and retry hints should be included in a bug report?
- what sanitized recent deployment logs or runtime log lines are safe to copy?
- what safe local installation context is relevant when the app runs in desktop/local mode?

The diagnostic summary is not a replacement for:

- `deployments.logs`;
- `resources.runtime-logs`;
- `resources.proxy-configuration.preview`;
- generated access summaries;
- `system.doctor`;
- durable observability, metrics, archival, or log search.

It composes or summarizes those surfaces into one copyable read model.

## Input Model

```ts
type ResourceDiagnosticSummaryQueryInput = {
  resourceId: string;
  deploymentId?: string;
  includeDeploymentLogTail?: boolean;
  includeRuntimeLogTail?: boolean;
  includeProxyConfiguration?: boolean;
  tailLines?: number;
  locale?: string;
};
```

| Field | Required | Meaning |
| --- | --- | --- |
| `resourceId` | Yes | Resource whose diagnostic context is being summarized. |
| `deploymentId` | No | Specific deployment attempt to pin. When omitted, the query uses the latest relevant deployment for the resource. |
| `includeDeploymentLogTail` | No | Whether to include a sanitized bounded deployment-attempt log tail. Defaults to true with a small upper bound. |
| `includeRuntimeLogTail` | No | Whether to attempt a sanitized bounded runtime log tail. Defaults to false when the caller only needs metadata. |
| `includeProxyConfiguration` | No | Whether to include redacted proxy configuration section summaries. Defaults to false for compact support copies. |
| `tailLines` | No | Maximum lines per included log section. The schema must enforce a low upper bound. |
| `locale` | No | Optional formatting hint for entrypoints that render copy text. It must not change machine fields. |

Public input uses platform ids only. It must not accept container ids, file paths, raw proxy labels,
provider-native route ids, process names, or runtime-native log handles.

## Output Model

```ts
type ResourceDiagnosticSummaryResult = Result<ResourceDiagnosticSummary, DomainError>;

type ResourceDiagnosticSummary = {
  schemaVersion: "resources.diagnostic-summary/v1";
  generatedAt: string;
  focus: ResourceDiagnosticFocus;
  context: ResourceDiagnosticContext;
  deployment?: ResourceDiagnosticDeployment;
  access: ResourceDiagnosticAccess;
  proxy: ResourceDiagnosticProxy;
  deploymentLogs: ResourceDiagnosticLogSection;
  runtimeLogs: ResourceDiagnosticLogSection;
  system: ResourceDiagnosticSystem;
  sourceErrors: ResourceDiagnosticSourceError[];
  redaction: ResourceDiagnosticRedaction;
  copy: ResourceDiagnosticCopyPayload;
};
```

Required top-level behavior:

- `focus` always includes `resourceId` and the selected `deploymentId` when one is resolved.
- `context` includes safe ids for project, environment, server/deployment target, destination, and
  runtime strategy when available.
- `deployment` includes attempt status, lifecycle phase, terminal timestamps, request/correlation id
  when available, and last structured error summary when available.
- `access` includes generated and durable access route status, public URL when safe, route
  realization status, server-applied canonical redirect status when present, and the structured
  reason when no access URL is available.
- `proxy` includes provider key, proxy readiness, configuration view availability, and safe warnings
  or last structured provider error.
- `deploymentLogs` and `runtimeLogs` report whether logs are available, empty, unavailable, or not
  requested. Included lines are bounded and redacted.
- `system` includes safe installation context such as backend version, runtime mode, persistence
  driver, desktop/local mode when known, and configured provider keys. It must not include secrets,
  private local paths, SSH commands, credentials, raw environment variables, or tokens.
- `sourceErrors` records per-source failures that did not fail the whole query.
- `copy` contains deterministic machine-readable JSON and optionally markdown/plain-text rendered
  from the same structured fields.

Copy payload:

```ts
type ResourceDiagnosticCopyPayload = {
  json: string;
  markdown?: string;
  plainText?: string;
};
```

`copy.json` is the canonical bug-report payload. Web and CLI may render localized copy text, but the
machine contract is the structured summary plus canonical JSON.

## Status Values

Diagnostic sections use provider-neutral statuses:

```ts
type ResourceDiagnosticSectionStatus =
  | "available"
  | "empty"
  | "not-configured"
  | "not-requested"
  | "unavailable"
  | "failed"
  | "unknown";
```

Unavailable and failed sections must include a stable `reasonCode` and `phase` when known.

## Query Flow

The query must:

1. Validate input and tail bounds.
2. Resolve the resource and visibility context.
3. Select the requested deployment attempt or latest relevant deployment for the resource.
4. Resolve safe project, environment, deployment target/server, destination, runtime strategy, and
   resource network/access context.
5. Read deployment status and last structured error from deployment read models or aggregate
   snapshots.
6. Read generated/durable access summary and route realization status.
7. Summarize proxy readiness and optionally call `resources.proxy-configuration.preview` semantics
   or the same provider-backed read service for redacted configuration sections.
8. Read a bounded deployment log tail when requested.
9. Attempt a bounded runtime log tail when requested and an observable runtime instance exists.
10. Include safe local/system context from an injected diagnostics/system-info port when available.
11. Redact secrets across all included fields and lines.
12. Return `ok(ResourceDiagnosticSummary)` with per-section statuses and source errors.

The query must not:

- apply proxy configuration;
- run mutating runtime commands;
- perform an active public health check;
- open an unbounded or long-running follow stream;
- treat raw log text as readiness;
- expose provider-native records as top-level machine fields;
- fail the whole query just because one observation source is unavailable.

## Error Contract

Whole-query failures are limited to failures that prevent identifying the resource or building a
safe response. Per-source failures are represented in `sourceErrors`.

All errors use [Resource Diagnostic Summary Error Spec](../errors/resources.diagnostic-summary.md).

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Resource detail exposes a copy diagnostic summary action. Quick Deploy completion and deployment detail remain follow-up surfaces. | Implemented / partial |
| Desktop | Desktop Web resource detail exposes the same Web action. Safe desktop-client appendix is not yet added. | Implemented / partial |
| CLI | `appaloft resource diagnose <resourceId> [--deployment <deploymentId>] [--json]` prints canonical JSON. Human summary rendering remains a follow-up. | Implemented / partial |
| oRPC / HTTP | `GET /api/resources/{resourceId}/diagnostic-summary` using the query schema. | Implemented |
| Automation / MCP | Future query/tool over the same operation key. | Future |

Web and CLI must use i18n/user-facing formatting at the entry boundary. They must not invent
parallel diagnostic shapes.

## Current Implementation Notes And Migration Gaps

`resources.diagnostic-summary` is implemented as an application query slice and exposed through
oRPC/HTTP, CLI, operation catalog metadata, contracts, and the Web resource detail copy action.

The initial implementation returns canonical `copy.json` and omits optional `copy.markdown` and
`copy.plainText`.

The Web resource detail action calls the typed query client. Quick Deploy completion and deployment
detail do not yet expose the action directly.

Safe backend/system context currently includes request id, entrypoint, locale, readiness status, and
database driver/mode from diagnostics. It intentionally omits private database locations and local
filesystem paths.

## Open Questions

- Should `copy.markdown` be generated by the backend for stable support output, or rendered by each
  entrypoint from `copy.json` and localized labels?
- Which safe desktop/client fields should be appended by the Web/desktop shell versus returned by
  the backend system-info port?
