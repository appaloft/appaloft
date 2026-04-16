# Resource Runtime Log Observation Workflow Spec

## Normative Contract

Resource runtime log observation is a read workflow over `resources.runtime-logs`.

The workflow starts from a selected resource and lets an operator read a bounded tail or follow live
application stdout/stderr. It must not reveal whether the underlying runtime backend is Docker, PM2,
systemd, file tailing, or a provider API.

## Global References

This workflow inherits:

- [ADR-018: Resource Runtime Log Observation](../decisions/ADR-018-resource-runtime-log-observation.md)
- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [resources.runtime-logs Query Spec](../queries/resources.runtime-logs.md)
- [Resource Runtime Logs Error Spec](../errors/resources.runtime-logs.md)
- [Resource Runtime Logs Test Matrix](../testing/resource-runtime-logs-test-matrix.md)
- [Resource Runtime Logs Implementation Plan](../implementation/resource-runtime-logs-plan.md)
- [Project Resource Console Workflow Spec](./project-resource-console.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Workflow Purpose

Let users answer:

- what is the current application process writing to stdout/stderr?
- is the resource still emitting logs after deployment succeeded?
- which service/process inside a multi-service resource is producing a line?

The workflow must keep deployment-attempt history and application runtime observation separate.

## User Flow

1. User opens a resource detail surface.
2. The surface displays deployment status/history from deployment read models.
3. The surface offers resource runtime logs when the resource has or may have an observable runtime
   instance.
4. The client requests a bounded tail through `resources.runtime-logs`.
5. The client may start follow mode, which opens a stream over the same query contract.
6. The stream yields normalized line events to the UI.
7. When the user navigates away, pauses follow mode, or disconnects, the transport aborts the query
   and the runtime adapter closes its backend stream.

## Ownership Rules

Resource detail is the primary UI owner for runtime logs.

Deployment detail may link to resource runtime logs when the selected deployment is the runtime
instance being observed, but the operation remains `resources.runtime-logs`.

Project pages may show log availability only as resource summaries or navigation hints. They must
not open project-owned runtime log streams.

## Runtime Resolution Rules

When `deploymentId` is omitted, the query resolves the latest observable resource runtime instance.
The first implementation may define "observable" as latest successful or currently running
deployment with enough runtime placement metadata to open logs.

When `deploymentId` is supplied, the query must verify:

- the deployment exists;
- the deployment belongs to the supplied resource;
- the deployment snapshot has enough runtime placement metadata for the selected adapter.

Compose-stack or multi-service resources must either:

- use a deterministic default service defined by resource network/runtime profile; or
- require `serviceName` and return `validation_error` when it is missing.

## Streaming Rules

Stream mode is a read lifecycle, not a command lifecycle.

Stream opening may fail synchronously with `err(DomainError)`.

Once a stream is open:

- line events should be delivered in source order per backend stream;
- heartbeats may be emitted to keep transport connections alive;
- stream errors must be structured;
- cancellation must close backend resources;
- no domain state is mutated only because a stream opened, emitted a line, or closed.

## Consumer Behavior

Web must:

- render lines incrementally without waiting for stream completion;
- avoid duplicating already rendered bounded-tail lines when follow mode starts;
- avoid treating log text as deployment readiness;
- display structured stream errors by code/phase;
- stop the stream on navigation away or user pause without rendering normal cancellation as an error.

CLI must:

- print bounded tail output and continue in `--follow` mode;
- terminate cleanly on Ctrl-C by aborting the stream;
- expose structured error codes in machine-readable output modes.

HTTP/oRPC must:

- reuse the query input schema;
- propagate client disconnect as abort/cancellation;
- serialize stream events without inventing transport-only business shapes.

## Current Implementation Notes And Migration Gaps

Resource runtime log observation is exposed through the resource detail Web panel, CLI
`resource logs`, bounded oRPC reads, and streaming oRPC reads.

The runtime reader supports host-process file logs, local Docker/Compose logs, and generic-SSH
Docker/Compose logs from deployment runtime metadata, with short-lived SSH connection reuse for
successive bounded/follow reads. The Web panel lazy-loads runtime logs when the logs tab is opened,
then starts follow mode without re-appending the already visible bounded tail. Deployment pages still
display deployment-attempt logs, which are not the same as live resource runtime logs.

## Open Questions

- Should the first Web implementation show runtime logs on the resource detail page only, or also
  deep-link from deployment detail with `deploymentId` preselected?
