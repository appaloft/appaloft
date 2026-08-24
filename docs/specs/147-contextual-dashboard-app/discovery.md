# Contextual Dashboard App — Discovery

## Status

- Round: Spec
- Discovery decisions confirmed by owner: 2026-08-24
- Governing decision: [ADR-126](../../decisions/ADR-126-contextual-dashboard-and-web-route-boundary.md)
- Code Round: blocked until this Spec is confirmed and actor-visible tickets are ready

## Actor And Outcome

An operator opens Appaloft and sees only the navigation for the owner they are currently operating:
Workspace, Project/Environment, or Resource. The first useful path is
`Projects -> Project Overview -> Resource`, and the route, query, cache, and rendering scopes all
change with that owner context.

The new Dashboard is a parallel public application under `apps/dashboard`. It is intended to replace
`apps/web`; it is not an incremental skin over the legacy shell.

## Confirmed Decisions

| ID       | Decision                                                                                                                                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DASH-D1  | Build public-first in `apps/dashboard`; do not create a hosted/private fork of neutral Dashboard behavior.                                                                                                                                                   |
| DASH-D2  | Workspace navigation is `Projects / Infrastructure / Activity / Marketplace / Settings`; Projects is the root.                                                                                                                                               |
| DASH-D3  | Project navigation is `Overview / Deployments / Observability / Settings`; Environment is a top context switcher and is managed inside Project Settings.                                                                                                     |
| DASH-D4  | Resource work opens as a URL-backed resizable panel on desktop and a full page on narrow screens.                                                                                                                                                            |
| DASH-D5  | Agent assistance is contextual top-right chrome; project-owned work stays in Project/Resource context.                                                                                                                                                       |
| DASH-D6  | Light is the default and warm-charcoal Dark is complete; Appaloft blue remains the only primary accent.                                                                                                                                                      |
| DASH-D7  | The first beta slice is the real `Projects -> Project Overview -> Resource` loop, not an empty shell or gallery.                                                                                                                                             |
| DASH-D8  | New routes may break legacy deep links. No redirect, alias, fallback, or legacy feature-parity gate is required before cutover.                                                                                                                              |
| DASH-D9  | Preserve the v1 extension page renderer and add scoped navigation metadata rather than flattening every extension into global navigation.                                                                                                                    |
| DASH-D10 | Use bounded owner-scoped summary read models; broad client joins and per-row health fan-out are prohibited.                                                                                                                                                  |
| DASH-D11 | URL owns Environment, overview/list/topology view, selected Resource, Resource tab, filters, and cursor state that users expect Back/Forward to restore.                                                                                                     |
| DASH-D12 | Opt-in beta starts when the first closed loop passes. Default cutover requires all five Workspace destinations plus the core Project/Resource journey to be usable under the new IA.                                                                         |
| DASH-D13 | Topology follows Overview/List and is blocked on 10/50/100 Resource benchmarks.                                                                                                                                                                              |
| DASH-D14 | Dashboard v2 design governance ships in the foundation: versioned tokens, DESIGN drift checks, repo-local AI guidance, lint, gallery, and light/dark visual regression.                                                                                      |
| DASH-D15 | Owner feedback requires a brighter luminous hierarchy: near-white Light, lifted charcoal Dark, and restrained blue/cyan/violet ambient light plus pastel icon surfaces. Appaloft blue remains the sole primary action color and status hues remain semantic. |

## Research Evidence

- Railway validates contextual owner scopes and a Resource detail panel, but Appaloft does not copy
  Railway's purple/dark trade dress or make a graph canvas the only project entry.
- OpenShip validates soft surface hierarchy, restrained elevation, and more generous spacing.
- Kun validates airy light surfaces, restrained ambient light, colorful icon wells, and
  design-quality automation. These qualities are translated through Appaloft semantic roles; Kun
  source, token values, recipes, icons, and assets are not copied because its license is
  noncommercial.
- The legacy Web shell loads global navigation, projects, extension metadata, visibility checks, and
  route queries together. Large Project/Resource route components and per-row health reads make its
  current slowness structural rather than an animation-only problem.

## Rejected

- Restyling `apps/web` in place.
- Retaining Home or every current object family as permanent workspace navigation.
- Requiring old URLs or all old features before the new Dashboard can become default.
- A Cloud-only theme or private fork of the public Dashboard.
- Client-side joins of broad list queries for page summaries.
- Topology as the only Project view or as part of the first slice.
