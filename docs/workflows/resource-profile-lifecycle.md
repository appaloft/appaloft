# Resource Profile Lifecycle Workflow Spec

## Normative Contract

Resource Profile Lifecycle is the owner-scoped workflow for inspecting and changing a resource's
durable profile after creation.

It is not a single command. Every user-visible mutation must dispatch one explicit command:

- `resources.configure-source`
- `resources.configure-runtime`
- `resources.configure-network`
- `resources.configure-access`
- `resources.configure-health`
- `resources.set-variable`
- `resources.import-variables`
- `resources.unset-variable`
- `resources.attach-storage`
- `resources.detach-storage`
- `resources.archive`
- `resources.delete`

Every user-visible full detail read must dispatch `resources.show`.
Every user-visible effective configuration read must dispatch `resources.effective-config`.

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
- [resources.configure-access Command Spec](../commands/resources.configure-access.md)
- [resources.configure-health Command Spec](../commands/resources.configure-health.md)
- [resources.set-variable Command Spec](../commands/resources.set-variable.md)
- [resources.import-variables Command Spec](../commands/resources.import-variables.md)
- [resources.unset-variable Command Spec](../commands/resources.unset-variable.md)
- [resources.attach-storage Command Spec](../commands/resources.attach-storage.md)
- [resources.detach-storage Command Spec](../commands/resources.detach-storage.md)
- [resources.effective-config Query Spec](../queries/resources.effective-config.md)
- [Storage Volume Lifecycle Workflow](./storage-volume-lifecycle.md)
- [resources.archive Command Spec](../commands/resources.archive.md)
- [resources.delete Command Spec](../commands/resources.delete.md)
- [Resource Profile Drift Visibility](../specs/011-resource-profile-drift-visibility/spec.md)
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
3. Change resource-scoped variables and secrets independently from environment scope.
4. Paste or import `.env` content into a resource without exposing raw secrets on read surfaces.
5. Inspect the masked effective configuration that future deployments will snapshot and see safe
   override summaries.
6. Inspect profile drift between the current Resource profile, normalized entry workflow profile,
   and latest deployment snapshot.
7. Attach and detach durable storage for future deployment snapshot materialization.
8. Bind and unbind dependency resources for future deployment snapshot materialization without
   injecting current runtime environment variables.
9. Retire a resource through archive.
10. Permanently delete only archived, unreferenced resources.

Profile changes are reusable configuration for future deployments. They are not deployment
execution, redeploy, restart, route apply, domain binding, certificate issuance, or runtime
cleanup.

## Operation Boundaries

| User intent | Operation | Mutates | Must not mutate |
| --- | --- | --- | --- |
| View resource details | `resources.show` | Nothing | Any aggregate, runtime, route, deployment, domain, certificate, or source link |
| Change repository/image/source root | `resources.configure-source` | `ResourceSourceBinding` | Runtime profile, network profile, health policy, deployment snapshots, source links |
| Change build/start/static/Compose planning and reusable runtime naming | `resources.configure-runtime` | Runtime planning profile | Source binding, network profile, health policy, runtime target state |
| Change internal listener/exposure profile | `resources.configure-network` | `ResourceNetworkProfile` | Domains, generated access policy, proxy routes, current runtime |
| Change generated access preferences | `resources.configure-access` | `ResourceAccessProfile` | Network endpoint, default access policy records, domains, certificates, current runtime |
| Change health probe policy | `resources.configure-health` | Resource health policy | Source/runtime/network profile outside health policy fields |
| Set one resource-scoped variable override | `resources.set-variable` | Resource config override layer | Environment variables, deployment snapshots, current runtime, domains |
| Import pasted `.env` variables | `resources.import-variables` | Resource config override layer | Environment variables, deployment snapshots, current runtime, domains, dependency bindings |
| Remove one resource-scoped variable override | `resources.unset-variable` | Resource config override layer | Environment variables, deployment snapshots, current runtime, domains |
| Inspect effective future deployment configuration | `resources.effective-config` | Nothing | Resource lifecycle, current runtime, historical deployment snapshots |
| Attach durable storage | `resources.attach-storage` | Resource storage attachment profile | Storage volume lifecycle, current runtime, historical deployment snapshots |
| Detach durable storage | `resources.detach-storage` | Resource storage attachment profile | Storage deletion, current runtime, historical deployment snapshots |
| Bind dependency resource | `resources.bind-dependency` | ResourceBinding metadata | Dependency resource lifecycle, current runtime, historical deployment snapshots |
| Unbind dependency resource | `resources.unbind-dependency` | ResourceBinding lifecycle/tombstone | Dependency resource deletion, current runtime, historical deployment snapshots |
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

Access configuration:

```text
resources.show(resourceId)
  -> resources.configure-access(resourceId, accessProfile)
  -> resources.show(resourceId)
```

Health configuration:

```text
resources.show(resourceId)
  -> resources.configure-health(resourceId, healthCheck)
  -> resources.health(resourceId)
```

Resource variables:

```text
resources.show(resourceId)
  -> resources.effective-config(resourceId)
  -> resources.set-variable(resourceId, variable)
  -> resources.effective-config(resourceId)
```

Resource `.env` import:

```text
resources.show(resourceId)
  -> resources.effective-config(resourceId)
  -> resources.import-variables(resourceId, content, exposure)
  -> resources.effective-config(resourceId)
```

Resource variable removal:

```text
resources.show(resourceId)
  -> resources.effective-config(resourceId)
  -> resources.unset-variable(resourceId, key, exposure)
  -> resources.effective-config(resourceId)
```

Resource storage attachment:

```text
resources.show(resourceId)
  -> storage-volumes.show(storageVolumeId)
  -> resources.attach-storage(resourceId, storageVolumeId, destinationPath)
  -> resources.show(resourceId)
```

Resource storage detachment:

```text
resources.show(resourceId)
  -> resources.detach-storage(resourceId, attachmentId)
  -> resources.show(resourceId)
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
- reject `resources.configure-access`;
- reject `resources.configure-health`;
- reject `resources.set-variable`;
- reject `resources.import-variables`;
- reject `resources.unset-variable`;
- reject `resources.attach-storage`;
- reject `resources.detach-storage`;
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

Resource-scoped variables participate in that same future-only rule. Accepted resource variables and
secrets override environment-scoped entries with the same `key` plus `exposure` identity when a
future deployment snapshot is materialized. Changing or deleting a resource-scoped variable does
not mutate historical deployment snapshots or update a currently running workload in place.
Pasted `.env` imports follow the same future-only rule. They are bulk resource override mutations,
not deployment commands and not current-runtime hot reloads.

`.env` imports must reject malformed keys before persistence. Duplicate `key + exposure`
identities inside one pasted payload use last occurrence wins and must be reported as safe metadata.
Existing resource entries with the same identity are replaced and reported as safe override
metadata. Secret-like keys are classified as runtime secrets unless the caller explicitly marks them
plain; build-time variables must use `PUBLIC_` or `VITE_`, and build-time variables cannot be
secrets.

Runtime naming intent is part of that same future-only rule. Changing a resource's
`runtimeProfile.runtimeName` changes how future deployments derive effective Docker container or
Compose project names. It must not rename a currently running workload in place, and it must not
be treated as permission to clean up another resource that happens to use the same requested name.

Resource storage attachments follow the same future-only rule. Attaching or detaching storage
changes the durable Resource profile used by future deployment snapshot materialization. It must
not apply a mount to current runtime state, provision provider-native volumes, delete storage,
perform backup/restore, or rewrite historical deployment snapshots.

When the operator wants changed profile state to become runtime state, they must create a new
deployment through the explicit deployment workflow once that is appropriate. Redeploy remains
rebuild-required under ADR-016 and is not introduced by this workflow.

## Resource Profile Drift Visibility

Profile drift is read/preflight behavior over this workflow's existing resource-owned concerns. It
does not introduce a new operation and it does not mutate the Resource.

`resources.show(includeProfileDiagnostics = true)` may report drift across three objects:

- current Resource profile: source, runtime, network, access, health, and resource-scoped
  configuration state owned by the Resource;
- entry workflow normalized profile: repository config, trusted CLI/Action flags, Web/local-agent
  draft input, or future MCP input after profile precedence and schema validation;
- latest deployment snapshot profile: immutable source/runtime/network/access/health/configuration
  facts captured by the latest deployment attempt.

Drift must be grouped by section: `source`, `runtime`, `network`, `access`, `health`, or
`configuration`. Each item should name the canonical field path, comparison type, safe values or
redacted summaries, whether it blocks deployment admission, and the matching explicit remediation
operation.

Admission rules:

- Current Resource profile versus latest deployment snapshot drift is informational. It shows that
  the latest attempt was created from older profile state and does not block a new deployment.
- Entry workflow normalized profile versus current Resource profile drift blocks config deploy before
  `deployments.create` unless the entry workflow first dispatches the matching explicit operation
  such as `resources.configure-source`, `resources.configure-runtime`, `resources.configure-network`,
  `resources.configure-access`, `resources.configure-health`, `resources.set-variable`, or
  `resources.unset-variable`.
- `deployments.create` must not receive entry profile fields or drift overrides.
- Secret/configuration drift must stay redacted and must never expose raw values in diagnostics,
  errors, logs, events, or read models.

## Access And Domain Relationship

Network profile configures the resource endpoint. It does not configure public domains, generated
default access provider policy, certificate policy, or TLS.

Access profile configures resource-owned generated access preferences for future route resolution.
It may disable generated default access for one resource or choose the route path prefix used for
generated default access. It does not create durable custom domains, issue certificates, change
system/server default access policy records, or apply proxy routes to current runtime state.

Domain, default access, certificate, and proxy route realization workflows may observe the resource
network and access profiles, but they keep their own commands and lifecycle events.

## Entrypoints

| Entrypoint | Required behavior |
| --- | --- |
| Web | Resource detail is owner-scoped. Each source/runtime/network/access/health/configuration section dispatches the matching operation and refetches `resources.show`, `resources.effective-config`, or the relevant observation query. Editors must make the future deployment boundary visible: saving them persists durable resource profile or override state for future deployment admission, verification, route planning, or deployment snapshot materialization; it does not create deployments, rewrite historical deployment snapshots, immediately restart current runtime, bind domains, issue certificates, or apply proxy routes. |
| CLI | Each operation has its own `appaloft resource ...` subcommand. No `appaloft resource update` generic mutation. `appaloft resource import-variables <resourceId> --content <dotenv>` imports pasted `.env` content and masks secret values in output. `appaloft resource show --json` may expose drift diagnostics, and config deploy must report blocking entry-profile drift with the explicit command to run. |
| oRPC / HTTP | Each operation has its own route using the application command/query schema. No parallel transport-only input shape. `POST /api/resources/{resourceId}/variables/import` dispatches `resources.import-variables`. `POST /api/resources/{resourceId}/storage-attachments` dispatches `resources.attach-storage`; `DELETE /api/resources/{resourceId}/storage-attachments/{attachmentId}` dispatches `resources.detach-storage`. `GET /api/resources/{resourceId}` carries drift diagnostics and storage attachment summaries through `resources.show` rather than a new resource query. |
| Automation / MCP | Future tools map one-to-one to operation keys. Tools must not combine unrelated source/runtime/network/archive/delete behavior. Future MCP drift visibility should reuse `resources.show` diagnostics and suggested operation keys. |

## Current Implementation Notes And Migration Gaps

Current implementation has active resource create/list, `resources.show`,
`resources.configure-source`, `resources.configure-runtime`, `resources.configure-health`,
`resources.configure-network`, `resources.configure-access`, `resources.set-variable`,
`resources.unset-variable`, `resources.effective-config`, `resources.archive`, and
`resources.delete` surfaces. The Web resource detail page dispatches `resources.show` for durable
profile data, dispatches source/runtime/network/access/health/configuration forms through separate
commands, and dispatches archive/delete through dedicated lifecycle actions. Resource detail renders
the future deployment boundary so operators can distinguish durable resource-level profile edits
from deployment creation, redeploy, restart, domain binding, certificate issuance, route apply, or
historical snapshot mutation.

Archived-resource guards are active for source/runtime/network/access/health mutations and deployment
admission. `resources.delete` may delete only archived resources with matching slug confirmation
and no retained blockers. Each future Code Round must update `CORE_OPERATIONS.md` and
`operation-catalog.ts` in the same change that exposes the operation.

Resource storage attachment operations are proposed by
[Storage Volume Lifecycle And Resource Attachment](../specs/032-storage-volume-lifecycle-and-resource-attachment/spec.md)
and are active after that Code Round. Resource dependency binding operations are proposed by
[Dependency Resource Binding Baseline](../specs/034-dependency-resource-binding-baseline/spec.md)
and remain provider-neutral control-plane metadata until snapshot materialization and runtime
injection are specified.

## Open Questions

- None for operation boundaries in this workflow. Compact navigation status remains a separate read
  model/query decision.
