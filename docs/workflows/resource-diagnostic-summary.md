# Resource Diagnostic Summary Workflow Spec

## Normative Contract

Resource diagnostic summary is a read workflow over `resources.diagnostic-summary`.

The workflow starts from a selected resource and produces a copyable support/debug payload that
summarizes deployment status, generated access, proxy configuration status, deployment logs,
runtime log availability, and safe system context.

It must remain a read workflow. It does not diagnose by mutating state, running active health checks,
opening long-running log streams, or applying configuration.

## Global References

This workflow inherits:

- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-016: Deployment Command Surface Reset](../decisions/ADR-016-deployment-command-surface-reset.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-018: Resource Runtime Log Observation](../decisions/ADR-018-resource-runtime-log-observation.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [resources.diagnostic-summary Query Spec](../queries/resources.diagnostic-summary.md)
- [Resource Diagnostic Summary Error Spec](../errors/resources.diagnostic-summary.md)
- [Resource Diagnostic Summary Test Matrix](../testing/resource-diagnostic-summary-test-matrix.md)
- [Resource Diagnostic Summary Implementation Plan](../implementation/resource-diagnostic-summary-plan.md)
- [Project Resource Console Workflow Spec](./project-resource-console.md)
- [Quick Deploy Workflow Spec](./quick-deploy.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Workflow Purpose

Let users answer and share:

- which resource/deployment/server/destination was involved?
- why is access missing after a deployment?
- why are runtime logs empty or unavailable?
- which proxy provider/configuration route was planned or applied?
- which stable error codes and phases should be attached to a bug report?
- which safe local/desktop/backend context helps reproduce the issue?

The workflow treats "there is nothing useful to copy" as a product failure. A resource detail or
Quick Deploy completion surface must expose a copyable diagnostic payload even when access and logs
are missing.

## User Flow

1. User opens a resource detail, deployment detail linked to a resource, or Quick Deploy completion
   surface.
2. The surface displays normal deployment/access/log/proxy panels from their own queries.
3. The surface offers a "copy diagnostic summary" affordance when a resource id is known.
4. The client calls `resources.diagnostic-summary` with `resourceId` and optional `deploymentId`.
5. The query returns structured sections and canonical copy JSON.
6. The client copies or displays the payload without requiring screenshots.

## Ownership Rules

Resource detail is the primary owner of the diagnostic summary.

Deployment detail may call the query with both `resourceId` and `deploymentId`, but the operation
remains resource-owned because the summary composes resource access, runtime log, and proxy state.

Quick Deploy completion may call the query after the workflow has a `resourceId` and `deploymentId`.
It must not create a hidden Quick Deploy command.

Project pages may show diagnostics only after a resource is selected.

## Composition Rules

The workflow composes read state from:

- resource read model;
- deployment read model and deployment-attempt logs;
- resource access summary;
- proxy configuration preview/read service;
- runtime log bounded-tail query/read service;
- safe backend/system diagnostics.

Each source is allowed to be unavailable. The summary must preserve source-specific status and
structured source errors.

When access state includes multiple public routes, diagnostic access and proxy sections must use
the default-access route precedence contract for the current selected route: durable ready domain,
server-applied config domain, latest generated route, planned generated route, then no public
route. The summary may still include the separate generated, durable, and server-applied URLs so an
operator can see why a generated/default URL exists but is not the selected public route.

The query service may depend on existing query services or read-model ports, but Web components,
CLI commands, and HTTP handlers must not manually reconstruct the diagnostic payload by calling many
separate endpoints and merging ad hoc shapes.

## Desktop And Local Mode Rules

Desktop/local installations must still expose product-level diagnostic information through the same
query. Safe context may include:

- Appaloft backend version/build;
- shell/runtime mode such as desktop, local, or server;
- persistence driver such as PGlite or PostgreSQL;
- selected provider keys and capability status;
- generated correlation/request ids when available.

The summary must not include private local filesystem paths, raw environment variables, credential
locations, SSH private key paths, or secrets unless a future security ADR explicitly allows a
redacted form.

## Entry Surface Rules

Web and desktop must:

- show stable resource/deployment ids in the diagnostic detail or copied payload;
- include a copy action on resource detail and Quick Deploy completion when a resource id is known;
- include structured source errors when access/log panels show empty/error states;
- use i18n keys for user-facing labels.

CLI must:

- expose the same query through a resource-scoped command;
- support JSON output for machine-readable bug reports;
- include stable ids and source errors in non-interactive output.

HTTP/oRPC must:

- reuse the query input schema;
- return the same structured result to Web, CLI, automation, and future MCP clients.

## Current Implementation Notes And Migration Gaps

The resource diagnostic summary workflow is active for the resource detail surface. The Web action
calls `resources.diagnostic-summary` and copies canonical `copy.json`.

The query is implemented in application, contracts, oRPC/HTTP, CLI, operation catalog metadata, and
Web resource detail.

Quick Deploy completion can navigate to deployment detail but does not yet provide a copyable
diagnostic summary for the accepted resource/deployment. Deployment detail also does not yet expose
the action directly.

Desktop uses the Web resource detail action, but desktop-client-specific safe context is not yet
appended to the copied payload.

## Open Questions

- Should deployment detail pages also expose the copy action directly when they can resolve the
  owning resource id?
