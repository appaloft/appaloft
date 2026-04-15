# ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary

Status: Accepted

Date: 2026-04-14

## Decision

Reusable source, build, runtime, health, and access-route defaults belong to the Resource side of the domain model, not to the Deployment aggregate.

`deployments.create` creates one deployment attempt. It consumes the source/runtime/network profile owned by `Resource` and persists only the resolved deployment attempt snapshot.

The target domain vocabulary is:

- `SourceLocator`: an entry input pointer used to detect or resolve a source descriptor.
- `SourceDescriptor`: the normalized source fact used by runtime planning.
- `ResourceSourceBinding`: durable reusable source configuration owned by the resource lifecycle.
- `ResourceRuntimeProfile`: durable reusable build, start, and health defaults owned by the resource lifecycle.
- `ResourceNetworkProfile`: durable reusable workload endpoint configuration, including the internal application listener port, governed by [ADR-015](./ADR-015-resource-network-profile.md).
- `RuntimePlanStrategy`: the planning strategy used to resolve a runtime plan from a source and runtime profile.
- `RuntimePlanSnapshot`: the immutable resolved runtime plan persisted by the deployment attempt.

`deploymentMethod` is not a domain term. The domain term is `RuntimePlanStrategy`.

The target boundary is:

```text
Resource
  -> ResourceSourceBinding
  -> ResourceRuntimeProfile
  -> ResourceNetworkProfile
  -> ResourceAccessProfile or DomainBinding references

Deployment
  -> DeploymentAttempt
  -> EnvironmentSnapshot
  -> RuntimePlanSnapshot
```

`Deployment` must persist the resolved runtime plan, resolved network snapshot, and environment snapshot used by the attempt. It must not become the long-term source of truth for reusable source binding, build commands, start commands, internal listener port, health-check policy, domain names, proxy policy, or TLS policy.

## Context

`CreateDeploymentCommand` currently accepts fields such as:

- `source`;
- `deploymentMethod`;
- `installCommand`;
- `buildCommand`;
- `startCommand`;
- `port`;
- `healthCheckPath`;
- `proxyKind`;
- `domains`;
- `pathPrefix`;
- `tlsMode`.

These fields are useful for first-deploy bootstrap and one-off runtime plan resolution, but they mix several different domain concepts under one deployment command.

The platform now has an accepted explicit `resources.create` minimum lifecycle. That command intentionally creates only the resource profile. The next resource lifecycle slices need a clear boundary for where reusable deployment configuration belongs.

## Options Considered

### Option A: Keep All Runtime Configuration On `deployments.create`

This keeps the current API shape and lets deployment bootstrap continue to create resources and runtime plans in one step.

This option is rejected as the target boundary because it makes deployments own reusable configuration and keeps Quick Deploy as an implicit resource-configuration path.

### Option B: Move All Existing Fields Into `resources.create`

This would make `resources.create` accept source, build, runtime, health, route, TLS, and domain configuration in one command.

This option is rejected because `resources.create` is governed by ADR-011 as a minimum profile creation command. Expanding it would mix source binding, runtime profile, health policy, route policy, and TLS lifecycle into the first resource slice.

### Option C: Introduce Explicit Resource Configuration Operations And Keep Deployment Overrides Transitional

This keeps `resources.create` minimal, introduces future resource-side operations for durable configuration, and allows `deployments.create` to carry one-shot overrides only until callers and runtime planning are migrated.

This option is superseded by [ADR-014](./ADR-014-deployment-admission-uses-resource-profile.md).

### Option D: Use Resource Source/Runtime Profile For Deployment Admission

This lets first-deploy resource creation persist source/runtime/network profile and makes `deployments.create` consume that profile.

This option is accepted by [ADR-014](./ADR-014-deployment-admission-uses-resource-profile.md).

## Chosen Rule

`resources.create` owns the durable resource profile. When a first-deploy workflow creates a resource, it may persist the resource source binding and runtime profile required for deployment planning.

Reusable source configuration must be modeled by a future explicit resource source operation, for example `resources.bind-source` or `resource-source-bindings.create`.

Reusable build/runtime/health configuration must be modeled by a future explicit resource runtime-profile operation, for example `resources.configure-runtime`.

Reusable workload network endpoint configuration must follow [ADR-015](./ADR-015-resource-network-profile.md). The internal application listener port belongs to `ResourceNetworkProfile`, not to deployment admission.

Reusable domain/routing/TLS lifecycle remains governed by ADR-002 and the routing/domain/TLS command set:

- durable domains belong to `domain-bindings.create`;
- certificate lifecycle belongs to certificate commands;
- proxy bootstrap belongs to server/proxy lifecycle commands and events;
- deployment runtime access-route hints may remain one-shot attempt overrides until a resource access-profile operation is accepted.

`deployments.create` must not keep source, runtime, health, route, domain, or TLS configuration fields as public command input. Its deployment-specific input is the deployment context id set governed by [ADR-014](./ADR-014-deployment-admission-uses-resource-profile.md).

New domain code and new specs must use the domain terms above. They must not introduce additional fields named as if `Deployment` owns source binding, runtime profile, health policy, domain binding, or TLS policy.

`SourceDescriptor.kind` and `RuntimePlanStrategy` are not synonyms. A runtime planner may derive a default strategy from the source descriptor, but an explicit strategy override must be validated against the source descriptor and rejected as a command-admission error when the pair cannot produce a valid runtime plan.

Any future redeploy command must prefer the resource-side durable profile plus explicit redeploy overrides accepted by that command. Existing latest deployment snapshots may be used only as a migration fallback for resources that predate profile persistence.

## Consequences

The model separates four concepts:

- Resource profile: durable deployable unit identity and ownership.
- Resource configuration: reusable source/runtime/network/health/access defaults.
- Deployment attempt: a single accepted execution request.
- Deployment snapshot: immutable runtime plan and environment snapshot used by one attempt.

Deployment bootstrap can remain as a compatibility seam while the first resource operations are implemented.

Future implementation must not add more reusable configuration fields to `deployments.create`. New durable configuration belongs to explicit resource, domain-binding, certificate, or server/proxy operations.

## Governed Specs

- [resources.create Command Spec](../commands/resources.create.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [Quick Deploy Workflow Spec](../workflows/quick-deploy.md)
- [Resource Create And First Deploy Workflow Spec](../workflows/resources.create-and-first-deploy.md)
- [resources.create Implementation Plan](../implementation/resources.create-plan.md)
- [ADR-014: Deployment Admission Uses Resource Profile](./ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-015: Resource Network Profile](./ADR-015-resource-network-profile.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Domain Model](../DOMAIN_MODEL.md)

## Superseded Open Questions

- Should `deploymentMethod`, source descriptor, install/build/start commands, internal port, and health-check path be modeled as deployment command fields or resource configuration?
- Should the internal application listener port stay in `ResourceRuntimeProfile` or move to `ResourceNetworkProfile`?
- Should deployment routing/TLS fields be moved directly to `resources.create`?
- Should `Deployment` keep reusable resource configuration, or only the resolved runtime plan snapshot for an attempt?

## Current Implementation Notes And Migration Gaps

Current `CreateDeploymentCommand` still accepts the transitional runtime/source/route fields until the ADR-014 implementation completes.

Current `DeploymentContextBootstrapService` can create or reuse resources during deployment admission.

Public redeploy behavior is removed from the v1 deployment command surface by [ADR-016](./ADR-016-deployment-command-surface-reset.md). Any future redeploy behavior must rebuild its own command spec, workflow, test matrix, and resource-profile snapshot rules before re-entering the public Web/API/CLI surface.

Resource-side source binding, runtime profile, and network profile persistence are being introduced through the first-deploy `resources.create` path. Dedicated update/configuration commands remain future work.

Current code still stores `port` inside `ResourceRuntimeProfile`; [ADR-015](./ADR-015-resource-network-profile.md) governs the migration to `ResourceNetworkProfile.internalPort`.

## Open Questions

- What exact operation names should be used for resource source binding and resource runtime profile configuration?
