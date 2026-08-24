# Contextual Dashboard App

## Status

- Round: Code
- State: confirmed by owner on 2026-08-24; foundation and luminous visual refinement merged through
  PR #1431
- Discovery: [discovery.md](./discovery.md)
- Governing decision: [ADR-126](../../decisions/ADR-126-contextual-dashboard-and-web-route-boundary.md)
- Compatibility: `pre-1.0-policy`, intentionally breaking Web routes; no legacy fallback required
- Docs outcome: update the existing bilingual `reference/web-console` page and docs-registry Web
  surfaces before beta/default cutover

## Business Outcome

Operators can move from Workspace Projects to one Project/Environment and open a Resource without
carrying the entire platform navigation or data graph in their head. Navigation, URL state, data
loading, rendering, and cache ownership use the same scope.

## Actors

- Operator: creates, deploys, observes, configures, and recovers Resources.
- Workspace administrator: manages infrastructure, marketplace capabilities, and settings.
- Extension author: contributes neutral or composed pages to an explicit owner destination.
- AI contributor: implements screens under executable design-system constraints.

## Functional Requirements

| ID            | Requirement                                                                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DASH-IA-001   | `/` resolves to `/projects`; Dashboard has no Home destination.                                                                                                                                           |
| DASH-IA-002   | Workspace shell exposes exactly Projects, Infrastructure, Activity, Marketplace, and Settings as permanent product destinations. Account/help/Agent utilities are not product destinations.               |
| DASH-IA-003   | Entering a Project replaces Workspace navigation with Overview, Deployments, Observability, and Settings while keeping a clear return to Projects.                                                        |
| DASH-IA-004   | Environment is selected in Project context chrome, encoded in the URL, included in query keys, and managed inside Project Settings.                                                                       |
| DASH-IA-005   | Project Overview defaults to an operational Resource list; Topology is a later view of the same owner scope and cannot be the only path.                                                                  |
| DASH-IA-006   | Selecting a Resource navigates to a canonical Resource route. Wide screens render it as a resizable panel over the Project layout; narrow screens render the same content as a full page.                 |
| DASH-IA-007   | Resource destinations are Overview, Deployments, Configuration, Logs & Metrics, Networking, and Settings. Overview includes latest Deployment context without replacing the full Deployments destination. |
| DASH-IA-008   | Closing a Resource panel preserves Project, Environment, view, filters, sort, and cursor. Refresh and browser navigation reconstruct the same state.                                                      |
| DASH-IA-009   | Contextual Agent opens from top-right utility chrome and receives the active owner context; it does not add a permanent Workspace destination or a parallel project lifecycle.                            |
| DASH-IA-010   | Mobile uses five-destination bottom navigation in Workspace scope, Project context header plus drawer in Project scope, and a full-page Resource route.                                                   |
| DASH-DATA-011 | Projects uses `projects.list-summaries`; it does not fetch Resource or Deployment lists per Project.                                                                                                      |
| DASH-DATA-012 | Project Overview uses `project-environments.overview`; it does not fetch `resources.health` or Deployment history once per Resource.                                                                      |
| DASH-DATA-013 | Resource Overview uses `resources.overview`; tab-specific queries/streams start only when their destination is active.                                                                                    |
| DASH-DATA-014 | All collection projections use cursor pagination, deterministic sort, a documented default limit, and a hard maximum. Tenant identity comes from execution context rather than client input.              |
| DASH-DATA-015 | Closing Resource or leaving a tab tears down charts, tables, terminal/log streams, polling, and subscriptions not shared by the active route.                                                             |
| DASH-EXT-016  | Dashboard continues to render `appaloft.console.extension-page/v1` documents.                                                                                                                             |
| DASH-EXT-017  | Additive scoped metadata places contributions into canonical Workspace, Project, or Resource destinations; unknown/missing v2 metadata never creates another permanent Workspace item.                    |
| DASH-EXT-018  | Extension visibility is evaluated only for the active destination/scope and is cached; Dashboard must not fan out visibility calls for every possible extension on every route.                           |
| DASH-VIS-019  | Dashboard consumes `dashboard-v2` semantic tokens; raw copied competitor tokens/assets and private theme overrides are forbidden.                                                                         |
| DASH-VIS-020  | Near-white luminous Light and lifted warm-charcoal Dark cover every primitive and state. Appaloft blue is the only primary action accent; semantic status colors remain reserved for status.              |
| DASH-VIS-021  | Layout uses the v2 spacing/radius/elevation contract and supports keyboard navigation, visible focus, reduced motion, and WCAG 2.2 AA contrast.                                                           |
| DASH-GOV-022  | Foundation includes DESIGN/token drift validation, Dashboard design lint, a route-level pattern gallery, and Playwright screenshots for light/dark desktop/mobile.                                        |
| DASH-CUT-023  | The first closed loop may enter opt-in beta only after IDs DASH-BETA-* in the test matrix pass.                                                                                                           |
| DASH-CUT-024  | Default cutover requires every new Workspace destination to be usable plus core Project/Resource coverage; legacy feature parity and redirects are not gates.                                             |
| DASH-CUT-025  | Topology stays disabled until 10/50/100 Resource benchmark rows pass and List remains available.                                                                                                          |
| DASH-VIS-026  | Blue/cyan/violet ambient light fields and pastel icon surfaces may create non-semantic depth, but ordinary cards, text, status, and every CTA must not glow or become decorative gradients.               |

## Page Outcomes

“Usable” means the destination renders real owner-scoped data or a truthful empty state, exposes its
primary read/action, handles loading/error/unauthorized states, and has docs/help coverage. A static
“coming soon” page does not satisfy cutover.

| Destination           | Minimum usable outcome                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Projects              | Search/sort/paginate Project summaries, show attention and latest activity, create/open Project.                          |
| Infrastructure        | Browse bounded Servers and dependency infrastructure summaries; open the owning detail/action surface.                    |
| Activity              | Browse cursor-paginated Deployment and operator-work activity with URL filters and owner links.                           |
| Marketplace           | Browse/install or open available Blueprint/extension offerings through the accepted contracts.                            |
| Settings              | Reach Workspace/account/organization settings and extension-contributed settings without adding global product nav items. |
| Project Overview      | List current-Environment Resources and open/create the Resource journey.                                                  |
| Project Deployments   | Read bounded Project/Environment Deployment rollup; mutations remain Resource-owned.                                      |
| Project Observability | Read bounded health/activity/monitoring summaries and navigate to the affected Resource.                                  |
| Project Settings      | Project lifecycle plus Environment management and contextual extension sections.                                          |
| Resource              | Observe, deploy, configure, inspect logs/metrics/networking, and manage lifecycle through the shared public operations.   |

## Read Projection Shapes

The names are public operation candidates and must be added to the operation catalog in Code Round.
Exact DTO schemas may become narrower, but they may not expand into unbounded graphs.

### `projects.list-summaries`

Input: `cursor?`, `limit` (default 24, maximum 100), `search?`, and deterministic `sort`.

Item: Project identity/name, bounded Resource count, attention count/status, latest activity time,
and optional small status breakdown. It does not embed Resource or Deployment arrays.

### `project-environments.overview`

Input: `projectId`, `environmentId`, `cursor?`, `limit` (default 50, maximum 100), `search?`,
`sort`, and view-independent filters.

Output: Project summary, selected Environment summary, Environment choices, bounded Resource rows
with current health/access/latest Deployment context, attention summary, and next cursor. It does
not embed logs, metrics, configuration values, or full Deployment history.

### `resources.overview`

Input: `projectId`, `environmentId`, and `resourceId` with owner consistency validation.

Output: Resource identity/kind/profile summary, current health and access summary, configuration
readiness, network summary, capability flags, and at most five latest Deployment summaries. It does
not include log lines, metric series, secrets, terminal data, or unbounded history.

## Performance Budgets

The benchmark harness must record legacy Web and Dashboard on the same seeded data, browser build,
machine profile, and network throttle. Beta/default gates require both the absolute ceilings below
and at least a 30% reduction from the matching legacy p95 where legacy can complete the scenario.

| ID            | Scenario                              | Blocking budget                                                                                                                      |
| ------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| DASH-PERF-001 | Projects route to usable              | At most 4 product-data requests; p95 <= 1.5s; zero per-Project fan-out.                                                              |
| DASH-PERF-002 | Project Overview with 100 Resources   | At most 5 product-data requests; p95 usable <= 1.8s; zero per-Resource fan-out; at most 50 Resource rows mounted before interaction. |
| DASH-PERF-003 | Warm Resource panel open              | At most 2 additional product-data requests; shell visible p95 <= 300ms; overview data ready p95 <= 1.0s.                             |
| DASH-PERF-004 | Warm cached Resource tab switch       | p95 input-to-paint <= 200ms; uncached destination data ready p95 <= 1.0s; inactive streams count is zero.                            |
| DASH-PERF-005 | Environment switch with 100 Resources | At most 3 new product-data requests; p95 usable <= 1.2s; old-scope results never flash as current.                                   |
| DASH-PERF-006 | Navigation interaction                | p75 INP <= 200ms; no task longer than 100ms during sidebar/drawer/panel resize.                                                      |
| DASH-PERF-007 | Initial Dashboard route JavaScript    | <= 300 KiB gzip for shell plus active route; destination-only charts/editors/terminals are lazy.                                     |
| DASH-PERF-008 | Topology 10/50/100                    | Each fixture maintains p75 INP <= 200ms and >= 55 FPS during a 2s pan/drag sample; otherwise Topology remains disabled.              |

## Visual Contract

- spacing base: 4px; page inset 24px compact / 32px wide; section gap 24-32px; card inset 20-24px;
- control height: 40px normal, 36px compact only in tables/toolbars;
- radii: controls 10px, cards 14-16px, panels/sheets 16-18px, full pills only for status/filter;
- typography: body >= 14px, metadata 12-13px, page title 22-24px, mono only for machine values;
- surfaces: hierarchy comes from fill and spacing; ordinary cards have no shadow; overlay/panel uses
  one restrained elevation step;
- motion: 150-250ms for state change, no decorative route animation, and no essential information
  conveyed only by motion.

## Accessibility And Responsive Contract

- All destinations, context switchers, Resource tabs, resize handles, dialogs, and actions are
  keyboard reachable with visible focus.
- Panel resize has pointer and keyboard controls, an accessible name, min/max width, and persisted
  preference that does not become route truth.
- At viewport widths below the implementation breakpoint, Resource routes are full-page and no
  off-canvas content or horizontal document overflow remains.
- Workspace bottom navigation labels remain visible; overflow destinations are not hidden behind
  unlabeled icons.
- Light/dark status never relies on hue alone.

## Rollout And Migration

| Stage            | Entry                                       | Exit gate                                                                                                                                             |
| ---------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parallel preview | Explicit Dashboard build/static directory   | Foundation and smoke pass; legacy remains default.                                                                                                    |
| Opt-in beta      | Internal/user preference selects Dashboard  | First closed loop, DASH-BETA rows, performance, accessibility, visual regression, docs existing-anchor outcome.                                       |
| Default          | Dashboard selected by default build/runtime | Five Workspace destinations plus core Project/Resource journey usable; release notes call out breaking routes; rollback selects legacy static bundle. |
| Legacy removal   | Separate cleanup authorization              | Default stability window and no required rollback dependency.                                                                                         |

## Non-goals

- Legacy route redirects, aliases, or feature parity.
- Copying Railway visuals or Kun code/assets/tokens.
- Dominant brand gradients, ornamental glass, glow on every card, or decorative use of status
  colors.
- Shipping Topology in the first slice.
- Replacing domain command/query semantics with Dashboard-specific business logic.
- Rebuilding extension page documents when v1 can render them.
- Implementing the post-write auto-fix hook before lint signals are stable.

## Ticket Boundary

This Spec, ADR-126, plan, tasks, and test matrix were owner-confirmed on 2026-08-24. Ticket Round is
authorized. Code remains blocked until an actor-visible issue is information-complete and marked
`ready-for-agent`; file/component chores stay inside that issue or this `tasks.md`.
