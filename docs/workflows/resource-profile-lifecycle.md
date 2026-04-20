# Resource Profile Lifecycle Workflow Spec

## Normative Contract

Resource Profile Lifecycle is the owner-scoped workflow for inspecting and changing a resource's
durable profile after creation.

It is not a single command. Every user-visible mutation must dispatch one explicit command:

- `resources.configure-source`
- `resources.configure-runtime`
- `resources.configure-network`
- `resources.configure-health`
- `resources.archive`
- `resources.delete`

Every user-visible full detail read must dispatch `resources.show`.

No Web, CLI, HTTP, automation, or future MCP entrypoint may expose a generic `resources.update`
operation for these behaviors.

## Global References

This workflow inherits:

- [ADR-011: Resource Create Minimum Lifecycle](../decisions/ADR-011-resource-create-minimum-lifecycle.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-013: Project Resource Navigation And Deployment Ownership](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [resources.show Query Spec](../queries/resources.show.md)
- [resources.configure-source Command Spec](../commands/resources.configure-source.md)
- [resources.configure-runtime Command Spec](../commands/resources.configure-runtime.md)
- [resources.configure-network Command Spec](../commands/resources.configure-network.md)
- [resources.configure-health Command Spec](../commands/resources.configure-health.md)
- [resources.archive Command Spec](../commands/resources.archive.md)
- [resources.delete Command Spec](../commands/resources.delete.md)
- [Resource Profile Lifecycle Test Matrix](../testing/resource-profile-lifecycle-test-matrix.md)
- [Resource Profile Lifecycle Implementation Plan](../implementation/resource-profile-lifecycle-plan.md)
- [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Workflow Purpose

The workflow gives operators a stable way to:

1. Open one resource detail/profile surface.
2. Change source, runtime, network, or health configuration independently.
3. Retire a resource through archive.
4. Permanently delete only archived, unreferenced resources.
5. See how the updated profile will affect future deployment admission.

Profile changes are reusable configuration for future deployments. They are not deployment
execution, redeploy, restart, route apply, domain binding, certificate issuance, or runtime
cleanup.

## Operation Boundaries

| User intent | Operation | Mutates | Must not mutate |
| --- | --- | --- | --- |
| View resource details | `resources.show` | Nothing | Any aggregate, runtime, route, deployment, domain, certificate, or source link |
| Change repository/image/source root | `resources.configure-source` | `ResourceSourceBinding` | Runtime profile, network profile, health policy, deployment snapshots, source links |
| Change build/start/static/Compose planning | `resources.configure-runtime` | Runtime planning profile | Source binding, network profile, health policy, runtime target state |
| Change internal listener/exposure profile | `resources.configure-network` | `ResourceNetworkProfile` | Domains, generated access policy, proxy routes, current runtime |
| Change health probe policy | `resources.configure-health` | Resource health policy | Source/runtime/network profile outside health policy fields |
| Retire resource | `resources.archive` | Resource lifecycle status | Runtime stop, route/domain/certificate/source-link cleanup |
| Remove unused archived resource from active state | `resources.delete` | Archived unreferenced resource identity | Cascading cleanup of blockers |

## Entry Flow

Resource detail entry:

```text
resources.show(resourceId)
  -> optional resources.health(resourceId)
  -> optional resources.runtime-logs(resourceId)
  -> optional resources.diagnostic-summary(resourceId)
```

Source configuration:

```text
resources.show(resourceId)
  -> resources.configure-source(resourceId, source)
  -> resources.show(resourceId)
```

Runtime configuration:

```text
resources.show(resourceId)
  -> resources.configure-runtime(resourceId, runtimeProfile)
  -> resources.show(resourceId)
```

Network configuration:

```text
resources.show(resourceId)
  -> resources.configure-network(resourceId, networkProfile)
  -> resources.show(resourceId)
```

Health configuration:

```text
resources.show(resourceId)
  -> resources.configure-health(resourceId, healthCheck)
  -> resources.health(resourceId)
```

Archive:

```text
resources.show(resourceId)
  -> resources.archive(resourceId)
  -> resources.show(resourceId)
```

Delete:

```text
resources.show(resourceId)
  -> resources.archive(resourceId) when needed
  -> resources.delete(resourceId, confirmation.resourceSlug)
  -> resources.list(project/environment filter)
```

## Lifecycle Guards

Active resources may accept profile mutation commands when command-specific validation passes.

Archived resources:

- remain readable through retained read queries;
- reject new `deployments.create` attempts;
- reject `resources.configure-source`;
- reject `resources.configure-runtime`;
- reject `resources.configure-network`;
- reject `resources.configure-health`;
- may be passed to `resources.delete` after deletion guards pass.

`resources.archive` is synchronous lifecycle-state mutation. Command success means archived state
was durably persisted and `resource-archived` was recorded or published. It does not mean runtime,
domain, certificate, proxy, source-link, deployment, log, terminal-session, or dependency cleanup
has happened.

Deleted resources:

- are omitted from normal resource lists;
- return `not_found` from normal `resources.show`;
- may return idempotent `ok({ id })` from `resources.delete` only when a write-side deleted
  tombstone can be resolved;
- require a separate future audit query if deleted-resource inspection is needed.

## Deployment Relationship

Profile changes affect future `deployments.create` admission only. They do not mutate historical
deployment snapshots or current runtime.

When the operator wants changed profile state to become runtime state, they must create a new
deployment through the explicit deployment workflow once that is appropriate. Redeploy remains
rebuild-required under ADR-016 and is not introduced by this workflow.

## Access And Domain Relationship

Network profile configures the resource endpoint. It does not configure public domains, generated
default access policy, path prefixes, certificate policy, or TLS.

Domain, default access, certificate, and proxy route realization workflows may observe the resource
network profile, but they keep their own commands and lifecycle events.

## Entrypoints

| Entrypoint | Required behavior |
| --- | --- |
| Web | Resource detail is owner-scoped. Each profile section dispatches the matching operation and refetches `resources.show` or the relevant observation query. |
| CLI | Each operation has its own `appaloft resource ...` subcommand. No `appaloft resource update` generic mutation. |
| oRPC / HTTP | Each operation has its own route using the application command/query schema. No parallel transport-only input shape. |
| Automation / MCP | Future tools map one-to-one to operation keys. Tools must not combine unrelated source/runtime/network/archive/delete behavior. |

## Current Implementation Notes And Migration Gaps

Current implementation has active resource create/list, `resources.show`,
`resources.configure-source`, `resources.configure-runtime`, `resources.configure-health`,
`resources.configure-network`, and `resources.archive` surfaces. The Web resource detail page
dispatches `resources.show` for durable profile data, dispatches source/runtime/network/health
forms through separate commands, and dispatches archive through the dedicated lifecycle action.

Archived-resource guards are active for source/runtime/network/health mutations and deployment
admission. `resources.delete` is specified as the next guarded cleanup slice: it may delete only
archived resources with matching slug confirmation and no retained blockers. Each future Code
Round must update `CORE_OPERATIONS.md` and `operation-catalog.ts` in the same change that exposes
the operation.

## Open Questions

- None for operation boundaries in this workflow. Compact navigation status remains a separate read
  model/query decision.
