# ADR-126: Contextual Dashboard And Web Route Boundary

Status: Accepted

Date: 2026-08-24

Owner confirmation: 2026-08-24

## Decision

Appaloft will introduce `apps/dashboard` as a public static SvelteKit application alongside
`apps/web`. Dashboard becomes the future reference console; `apps/web` remains a legacy parallel
surface only for staged rollout and rollback until default cutover.

Dashboard information architecture follows the active owner scope:

```text
Workspace
  -> Project
      -> Environment context
          -> Resource
              -> Deployment attempts and runtime observation
```

The owner model from ADR-013 remains valid: Project owns the Resource collection, Resource owns
deployable configuration and Resource-scoped actions, and Deployment is one execution attempt.
ADR-126 supersedes ADR-013 only where ADR-013 prescribes a persistent Project -> Resource sidebar,
legacy Web tab placement, or compatibility routing.

The permanent Workspace destinations are:

```text
Projects / Infrastructure / Activity / Marketplace / Settings
```

Entering a Project replaces Workspace navigation with:

```text
Overview / Deployments / Observability / Settings
```

Environment is route-owned context in the Project header and is managed in Project Settings. It is
not another permanent Project navigation item. Selecting a Resource opens a route-backed detail
panel on wide screens and the same route as a full page on narrow screens.

Dashboard routes form a new pre-1.0 public route contract. Legacy `apps/web` paths may return 404
after cutover. Dashboard must not add redirects, aliases, compatibility query parsing, or fallback
renderers solely to preserve legacy deep links. Public documentation and release notes must state
the breaking route change before default cutover.

## Route Contract

Canonical Dashboard routes are:

| Scope                                      | Route                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| Workspace projects                         | `/projects`                                                                           |
| Workspace infrastructure                   | `/infrastructure`                                                                     |
| Workspace activity                         | `/activity`                                                                           |
| Workspace marketplace                      | `/marketplace`                                                                        |
| Workspace settings                         | `/settings`                                                                           |
| Project overview/list                      | `/projects/:projectId/overview?environment=:environmentId&view=list`                  |
| Project topology, after its benchmark gate | `/projects/:projectId/overview?environment=:environmentId&view=topology`              |
| Project deployments                        | `/projects/:projectId/deployments?environment=:environmentId`                         |
| Project observability                      | `/projects/:projectId/observability?environment=:environmentId`                       |
| Project settings                           | `/projects/:projectId/settings?environment=:environmentId`                            |
| Resource overview                          | `/projects/:projectId/resources/:resourceId/overview?environment=:environmentId`      |
| Resource deployments                       | `/projects/:projectId/resources/:resourceId/deployments?environment=:environmentId`   |
| Resource configuration                     | `/projects/:projectId/resources/:resourceId/configuration?environment=:environmentId` |
| Resource logs and metrics                  | `/projects/:projectId/resources/:resourceId/logs-metrics?environment=:environmentId`  |
| Resource networking                        | `/projects/:projectId/resources/:resourceId/networking?environment=:environmentId`    |
| Resource settings                          | `/projects/:projectId/resources/:resourceId/settings?environment=:environmentId`      |

The Project layout owns the desktop Resource panel. Closing it returns to the Project route while
preserving Environment, Project view, filters, sort, and cursor state. Back/Forward and refresh must
reconstruct the same context without local-storage-only navigation truth.

## Public Read-Model Boundary

Dashboard may add three neutral, bounded read projections:

- `projects.list-summaries`: cursor-paginated Project identity, bounded counts, attention summary,
  and last activity for the current execution tenant;
- `project-environments.overview`: one Project and Environment plus cursor-paginated Resource
  summaries, current health/access context, and latest Deployment context;
- `resources.overview`: one Resource identity/profile summary, health/access/configuration
  readiness, capabilities, and at most five latest Deployment summaries.

These are query projections, not new aggregates or mutation owners. They may denormalize observation
data for reading, but command admission must continue to use authoritative write-side state. Inputs
must be owner-scoped and bounded by default. The client must not reproduce these projections through
unbounded list joins or one health query per row.

## Extension Boundary

The existing `appaloft.console.extension-page/v1` renderer remains accepted. Extension metadata gains
an additive scoped navigation contract rather than a second page-document renderer. A contribution
may declare:

- owner scope: `workspace`, `project`, or `resource`;
- destination slot from the canonical Workspace/Project/Resource destinations;
- presentation: `page`, `section`, or `action`;
- stable key, label key, icon key, order, route template, and optional visibility endpoint.

Unknown scoped metadata is ignored by legacy Web. Dashboard places accepted contributions inside the
declared destination; it never promotes all `placement=navigation` contributions to permanent
Workspace navigation. Exact TypeScript schemas and compatibility tests are Code Round work.

## Visual Boundary

`@appaloft/design` will expose two versioned console presets during migration:

- `legacy-console-v1`, consumed by `apps/web`;
- `dashboard-v2`, consumed by `apps/dashboard` and promoted to the canonical console preset only
  after default cutover.

Dashboard v2 is Calm Infra: near-white luminous Light canvas, lifted warm-charcoal Dark canvas, soft
surface steps, 10px controls, 14-16px cards, 16-18px panels, 40-44px rows, restrained overlay-only
elevation, body text of at least 14px, and Appaloft blue as the sole primary action accent. Public
blue/cyan/violet ambient-light roles may add non-semantic shell depth, and pastel icon-surface roles
may distinguish repeated objects; neither role carries action or status meaning, and ordinary cards
do not glow. The preset must provide complete light/dark semantic tokens and reduced-motion
behavior. It is a clean-room synthesis; it must not copy Kun source, token values, gradient recipes,
or assets.

## Rollout Boundary

Rollout is:

1. parallel preview while legacy Web remains default;
2. opt-in beta after the first real Projects -> Project -> Resource loop passes its matrix;
3. gated default after all five Workspace destinations and the core Project/Resource journey are
   usable, performance/design/accessibility gates pass, and public docs/release notes are updated;
4. legacy Web removal only in a separately authorized cleanup slice.

Legacy feature parity and redirect coverage are explicitly not cutover gates.

## Consequences

- The new application can use deep route layouts and owner-scoped data loading without preserving
  legacy route/component structure.
- Release packaging and development commands must become static-surface-selectable before beta.
- Public neutral extension and read-model changes land before hosted/private composition consumes
  them.
- The existing Web console redesign plan and legacy density rules no longer govern Dashboard v2.
- Breaking route communication is required even though compatibility code is not.

## Rejected Alternatives

- Incremental `apps/web` refactor.
- A private hosted Dashboard fork.
- A permanent global sidebar containing every object type and extension.
- Client aggregation of existing broad queries instead of bounded projections.
- Mandatory redirect/parity work before cutover.
- Graph-only Project navigation.

## Governed Sources

- [Spec 147](../specs/147-contextual-dashboard-app/spec.md)
- [Contextual Dashboard Test Matrix](../testing/contextual-dashboard-test-matrix.md)
- [Project Resource Console Workflow](../workflows/project-resource-console.md)
- [ADR-013](./ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [Appaloft Design Language](../../packages/design/DESIGN.md)
