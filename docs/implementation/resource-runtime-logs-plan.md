# Resource Runtime Logs Implementation Plan

## Source Of Truth

This document is an implementation-planning contract for `resources.runtime-logs`. It does not
replace ADRs, query specs, workflow specs, error specs, or test matrices.

## Governed ADRs

- [ADR-018: Resource Runtime Log Observation](../decisions/ADR-018-resource-runtime-log-observation.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)

## Governed Specs

- [resources.runtime-logs Query Spec](../queries/resources.runtime-logs.md)
- [Resource Runtime Log Observation Workflow Spec](../workflows/resource-runtime-log-observation.md)
- [Resource Runtime Logs Error Spec](../errors/resources.runtime-logs.md)
- [Resource Runtime Logs Test Matrix](../testing/resource-runtime-logs-test-matrix.md)
- [Project Resource Console Workflow Spec](../workflows/project-resource-console.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Domain Model](../DOMAIN_MODEL.md)

## Expected Application Scope

Add a vertical query slice under `packages/application/src/operations/resources/`:

- `resource-runtime-logs.query.ts`;
- `resource-runtime-logs.schema.ts`;
- `resource-runtime-logs.handler.ts`;
- `resource-runtime-logs.query-service.ts`.

Add application port and token:

- `ResourceRuntimeLogReader` in `packages/application/src/ports.ts`;
- `tokens.resourceRuntimeLogReader` in `packages/application/src/tokens.ts`;
- `tokens.resourceRuntimeLogsQueryService` when the query service is container-managed.

The query handler must dispatch through `QueryBus` and delegate to the query service.

The query service must:

- validate query input through the shared schema;
- resolve resource/deployment context through read models or repositories already exposed to the
  application layer;
- build a runtime log context without exposing provider-native details to transports;
- call the injected `ResourceRuntimeLogReader`;
- return bounded lines or an async iterable stream according to query mode;
- map expected failures to [Resource Runtime Logs Error Spec](../errors/resources.runtime-logs.md).

## Expected Adapter Scope

Add a fake or local runtime log reader first so the application/API/Web contracts can be exercised
without requiring Docker or PM2.

Runtime adapter implementations must own backend-specific logic. Possible adapters:

- Docker log reader: Docker API or `docker logs --tail <n> --follow`;
- PM2 log reader: PM2 API or `pm2 logs --raw --lines <n>`;
- local process/file log reader: reads/tails a known file or child process stream;
- provider log reader: provider API.

Every adapter must implement the same `ResourceRuntimeLogReader` port and must close backend
resources on abort/cancel.

## Expected Transport Scope

oRPC/HTTP exposes:

- a bounded read endpoint using the query schema;
- a streaming oRPC procedure using the same query schema and serialized `ResourceRuntimeLogEvent`
  records.

CLI exposes:

- `yundu resource logs <resourceId>`;
- `--follow`;
- `--tail <n>`;
- `--service <name>`;
- optional `--deployment <deploymentId>`.

Transports must not define Docker-specific, PM2-specific, or provider-specific input fields.

## Expected Web Scope

Resource detail should include a resource runtime logs panel once the query is active.

The panel should:

- request a bounded tail on load;
- allow follow mode;
- render lines incrementally;
- stop the stream on navigation away or pause;
- show structured errors by code/phase through i18n keys;
- keep deployment-attempt logs visually and semantically separate from runtime application logs.

## Operation Catalog Scope

During Code Round, add `resources.runtime-logs` to:

- [Core Operations](../CORE_OPERATIONS.md) implemented operations table;
- `packages/application/src/operation-catalog.ts`;
- HTTP/oRPC operation metadata;
- CLI help/command registration;
- Web query helpers.

Do not add the operation to the active catalog until the query, port, at least one reader
implementation or fake, transport mapping, tests, and Web/CLI behavior chosen for the Code Round
are aligned.

## Minimal Deliverable

The minimal Code Round deliverable is:

- application query slice and schema;
- injected `ResourceRuntimeLogReader` port;
- fake/local reader that yields async line events and supports cancellation;
- bounded read and stream-capable transport path;
- resource detail Web affordance or clearly documented Web deferral;
- tests covering query context resolution, adapter delegation, streaming, cancellation, and error
  mapping.

If PM2 or Docker support is deferred, record the runtime adapter gap here and keep the public
contract runtime-agnostic.

## Required Tests

Required coverage follows [Resource Runtime Logs Test Matrix](../testing/resource-runtime-logs-test-matrix.md):

- query validation and tail bounds;
- resource not found and deployment mismatch;
- latest runtime instance resolution;
- injected reader is called with runtime context;
- normalized line events are streamed;
- stream cancellation closes backend resources;
- post-open stream failure is structured;
- no runtime-native types leak into query outputs or transport schemas;
- Web/CLI/HTTP behavior included when those entrypoints are part of the Code Round.

## Migration Seams And Legacy Edges

Existing deployment logs remain `deployments.logs`.

The local runtime app log tailer used during deployment verification may be extracted or adapted,
but it must not remain hidden inside deployment execution if it becomes the resource runtime log
reader implementation.

No runtime application log archival or persistent search is required for the first implementation.

## Current Implementation Notes And Migration Gaps

`resources.runtime-logs` is implemented as a vertical application query slice with:

- `ResourceRuntimeLogsQuery`, schema, handler, and query service;
- injected `ResourceRuntimeLogReader` port and token;
- runtime adapter reader for host-process file logs, local Docker container logs, local Docker
  Compose logs, and generic-SSH Docker/Compose logs with short-lived SSH connection reuse;
- bounded and streaming oRPC procedures;
- CLI `yundu resource logs <resourceId>`;
- Web resource detail runtime log panel that lazy-loads on the logs tab, avoids duplicate bounded
  tail lines when follow starts, and treats user stop/navigation cancellation as normal closure;
- application tests for context resolution, reader delegation, stream mode, masking, mismatch, and
  unavailable runtime logs.

`deployments.logs` remains implemented for deployment-attempt logs and is still a separate active
operation.

PM2, systemd/journalctl, provider-native API, and remote SSH file-tail reader implementations remain
future adapter work behind the same application port. Runtime application log archival or persistent
search is still out of scope for the first implementation.

## Open Questions

- Should the next runtime reader be PM2, systemd/journalctl, or remote SSH file tailing beyond
  Docker/Compose logs?
- Should stream reconnect/cursor support be added before persistent runtime log archival is modeled?
