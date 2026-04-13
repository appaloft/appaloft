# Domain Model

> CORE DOCUMENT
>
> This file is the domain-model source of truth for Yundu.
> If a package layout, aggregate name, or application slice conflicts with this file, this file wins.
> [CORE_OPERATIONS.md](/Users/nichenqin/projects/yundu/docs/CORE_OPERATIONS.md) defines the business surface.
> This file defines the domain boundaries and ubiquitous language underneath that surface.

## Design Goal

Yundu is not primarily "server CRUD". Its core project-facing flow is:

`Project -> Environment -> Resource -> Deployment`

Resources are the deployable units users organize inside environments. Workloads, config,
dependency bindings, releases, and runtime targets sit underneath that flow:

`Resource -> Workload -> Config / Resource Binding -> Release -> Deployment`

Runtime placement is a separate relationship:

`Resource -> Destination -> DeploymentTarget(Server)`

A deployment platform only becomes coherent when those boundaries are explicit.

## Core Principles

- aggregate boundaries follow invariants, not UI screens
- cross-aggregate references use IDs, not deep object graphs
- release and deployment are different concepts
- environment is a first-class domain object
- resource binding must remain an explicit domain concept
- core does not depend on Elysia, tsyringe, Kysely, PostgreSQL drivers, or UI frameworks
- repositories exist only for aggregate roots
- entities and value objects are persisted through the owning aggregate root, never through standalone repositories
- aggregate root state and entity state use branded value objects instead of raw strings, numbers, or status literals
- Yundu uses `unique symbol` branded classes for IDs, temporal values, statuses, names, slugs, addresses, and other domain-significant values
- state transitions live inside state-machine value objects such as `DeploymentStatusValue`, not in aggregate-level string-switch logic

## Bounded Contexts

Current Yundu is organized around these contexts:

### Workspace

Owns:
- `Project`
- `Environment`

Implemented now:
- `Project`
- `Environment`

### Configuration

Owns:
- `EnvironmentConfigSet`
- environment snapshots
- precedence and build/runtime separation

Implemented now:
- `EnvironmentConfigSet` as a domain value object used inside `Environment`
- immutable `EnvironmentSnapshot`

### Runtime Topology

Owns:
- `DeploymentTarget`
- `Destination`
- target capability and provider-facing endpoint metadata
- deployment placement / isolation boundaries on a target

Implemented now:
- `DeploymentTarget`
- optional deployment target credential state for local SSH agent or SSH private key access
- `Destination`

Transport compatibility note:
- CLI / HTTP still expose `server` naming for backward compatibility
- the core domain term is `DeploymentTarget`
- `Destination` is the concrete place a resource deploys to on a target/server; proxy and domain
  routing are not yet modeled as aggregates

### Workload Delivery

Owns:
- `Resource`
- `Workload`
- `SourceSpec`
- `BuildSpec`
- `RuntimeSpec`

Implemented now:
- foundational `Resource`
- foundational `Workload`, `SourceSpec`, `BuildSpec`, `RuntimeSpec` models in `core`
- runtime planning still flows through `RuntimePlanResolver` and `RuntimePlan`

### Dependency Resources

Owns:
- `ResourceInstance`
- `ResourceBinding`

Implemented now:
- foundational `ResourceInstance`
- foundational `ResourceBinding`

### Release Orchestration

Owns:
- `Release`
- `Deployment`
- rollback plans and execution results

Implemented now:
- `Release`
- `Deployment`
- `RuntimePlan`
- `RollbackPlan`

### Identity & Governance

Owns:
- `Organization`
- `Member`
- `Role`
- quota and billing policy

Implemented now:
- foundational `Organization`
- foundational `OrganizationMember`
- foundational `OrganizationPlan`

### Extensibility

Owns:
- `ProviderConnection`
- `IntegrationConnection`
- `PluginInstallation`

Implemented now:
- provider, integration, plugin registries and descriptors
- foundational `ProviderConnection`
- foundational `IntegrationConnection`
- foundational `PluginInstallation`

## Implemented Domain Object Inventory

### Aggregate Roots

- `Project`
- `Environment`
- `DeploymentTarget`
- `Destination`
- `Resource`
- `Workload`
- `ResourceInstance`
- `ResourceBinding`
- `Release`
- `Deployment`
- `Organization`
- `ProviderConnection`
- `IntegrationConnection`
- `PluginInstallation`

### Entities

- `OrganizationMember`

### Value Objects

- `EnvironmentConfigSet`
- `OrganizationPlan`
- `SourceSpec`
- `BuildSpec`
- `RuntimeSpec`
- `EnvironmentSnapshot`
- `RollbackPlan`
- `ExecutionResult`
- shared branded primitives such as IDs, timestamps, status/state-machine values, numeric values, and domain-significant text values

## Repository Rule

- `ProjectRepository` persists only the `Project` aggregate root
- `ServerRepository` persists only the `DeploymentTarget` aggregate root exposed through transport-compatible `server` naming
- `DestinationRepository` persists only the `Destination` aggregate root
- `EnvironmentRepository` persists only the `Environment` aggregate root
- `ResourceRepository` persists only the `Resource` aggregate root
- `DeploymentRepository` persists only the `Deployment` aggregate root
- selection spec visitors own the full persistence-query translation
- persistence adapters pass a `SelectQueryBuilder` into the selection visitor and execute the returned builder
- repositories must not split selection-spec translation into separate intermediate clause objects
- read models are not repositories and may shape data for query use cases
- entity and value object types such as `OrganizationMember`, `EnvironmentConfigSet`, `SourceSpec`, and `RollbackPlan` do not get independent repositories

## Aggregate Map

### Project

Meaning:
- top-level deployment management unit

Rules:
- slug must be derivable and stable
- archived projects must not accept new mutable child records

Current scope:
- metadata and ownership
- does not yet own persisted source bindings
- may be bootstrapped from a local deployment config or inferred local source metadata, but that
  config remains an adapter/application input and is not persisted as project source binding

### Environment

Meaning:
- deployment isolation boundary

Rules:
- names are unique within a project
- snapshots are immutable
- build-time variables must be explicitly public

Current scope:
- variables and snapshot logic are inside the aggregate
- `EnvironmentConfigSet` is modeled as a value object used by `Environment`

### DeploymentTarget

Meaning:
- generalized server / runtime host target

Rules:
- one target has one provider family
- unhealthy/draining targets should not accept new deployments

Current scope:
- single-node target metadata
- current transport compatibility name: `server`
- may be reused or created from deployment config after provider-key validation in the application
  layer; provider SDK specifics remain outside the aggregate

### Destination

Meaning:
- deployment placement and isolation boundary on a `DeploymentTarget`
- the target-side landing zone a resource deploys to

Rules:
- belongs to exactly one deployment target/server
- names are unique within a target
- deployments reference the selected destination as well as the selected target

Current scope:
- persisted and bootstrapped as a default local destination
- deployment config may declare a target-local destination
- proxy/domain routing remains a future access-layer model

### Workload

Meaning:
- the unit that is delivered and run

Rules:
- workload kind, build spec, and runtime spec must remain compatible
- static sites cannot declare worker runtimes

Current scope:
- foundational aggregate in `core`
- not yet persisted or exposed through commands

### Resource

Meaning:
- project/environment-scoped deployable unit
- can represent an app, API service, database, cache, worker, static site, external service, or
  Docker Compose stack

Rules:
- names are unique within a project environment
- compose-stack resources may contain multiple named services
- a resource may point at a default destination
- deployments belong to a resource, not directly to a raw source locator

Current scope:
- foundational aggregate in `core`
- persisted and listed through application read models
- deployment creation can resolve, bootstrap, and attach a resource and destination

### Release

Meaning:
- immutable delivery snapshot

Rules:
- once sealed, it is immutable
- it belongs to exactly one workload and one environment

Current scope:
- foundational aggregate in `core`
- deployment flows still materialize runtime plan + environment snapshot directly

### Deployment

Meaning:
- one execution attempt of a delivery plan for a resource against a destination on a deployment target

Rules:
- state transitions are ordered
- terminal state appears once
- rollback references prior successful execution

Current scope:
- state machine for plan -> run -> verify -> rollback
- belongs to exactly one `Resource`
- carries both `destinationId` and `serverId`; `serverId` remains in persisted shape for transport
  compatibility and efficient target lookup

### ResourceBinding

Meaning:
- explicit dependency contract between workload and resource instance

Rules:
- binding scope and injection mode must remain coherent
- build-only bindings must not leak runtime references

Current scope:
- foundational aggregate in `core`
- not yet wired into application operations

### ResourceInstance

Meaning:
- provisioned dependency resource owned by system, organization, or project scope

Rules:
- a resource instance belongs to exactly one owner scope
- status transitions must remain monotonic from provisioning to ready or deleted

Current scope:
- foundational aggregate in `core`
- provider-backed provisioning orchestration is still future work

### Organization

Meaning:
- governance boundary for hosted control-plane and future tenant isolation

Rules:
- at least one owner must exist at creation time
- plan changes cannot invalidate the current member count

Current scope:
- foundational aggregate in `core`
- identity provider integration is still future work

### ProviderConnection / IntegrationConnection / PluginInstallation

Meaning:
- explicit ownership and lifecycle for external provider access, external integrations, and system/plugin installation state

Rules:
- every connection or installation belongs to one owner scope
- lifecycle state is explicit and not inferred from transport-only settings

Current scope:
- foundational aggregates in `core`
- application persistence and commands are still future work

## Current Implementation Mapping

These directories are authoritative for current domain code:

```text
packages/core/src/
  shared/
  workspace/
  configuration/
  runtime-topology/
  workload-delivery/
  dependency-resources/
  release-orchestration/
  identity-governance/
  extensibility/
```

Root-level files under `packages/core/src/*.ts` now exist only as compatibility re-exports.
New domain work should go into the bounded-context directories above.

## Application Layer Mapping

Application slices should be understood through the same contexts:

- `workspace`: projects and environments
- `workload-delivery`: project resources and workloads
- `runtime-topology`: deployment target registration and listing
- `release-orchestration`: deployment creation, listing, logs, rollback
- `extensibility`: providers, plugins, GitHub repository browsing, diagnostics

## Naming Rules

- prefer domain names over implementation names
- prefer `DeploymentTarget` over `Server`
- prefer `Environment` over `EnvironmentProfile`
- use `Release` for immutable delivery snapshots
- use `Deployment` for runtime execution attempts

Compatibility aliases may exist temporarily, but new code and new docs should use the domain names.
