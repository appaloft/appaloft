# ADR-086: Preview Operable Runtime Scope

Status: Accepted

Date: 2026-06-23

## Context

Product-grade preview deployments already model a `PreviewEnvironment` as a temporary runtime
surface derived from a parent `Resource`. The preview read model stores the parent project,
environment, resource, server, destination, source context, lifecycle status, and expiry.

Operators and AI agents expect a preview to behave like a temporary environment for the same
service. If a service can expose logs, health, diagnostics, runtime control, terminal access, or
dependency readback, the preview should expose those same service-operation surfaces through the
same command/query contracts. Without a durable decision, Appaloft could drift into two bad shapes:

- a parallel `preview.*` command namespace that duplicates resource operations and falls out of
  sync; or
- transport-only shortcuts that resolve preview containers, dependency URLs, or provider state
  outside the application command/query boundary.

Preview scope must also preserve safety. A preview is temporary and often lower-risk than
production, but it still carries secret references, runtime credentials, terminal access, logs, and
possibly user data. Preview operability therefore needs a normalized scope resolution boundary, not
raw Docker, SSH, database, Redis, or provider access from transports.

## Decision

Appaloft models preview operability as a **Preview Operable Runtime Scope** over existing service
operations.

A preview operable runtime scope is resolved from:

```text
previewEnvironmentId
  -> PreviewEnvironment read model
  -> parent resourceId
  -> latest preview deployment/runtime context for that preview environment
  -> existing Resource, Deployment, Runtime, Terminal, and Dependency operation contracts
```

Preview operability extends existing operations with preview scope input rather than creating a
parallel command namespace. Transport names may keep current resource-oriented commands and add a
preview selector, but every call must still dispatch the same operation catalog key and shared
command/query schema.

The first governed operation families are:

| Batch | Operation family | Scope behavior |
| --- | --- | --- |
| 1 | runtime logs, health, diagnostics, effective config, deployment readback | Read-only preview observation resolves to the parent Resource and the selected preview deployment/runtime context. |
| 2 | runtime stop/start/restart and operator terminal sessions | Mutating/runtime-interactive preview operations use the same Resource runtime coordination and terminal session boundaries, with preview metadata added to safe audit/readback only. |
| 3 | dependency binding readback, dependency inspect, and safe dependency queries | Preview dependency operations resolve dependency bindings created for the preview Resource/runtime context and must not expose raw connection values. |

Preview scope inheritance applies to service/runtime operations only. It does not automatically
inherit:

- preview policy configuration;
- project, environment, resource, server, domain, certificate, billing, organization, deploy-token,
  or retention administration;
- production default-domain or TLS ownership;
- destructive dependency delete, backup-retention, or provider account mutation unless an explicit
  later spec accepts preview-specific semantics.

## Command And Query Boundary

Existing resource operations may accept a `previewEnvironmentId` selector when the operation's
semantics are service/runtime scoped. The application layer must resolve the selector before
dispatching to runtime/dependency ports.

When both `resourceId` and `previewEnvironmentId` are supplied, the resolver must verify that the
preview belongs to the supplied Resource. If only `previewEnvironmentId` is supplied, the resolver
uses the parent Resource from the preview read model.

When an operation also accepts `deploymentId`, the resolver must verify that the selected deployment
belongs to the preview environment's Resource and source/deployment context when that evidence is
available. The first implementation may select the latest deployment recorded on the preview
environment read side or derived preview decision/read model; if no safe preview deployment can be
resolved, the operation must fail closed instead of falling back to production/latest Resource
runtime.

## Safe Dependency Query Boundary

Dependency inspection and safe query operations are provider-neutral Appaloft operations, not
transport shortcuts.

The accepted initial shape is:

| Operation | Meaning |
| --- | --- |
| `dependency-resources.inspect` | Read safe dependency reachability and metadata such as kind, readiness, version, size/shape summary, and allowed query capabilities. |
| `dependency-resources.query` | Run a bounded read-only provider-neutral query against a dependency resource through an adapter-owned safe execution boundary. |

The first provider-specific query policies must be restrictive:

- Postgres: read-only transaction, statement timeout, row and byte limits, explicit `SELECT` /
  schema-introspection allowlist, no DDL/DML/session mutation, no raw connection string output.
- Redis: command allowlist such as `PING`, `INFO`, `DBSIZE`, `GET`, `TTL`, bounded `SCAN`, no
  `KEYS`, `CONFIG`, `FLUSH*`, `EVAL`, module admin commands, or mutation commands.

MCP/tool descriptors for these dependency read operations must be read-only and idempotent when
the operation kind is a query. Query results must be bounded and redacted; Appaloft must not persist
full result sets by default.

## Public Surface Semantics

CLI, HTTP/oRPC, Web, SDK metadata, and MCP/tool surfaces must converge on the same application
schemas. Acceptable CLI examples include:

```bash
appaloft resource logs --preview <previewEnvironmentId> --follow
appaloft resource health --preview <previewEnvironmentId>
appaloft resource diagnose --preview <previewEnvironmentId>
appaloft resource runtime restart --preview <previewEnvironmentId>
appaloft resource terminal --preview <previewEnvironmentId>
appaloft resource dependency list --preview <previewEnvironmentId>
appaloft dependency inspect --preview <previewEnvironmentId> --binding db
appaloft dependency query --preview <previewEnvironmentId> --binding db --statement "select 1"
```

The public model may later add a generic `--scope preview:<id>` selector, but that must remain a
transport alias for the same operation schemas and resolver.

## Consequences

- Preview read/operate surfaces become natural extensions of Resource operations without
  duplicating business operations.
- Runtime and terminal safety remains governed by ADR-018, ADR-020, ADR-022, and ADR-038.
- Dependency runtime injection and secret resolution remain governed by ADR-040 and ADR-041.
- MCP stays operation-catalog backed under ADR-080; it does not gain preview-only tools that bypass
  application buses.
- Code Round must add resolver tests, operation/schema tests, CLI tests, and MCP descriptor tests
  for every inherited operation family.

## Governed Specs

- [Preview Operable Runtime Scope](../specs/101-preview-operable-runtime-scope/spec.md)
- [Preview Operable Runtime Scope Test Matrix](../testing/preview-operable-runtime-scope-test-matrix.md)
- [Product-Grade Preview Deployments](../specs/046-product-grade-preview-deployments/spec.md)
- [Resource Runtime Log Observation Workflow](../workflows/resource-runtime-log-observation.md)
- [Operator Terminal Session Workflow](../workflows/operator-terminal-session.md)
- [Dependency Resource Lifecycle Workflow](../workflows/dependency-resource-lifecycle.md)
- [Appaloft As MCP Transport Boundary](./ADR-080-appaloft-as-mcp-transport-boundary.md)

## Migration Gaps

- Existing resource operations accept only `resourceId`; Code Round must add preview selectors only
  to the service/runtime-scoped operations listed by the spec.
- Product-grade preview Web pages show preview identity and cleanup state, but operational tabs
  must be aligned with the same preview scope resolver.
- Safe dependency query operations are accepted by this ADR but must not be exposed until local
  command/query specs, adapter policies, and tests are complete.
