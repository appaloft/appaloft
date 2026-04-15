# ADR-018: Resource Runtime Log Observation

Status: Accepted

Date: 2026-04-15

## Decision

Application runtime logs are a resource-owned observation capability.

Yundu must not assume that deployed applications always run under Docker. The application layer must
observe application runtime logs through an injected port that can be implemented by Docker, PM2,
systemd, file-tail, provider API, or another runtime adapter.

The public business operation boundary is the active query `resources.runtime-logs`. It observes
logs for a running or recently running resource instance. It is separate from
`deployments.logs`, which observes persisted deployment-attempt logs.

The application port must expose log output as an asynchronous stream of normalized line events. A
runtime adapter may internally use a streaming source such as `docker logs -f`, `pm2 logs --raw`,
`journalctl -f`, file tailing, or a provider log API, but those details must not leak into the
query, Web, CLI, or core domain contracts.

The target boundary is:

```text
Resource
  -> latest or selected deployment/runtime placement
  -> ResourceRuntimeLogReader port
      -> runtime-specific adapter
          -> normalized ResourceRuntimeLogEvent stream
```

## Context

The existing deployment log surface is deployment-attempt oriented:

- deployment planning, build, health-check, and runtime execution progress are recorded as
  deployment logs;
- `deployments.logs` reads those persisted attempt logs;
- the deployment progress stream is tied to accepted deployment creation and progress projection.

That does not cover the operator workflow of opening a resource and watching the application
process's stdout/stderr after deployment. It also does not define a runtime-agnostic integration
point for non-Docker deployments such as PM2-managed Node.js processes or language-specific process
supervisors.

## Options Considered

### Option A: Reuse `deployments.logs`

This would append live application process logs into deployment-attempt logs and read them from the
deployment log projection.

This option is rejected because runtime process logs may outlive a single deployment attempt, may
come from the currently running resource instance rather than a historical attempt, and should not
force every runtime backend to persist high-volume stdout/stderr into deployment log storage.

### Option B: Add Docker-Specific Runtime Log APIs

This would expose Docker container ids or Docker log options directly through application queries
or transports.

This option is rejected because Yundu must support non-Docker runtime backends and deployment
strategies. Docker is one adapter implementation detail, not the platform contract.

### Option C: Add A Resource-Owned Runtime Log Query Over An Injected Port

This defines `resources.runtime-logs` as a resource-owned query that resolves the current runtime
placement and delegates log access to a `ResourceRuntimeLogReader` port.

This option is accepted.

## Chosen Rule

`resources.runtime-logs` observes application runtime output for a resource. It must:

- require a `resourceId`;
- optionally accept a `deploymentId` when the caller needs a specific runtime instance instead of
  the latest observable instance;
- optionally accept a `serviceName` for compose-stack or multi-process resources;
- support bounded tail reads and follow/stream mode;
- pass cancellation through an abort signal so transports can stop remote commands or child
  processes when clients disconnect;
- return normalized line events, not Docker/PM2/systemd-native records;
- avoid persisting runtime application logs by default;
- mask known secret values and never expose environment secret values through error details.

The application layer must depend on an explicit injected port. The port is an application boundary,
not a core domain service, because opening logs is runtime/provider IO.

The core domain may define value objects for stable identifiers and log line metadata when useful,
but core aggregates must not depend on Docker, PM2, shell commands, process handles, HTTP streaming
APIs, or provider SDK types.

Runtime adapters own backend-specific behavior:

- Docker adapters may call Docker APIs or shell out to `docker logs`;
- PM2 adapters may call PM2 APIs or shell out to `pm2 logs`;
- systemd adapters may call journal APIs or shell out to `journalctl`;
- file-tail adapters may watch a configured log file;
- provider adapters may call provider log APIs.

All adapters must normalize output into the same resource runtime log event contract.

## Consequences

Application runtime logs become available without coupling Yundu to Docker.

The Web console can render a resource log stream by consuming the query/stream contract rather than
knowing how a resource was deployed.

The CLI can offer `yundu resource logs <resourceId>` and `--follow` later without changing the
business meaning of the operation.

Log archival, log drains, search, retention, and metrics remain separate future behaviors. This ADR
only defines live or bounded runtime observation.

## Governed Specs

- [resources.runtime-logs Query Spec](../queries/resources.runtime-logs.md)
- [Resource Runtime Log Observation Workflow Spec](../workflows/resource-runtime-log-observation.md)
- [Resource Runtime Logs Error Spec](../errors/resources.runtime-logs.md)
- [Resource Runtime Logs Test Matrix](../testing/resource-runtime-logs-test-matrix.md)
- [Resource Runtime Logs Implementation Plan](../implementation/resource-runtime-logs-plan.md)
- [Project Resource Console Workflow Spec](../workflows/project-resource-console.md)
- [Project Resource Console Test Matrix](../testing/project-resource-console-test-matrix.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](./ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-013: Project Resource Navigation And Deployment Ownership](./ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-016: Deployment Command Surface Reset](./ADR-016-deployment-command-surface-reset.md)

## Superseded Open Questions

- Should application runtime logs be represented as deployment logs or resource-owned observation?
- Should the application layer assume Docker for runtime log access?
- Should runtime log streaming be a transport concern or an application port concern?

## Current Implementation Notes And Migration Gaps

Current code exposes `deployments.logs` for persisted deployment-attempt logs.

`resources.runtime-logs` is implemented through `ResourceRuntimeLogsQuery` and an injected
`ResourceRuntimeLogReader` port. The first runtime reader supports host-process file tailing,
Docker container logs, and Docker Compose logs from deployment runtime metadata.

The query is exposed through bounded and streaming oRPC procedures, CLI `resource logs`, and the Web
resource detail runtime log panel.

PM2, systemd/journalctl, provider-native API, and remote SSH reader implementations remain future
adapter work behind the same port.

## Open Questions

- Should the next runtime adapter be PM2, systemd/journalctl, provider API, or remote SSH file
  tailing?
- What default retention or archival behavior, if any, should be added later for runtime logs beyond
  live tail and bounded tail reads?
