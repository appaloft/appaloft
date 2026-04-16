# ADR-013: Project Resource Navigation And Deployment Ownership

Status: Accepted

Date: 2026-04-14

## Decision

The console information architecture and operation ownership must follow:

```text
Project
  -> Resource
      -> Deployment attempts and deployment history
```

`Project` is the top-level workspace and resource collection boundary. It is not the owner of deployment actions.

`Resource` is the deployable unit. New deployment, deployment history, source/runtime/network
configuration, current health observation, generated access observation, runtime logs, diagnostic
summary, resource-scoped domains, and resource-scoped environment/configuration affordances belong
primarily on the resource surface. Public redeploy behavior is not part of the v1 deployment
command surface unless reintroduced by a later accepted ADR and local specs.

`Deployment` is a resource-scoped execution attempt. It is not a top-level user-managed object independent of a resource, and it must not become the owner of reusable source, runtime, network, domain, TLS, or health policy.

The console navigation must prefer:

```text
Projects
  -> Project
      -> Resource
          -> Deployments
          -> Domains
          -> Variables / configuration
```

The left sidebar may show projects as expandable groups and resources as child items. Resource child
items should show resource health from a read model or projection when available. Latest deployment
status is a migration fallback and contextual history, not current resource health.

Project pages may expose project-level rollups, including all deployments for the project, but those rollups are read-model views. They must not make deployments appear to be project-owned write operations.

## Context

The resource lifecycle is now explicit through `resources.create`, and deployment configuration boundaries are governed by ADR-012.

The console currently needs a clearer product-facing model:

- entering a project should show the resources in that project;
- resource pages should be the owner-scoped surface for deployment actions;
- deployment history should be viewed in the context of a resource;
- source/runtime/network setup, such as GitHub, Docker image, Dockerfile, Docker Compose, command-based runtime, internal listener port, and health policy, belongs to resource lifecycle language rather than project-level deployment language;
- project-level deployment lists can exist, but they are aggregate read views across resources.

## Options Considered

### Option A: Project-Centered Deployment Actions

This keeps "new deployment" and "view deployments" as primary project-page actions.

This option is rejected as the target model because it makes deployment appear project-owned and keeps source/runtime setup detached from the deployable resource that should own it.

### Option B: Resource-Centered Deployment Actions

This makes the project page a resource collection surface and makes the resource page the primary surface for deployments, deployment history, source/runtime configuration, domains, and resource-scoped lifecycle actions.

This option is accepted.

### Option C: Global Deployment-Centered Navigation

This makes deployments the primary navigation object and treats resources as secondary metadata.

This option is rejected as the main information architecture because deployment attempts are historical executions, not the durable deployable unit that users configure over time.

## Chosen Rule

Project surfaces must prioritize resource collection:

- show project metadata and summary counts;
- show resources as the primary list;
- provide a create-resource action;
- provide a project-level all-deployments rollup only as a secondary read view;
- avoid presenting project-level "new deployment" as the primary action unless it is explicitly labeled as Quick Deploy or another entry workflow that will select/create a resource before deployment admission.

Resource surfaces must own deployment actions:

- keep the persistent resource header compact: resource identity, kind, and compact current-health
  indicator only; do not move basic profile fields, access URLs, project navigation, deployment
  history navigation, or routine configuration forms into the header action cluster;
- make the first resource tab the resource configuration/overview surface, with the resource access
  URL and key application/network configuration visible before deployment history;
- make configuration subsections act as nested tabs or equivalent route state that replaces the
  right-side panel; do not model them as same-page hash-anchor jumps;
- keep deployment history, runtime logs, terminal access, and operational history behind later
  top-level tabs because they are observations of attempts or runtime streams, not the durable
  application configuration, and do not show a redundant inner sidebar when such tabs have only one
  content panel;
- expose routine domain binding/TLS creation inline inside the resource configuration domain
  section. Do not use a modal for the normal resource-scoped domain binding path;
- keep top-right resource actions limited to current-state observation and the primary
  resource-scoped lifecycle action. Navigation actions such as "open project", "view deployments",
  "open access URL", and "bind domain" belong in the relevant tab content or sidebar section;
- show resource profile and configuration status;
- show source binding, runtime profile, and network profile setup state when those operations exist;
- show current resource health status when available;
- show latest deployment status as contextual history;
- show deployment history for that resource;
- provide new deployment actions for that resource;
- provide redeploy actions only after a future redeploy command is accepted and implemented under ADR-016;
- provide resource-scoped domain binding and TLS affordances;
- show generated default access route status when ADR-017 route snapshots/read models are available;
- show resource-scoped access URL from domain binding or access summary state, not only from a
  deployment detail snapshot;
- provide a copyable resource diagnostic summary when support/debug context is needed;
- provide resource-scoped environment/configuration affordances when the configuration belongs to the resource.

Resource creation surfaces must collect resource-owned configuration in resource language:

- provider/source selection such as GitHub, Docker image, Dockerfile, Docker Compose, local folder, or command-based workspace runtime belongs to resource source/runtime draft state;
- application port selection belongs to resource network draft state and must map to `ResourceNetworkProfile.internalPort`;
- `resources.create` remains the minimum profile command governed by ADR-011;
- durable source/runtime persistence belongs to resource source/runtime operations governed by ADR-012;
- durable network profile persistence belongs to resource network profile rules governed by ADR-015;
- generated default access display belongs to provider-neutral access route rules governed by ADR-017;
- create-resource and Quick Deploy surfaces may collect source/runtime/network drafts as resource-owned input before dispatching `resources.create`; they must not pass those fields to `deployments.create`.

Sidebar navigation must follow the same ownership:

- project nodes represent resource collection boundaries;
- resource nodes represent deployable units;
- resource nodes should display current resource health derived from read models when available;
- latest deployment status in navigation is contextual history and must not become Resource
  aggregate state or current health unless promoted by a separate decision.

## Consequences

The project page becomes a management surface for a group of resources rather than a deployment control panel.

The resource page becomes the natural place for:

- new deployment;
- future redeploy only after it is reintroduced under ADR-016;
- deployment history;
- domains and TLS;
- generated default access route status;
- source/runtime/network configuration;
- resource lifecycle actions.

Project-level deployment pages remain valid as reporting and filtering views, but project-level deployment actions must still converge on a selected or newly created resource before dispatching `deployments.create`.

Read models may denormalize compact resource health and latest deployment context per resource for
sidebar and list performance. Command admission must still validate against write-side state and
must not trust sidebar/read-model status as the sole invariant guard.

## Governed Specs

- [Domain Model](../DOMAIN_MODEL.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [resources.create Command Spec](../commands/resources.create.md)
- [deployments.create Command Spec](../commands/deployments.create.md)
- [Quick Deploy Workflow Spec](../workflows/quick-deploy.md)
- [Resource Create And First Deploy Workflow Spec](../workflows/resources.create-and-first-deploy.md)
- [Resource Diagnostic Summary Workflow Spec](../workflows/resource-diagnostic-summary.md)
- [resources.diagnostic-summary Query Spec](../queries/resources.diagnostic-summary.md)
- [Resource Health Observation Workflow Spec](../workflows/resource-health-observation.md)
- [resources.health Query Spec](../queries/resources.health.md)
- [Operator Terminal Session Workflow Spec](../workflows/operator-terminal-session.md)
- [terminal-sessions.open Command Spec](../commands/terminal-sessions.open.md)
- [Project Resource Console Workflow Spec](../workflows/project-resource-console.md)
- [Project Resource Console Test Matrix](../testing/project-resource-console-test-matrix.md)
- [Resource Diagnostic Summary Test Matrix](../testing/resource-diagnostic-summary-test-matrix.md)
- [Resource Health Test Matrix](../testing/resource-health-test-matrix.md)
- [Project Resource Console Implementation Plan](../implementation/project-resource-console-plan.md)
- [ADR-011: Resource Create Minimum Lifecycle](./ADR-011-resource-create-minimum-lifecycle.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](./ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-015: Resource Network Profile](./ADR-015-resource-network-profile.md)
- [ADR-016: Deployment Command Surface Reset](./ADR-016-deployment-command-surface-reset.md)
- [ADR-020: Resource Health Observation](./ADR-020-resource-health-observation.md)
- [ADR-022: Operator Terminal Session Boundary](./ADR-022-operator-terminal-session-boundary.md)

## Superseded Open Questions

- Should "new deployment" be a primary project-page action or a resource-owned action?
- Should project pages primarily show deployment lists or resource lists?
- Should source selection during create-resource belong to project, deployment, or resource language?
- Should internal application listener port belong to project, deployment, generic runtime setup, or resource network profile language?
- Should sidebar compact status be Resource aggregate state or a read-model projection?

## Current Implementation Notes And Migration Gaps

Current Web console project detail surfaces still include project-level deployment rollup and deployment actions.

Current resource creation is available as a project-page affordance. A dedicated create-resource page with source/runtime/network draft steps does not exist yet.

Current sidebar exposes Project -> Resource hierarchy with compact health status derived from
`resources.health`.

Current resource read models and deployment read models can support parts of this target shape, but
a dedicated resource summary projection may be needed to make compact resource health and latest
deployment context efficient and consistent.

`resources.health` exists and resource detail/sidebar must not use latest deployment status as
compact resource health.

The resource-scoped diagnostic summary query now exists and resource detail can copy its canonical
JSON payload. Deployment detail and Quick Deploy completion do not yet expose the affordance
directly.

Operator terminal sessions are specified as accepted candidate behavior, but the resource detail
terminal affordance, server terminal affordance, terminal command, transport, and runtime adapter
are not implemented yet.

## Open Questions

- Should compact resource health be added to `resources.list`, a future `resources.summary` query,
  or a separate navigation read model?
- Should the dedicated create-resource page dispatch only `resources.create` first, or support an optional guided path that immediately continues into Quick Deploy after creating the resource?
