# ADR-001: deployments.create HTTP API Required Fields

Status: Accepted

Date: 2026-04-14

## Decision

`deployments.create` keeps one shared command schema across CLI, HTTP API, Web, automation, and future MCP tools. The HTTP API is strict and non-interactive, but admission policy is profile-aware.

For hosted, multi-tenant, and automation-facing HTTP API calls, the caller must provide:

- `sourceLocator`;
- `projectId`;
- `environmentId`;
- `serverId`;
- `destinationId`;
- either `resourceId` or `resource`.

For local self-hosted and embedded profiles, `projectId`, `environmentId`, `serverId`, `destinationId`, and resource context may be omitted only when deployment-context bootstrap can deterministically resolve, reuse, or create those records inside the command admission flow.

If context bootstrap cannot resolve all required context, the command must reject admission with `err(DomainError)` using `code = validation_error` or `code = not_found`, and `phase = context-resolution` or `phase = config-bootstrap`.

`resourceId` wins when both `resourceId` and `resource` are supplied.

`configFilePath` is a local/CLI/filesystem bootstrap hint. Remote HTTP API clients must not depend on arbitrary server-local filesystem paths for production deployments. If HTTP later supports uploaded or parsed config documents, that must be modeled as an explicit command input or separate operation rather than overloading `configFilePath`.

## Governed Specs

- [deployments.create Command Spec](../commands/deployments.create.md)
- [deployments.create Workflow Spec](../workflows/deployments.create.md)
- [deployments.create Error Spec](../errors/deployments.create.md)
- [deployments.create Test Matrix](../testing/deployments.create-test-matrix.md)
- [Core Operations](../CORE_OPERATIONS.md)

## Implementation Requirements

HTTP adapters must dispatch the shared `CreateDeploymentCommandInput` shape and must not define a transport-only deployment input model.

Hosted/multi-tenant HTTP admission must reject missing context identifiers before deployment acceptance. It must not silently create project, environment, server, destination, or resource records from Web/API convenience behavior unless that bootstrap policy is explicitly enabled for the current deployment profile.

CLI and local embedded flows may collect or bootstrap missing context before dispatching the command. That collection is an entry workflow concern; it must not create a separate CLI-only deployment business rule.

Web QuickDeploy must either collect/select the required records before dispatch or rely on an explicitly enabled local bootstrap profile. It must not hide hosted/multi-tenant implicit ownership creation inside UI components.

Tests must cover both admission profiles:

- strict HTTP profile rejects missing `projectId`, `environmentId`, `serverId`, `destinationId`, and resource context;
- local embedded profile accepts missing context only when bootstrap resolves it deterministically;
- both profiles return the same command result semantics after admission.

## Consequences

This decision preserves multi-entry command consistency while still supporting self-hosted local bootstrap ergonomics.

Strict API clients get predictable admission behavior and stable structured errors. Local CLI and embedded workflows can keep fast-start defaults without weakening the hosted API contract.

## Superseded Open Questions

- Which fields should be mandatory for production HTTP API calls after config/default bootstrap policies are finalized?
- Should production API calls rely on config/default bootstrap, or require explicit ids after bootstrap policy stabilizes?
