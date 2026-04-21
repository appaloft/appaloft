# Resource Diagnostic Summary Implementation Plan

## Source Of Truth

This document is an implementation-planning contract for `resources.diagnostic-summary`. It does
not replace ADRs, query specs, workflow specs, error specs, or test matrices.

## Governed ADRs

- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-018: Resource Runtime Log Observation](../decisions/ADR-018-resource-runtime-log-observation.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)

## Governed Specs

- [resources.diagnostic-summary Query Spec](../queries/resources.diagnostic-summary.md)
- [Resource Diagnostic Summary Workflow Spec](../workflows/resource-diagnostic-summary.md)
- [Resource Diagnostic Summary Error Spec](../errors/resources.diagnostic-summary.md)
- [Resource Diagnostic Summary Test Matrix](../testing/resource-diagnostic-summary-test-matrix.md)
- [Project Resource Console Workflow Spec](../workflows/project-resource-console.md)
- [Quick Deploy Workflow Spec](../workflows/quick-deploy.md)
- [Resource Runtime Log Observation Workflow Spec](../workflows/resource-runtime-log-observation.md)
- [resources.runtime-logs Query Spec](../queries/resources.runtime-logs.md)
- [resources.proxy-configuration.preview Query Spec](../queries/resources.proxy-configuration.preview.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Domain Model](../DOMAIN_MODEL.md)

## Expected Application Scope

Add a vertical query slice under `packages/application/src/operations/resources/`:

- `resource-diagnostic-summary.schema.ts`;
- `resource-diagnostic-summary.query.ts`;
- `resource-diagnostic-summary.handler.ts`;
- `resource-diagnostic-summary.query-service.ts`.

Add application ports/tokens as needed:

- a safe `SystemDiagnosticContextProvider` or equivalent read-only system-info port;
- `tokens.resourceDiagnosticSummaryQueryService`;
- any read-model ports needed to load resource, deployment, access, proxy, and log summary data.

The query handler must delegate to the query service and return the typed `Result`.

The query service should compose existing read/query services or read-model ports for:

- resource context;
- latest or selected deployment state;
- deployment-attempt log tail;
- `ResourceAccessSummary`;
- proxy configuration preview sections;
- bounded runtime log tail;
- safe backend/system context.

It must preserve partial source failures inside the summary and avoid transport-specific formatting.

## Expected Adapter Scope

No mutating runtime adapter is required.

Adapters may need read-only support for:

- bounded deployment log tail read;
- bounded runtime log read without follow mode;
- safe backend/local/desktop context;
- proxy configuration preview through existing provider-rendered view paths.

Runtime and provider adapters must not expose raw command strings, secrets, provider-native records,
or private local paths in diagnostic output.

## Expected Transport Scope

oRPC/HTTP exposes:

```text
GET /api/resources/{resourceId}/diagnostic-summary
```

using `ResourceDiagnosticSummaryQueryInput`.

CLI exposes:

```text
appaloft resource diagnose <resourceId> [--deployment <deploymentId>] [--json]
```

CLI should print canonical JSON in `--json` mode and a concise section summary in human mode.

Transports must not define parallel diagnostic input/output shapes.

## Expected Web And Desktop Scope

Resource detail should include a copy diagnostic summary affordance.

Quick Deploy completion should include the same affordance once `resourceId` and `deploymentId` are
known.

Deployment detail may include the affordance when it can resolve the owning `resourceId`.

Web/desktop must:

- call the typed query client;
- copy canonical JSON or a rendered summary derived from query fields;
- use `packages/i18n` keys for labels and buttons;
- show stable ids and source errors in an inspectable panel or copied payload;
- avoid requiring screenshots as the only report path.

## Operation Catalog Scope

During the Code Round that promotes this behavior to active, add `resources.diagnostic-summary` to:

- [Core Operations](../CORE_OPERATIONS.md) implemented operations table;
- `packages/application/src/operation-catalog.ts`;
- HTTP/oRPC operation metadata;
- CLI help/command registration;
- Web query helpers;
- contracts exports.

Do not add the operation to the active catalog until the query, schema, service, transport mapping,
entry affordance, and tests are aligned.

## Minimal Deliverable

The minimal Code Round deliverable is:

- application query slice and schema;
- fake/in-memory read sources for application tests;
- canonical `ResourceDiagnosticSummary` output with `copy.json`;
- redaction across summary fields and copy payload;
- API/oRPC endpoint;
- Web resource detail copy affordance;
- tests covering partial failures, redaction, source statuses, and no write side effects.

CLI and Quick Deploy completion are strongly preferred for v1 closure. If deferred, record the
deferment in this plan and the relevant workflow migration notes.

## Required Tests

Required coverage follows [Resource Diagnostic Summary Test Matrix](../testing/resource-diagnostic-summary-test-matrix.md):

- query validation and tail bounds;
- resource missing and deployment mismatch;
- latest deployment selection;
- complete summary composition;
- access missing after successful deployment;
- non-ready durable domain binding remains the blocking access fact even when fallback route URLs exist;
- proxy source failure as partial summary;
- runtime logs unavailable as partial summary;
- deployment logs empty versus unavailable;
- redaction failure as whole-query error;
- canonical copy JSON;
- Web copy affordance on resource detail;
- API/oRPC uses the shared query schema.

## Migration Seams And Legacy Edges

Existing Web panels for access, proxy configuration, deployment logs, and runtime logs remain
separate product surfaces. The diagnostic summary composes their read states for support/debugging.

The initial implementation may omit optional markdown/plain-text copy rendering as long as
`copy.json` is canonical and usable.

If desktop/client-only fields cannot be returned by the backend, the Web/desktop shell may append a
separate safe client context section derived from the same structured contract during copy.

## Current Implementation Notes And Migration Gaps

`resources.diagnostic-summary` is implemented in application, operation catalog, contracts,
oRPC/HTTP, CLI, shell DI, and Web resource detail.

The application query service composes resources, deployments, deployment log tail, runtime log tail,
proxy configuration preview, access summary, and safe diagnostics into a single read-only summary.
Per-source failures remain inside `sourceErrors` when a safe resource-scoped payload can still be
returned.

Application query-service tests cover canonical copy JSON, secret redaction, missing access as a
section/source error, non-ready durable domain bindings as access source errors, proxy provider
failure as a source error, runtime log reader failure as a source error, runtime logs not requested
without reader calls, and deployment/resource context mismatch.

Web resource detail prefers the native Desktop clipboard bridge when available, then browser
clipboard APIs, and only exposes the generated diagnostic JSON textarea when every automatic copy
channel fails.

Remaining gaps:

- Quick Deploy completion does not yet expose the copy action after accepted deployment.
- Deployment detail does not yet expose the action directly.
- CLI human-readable summary mode is not implemented; `appaloft resource diagnose` currently prints
  JSON through the shared query renderer.
- Optional `copy.markdown` and `copy.plainText` are not generated.
- API/oRPC, CLI, and Web copy affordance do not yet have dedicated automated contract/e2e tests
  beyond typecheck.

## Open Questions

- Should optional rendered copy text be backend-owned for stable support output, or generated by
  each entrypoint from canonical `copy.json`?
