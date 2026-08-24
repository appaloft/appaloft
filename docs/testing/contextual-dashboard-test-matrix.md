# Contextual Dashboard Test Matrix

## Normative Contract

This matrix governs the public `apps/dashboard` replacement surface. It preserves Project/Resource/
Deployment ownership while replacing legacy Web navigation, routes, data-loading shape, and visual
rules. Legacy route parity is deliberately absent.

## References

- [ADR-126](../decisions/ADR-126-contextual-dashboard-and-web-route-boundary.md)
- [Spec 147](../specs/147-contextual-dashboard-app/spec.md)
- [ADR-013](../decisions/ADR-013-project-resource-navigation-and-deployment-ownership.md)
- [Project Resource Console Workflow](../workflows/project-resource-console.md)
- [Appaloft Design Language](../../packages/design/DESIGN.md)

## Foundation And Route Matrix

| Test ID        | Layer        | Given / When                                                  | Then                                                                                                  |
| -------------- | ------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| DASH-FOUND-001 | source/build | Dashboard workspace is built                                  | It imports public packages, not `apps/web` source, and produces a selectable static bundle.           |
| DASH-FOUND-002 | unit         | a Dashboard route is parsed and serialized                    | Owner ids, Environment, view, filters, cursor, and Resource destination round-trip deterministically. |
| DASH-ROUTE-003 | e2e          | `/` opens                                                     | It resolves to `/projects`; Home is absent.                                                           |
| DASH-ROUTE-004 | e2e          | each Workspace destination opens                              | Exactly five permanent product destinations render; utility actions are not counted as product nav.   |
| DASH-ROUTE-005 | e2e          | a Project opens                                               | Workspace nav is replaced by four Project destinations and a return to Projects.                      |
| DASH-ROUTE-006 | e2e          | Environment changes                                           | URL/query key/read result change together; Back restores the previous Environment.                    |
| DASH-ROUTE-007 | e2e          | a Resource opens on desktop                                   | Canonical Resource URL renders a resizable Project-owned panel.                                       |
| DASH-ROUTE-008 | e2e          | the same Resource URL opens on mobile                         | It renders a full page with no off-canvas loss or horizontal document overflow.                       |
| DASH-ROUTE-009 | e2e          | panel closes after list/filter/scroll state changes           | Project route restores Environment, view, filters, cursor, and scroll restoration contract.           |
| DASH-ROUTE-010 | e2e          | a legacy `apps/web` deep link is used after Dashboard cutover | 404 is allowed; no redirect/fallback assertion exists.                                                |

## Data And Ownership Matrix

| Test ID       | Layer           | Given / When                                        | Then                                                                                                                     |
| ------------- | --------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| DASH-DATA-001 | contract        | `projects.list-summaries` omits limit               | Default is 24, hard maximum is 100, sort is deterministic, and no nested Resource/Deployment arrays are returned.        |
| DASH-DATA-002 | contract        | `project-environments.overview` loads 100 Resources | One bounded projection returns Resource health/access/latest Deployment context with a next cursor and no per-row read.  |
| DASH-DATA-003 | contract        | `resources.overview` loads                          | Owner consistency is validated and latest Deployments are capped at five; logs/metrics/secrets/terminal data are absent. |
| DASH-DATA-004 | integration     | a read projection reports healthy/failed context    | It remains observation state and cannot admit a mutation without authoritative command checks.                           |
| DASH-DATA-005 | browser/network | Project list/overview renders                       | No per-Project or per-Resource request pattern appears.                                                                  |
| DASH-DATA-006 | browser/network | Resource Overview is open                           | Only overview data loads; inactive logs/metrics/configuration/terminal destinations make zero requests/subscriptions.    |
| DASH-DATA-007 | browser/network | Resource destination changes or closes              | Previous destination polling, stream, observer, and subscription owners are disposed.                                    |
| DASH-OWN-008  | e2e             | Project Deployments opens                           | It is a bounded rollup and exposes Resource owner links; direct Project-owned deployment mutation is absent.             |
| DASH-OWN-009  | e2e             | Resource deploy/configure/observe actions run       | They dispatch the accepted shared operations; no Svelte-local lifecycle rule exists.                                     |

## Extension Matrix

| Test ID      | Layer           | Given / When                              | Then                                                                                               |
| ------------ | --------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| DASH-EXT-001 | contract        | a v1 extension page document is returned  | Dashboard renders the existing document without a v2 page-document fork.                           |
| DASH-EXT-002 | contract        | scoped metadata names a valid destination | It appears only in that Workspace/Project/Resource destination.                                    |
| DASH-EXT-003 | contract        | metadata is absent or unknown             | Legacy Web can ignore it; Dashboard does not create an extra permanent Workspace destination.      |
| DASH-EXT-004 | browser/network | a route has many registered extensions    | Visibility calls are limited to the active scope/destination and cached; no global fan-out occurs. |

## Visual, Accessibility, And Responsive Matrix

| Test ID       | Layer            | Given / When                                                 | Then                                                                                                                                     |
| ------------- | ---------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| DASH-VIS-001  | source           | Dashboard styles are checked                                 | Only approved semantic tokens/utilities are used; raw competitor assets/tokens and private theme overrides fail lint.                    |
| DASH-VIS-002  | source           | DESIGN and token sources drift                               | CI fails with the mismatched role/value/version.                                                                                         |
| DASH-VIS-003  | visual           | pattern gallery and core routes render                       | Light and warm-charcoal Dark screenshots pass at desktop and mobile widths.                                                              |
| DASH-VIS-004  | visual           | empty/loading/error/selected/focus/destructive states render | Every state follows v2 surface/radius/elevation/status roles.                                                                            |
| DASH-A11Y-005 | browser          | keyboard-only navigation                                     | Context switcher, five Workspace destinations, Project drawer, Resource tabs, panel close, and actions are reachable with visible focus. |
| DASH-A11Y-006 | browser          | keyboard resizing                                            | Resize handle has an accessible name, min/max bounds, and arrow-key controls.                                                            |
| DASH-A11Y-007 | browser          | reduced motion is requested                                  | Nonessential motion is removed and state remains understandable.                                                                         |
| DASH-A11Y-008 | automated/manual | color contrast is audited                                    | Text/control/status meet WCAG 2.2 AA and status is not hue-only.                                                                         |

## Performance Matrix

| Test ID       | Fixture                   | Blocking assertion                                                                      |
| ------------- | ------------------------- | --------------------------------------------------------------------------------------- |
| DASH-PERF-001 | Projects                  | <=4 requests, p95 <=1.5s, no item fan-out, >=30% legacy p95 reduction where comparable. |
| DASH-PERF-002 | Project/100 Resources     | <=5 requests, p95 <=1.8s, <=50 mounted rows, no item fan-out, >=30% legacy reduction.   |
| DASH-PERF-003 | warm Resource open        | <=2 added requests, shell p95 <=300ms, data p95 <=1.0s.                                 |
| DASH-PERF-004 | Resource tab              | cached p95 <=200ms; uncached data p95 <=1.0s; inactive stream count 0.                  |
| DASH-PERF-005 | Environment/100 Resources | <=3 requests, p95 <=1.2s, no stale-scope flash.                                         |
| DASH-PERF-006 | nav/resize                | p75 INP <=200ms and no task >100ms.                                                     |
| DASH-PERF-007 | build                     | active shell+route JavaScript <=300 KiB gzip; charts/editors/terminal are lazy.         |
| DASH-PERF-008 | Topology 10/50/100        | p75 INP <=200ms and >=55 FPS over 2s pan/drag; otherwise feature stays disabled.        |

## Rollout Gates

| Test ID           | Gate        | Required evidence                                                                                                                                      |
| ----------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DASH-BETA-001     | opt-in beta | DASH-FOUND-*, DASH-ROUTE-003/005/006/007/008/009, DASH-DATA-001–007, DASH-OWN-008/009 pass for Projects -> Project -> Resource.                        |
| DASH-BETA-002     | opt-in beta | DASH-VIS-001–004, DASH-A11Y-005–008, and DASH-PERF-001–007 pass.                                                                                       |
| DASH-BETA-003     | opt-in beta | Existing bilingual Web-console docs anchor and docs registry describe Dashboard route/owner behavior.                                                  |
| DASH-DEFAULT-001  | default     | Projects, Infrastructure, Activity, Marketplace, Settings meet the Spec's minimum usable outcome; no placeholder qualifies.                            |
| DASH-DEFAULT-002  | default     | Project Overview/Deployments/Observability/Settings and all Resource destinations meet their owner contracts.                                          |
| DASH-DEFAULT-003  | default     | Default static bundle, explicit legacy rollback selector, breaking-route release note, full public gates, and downstream Boundary Review are recorded. |
| DASH-TOPOLOGY-001 | topology    | DASH-PERF-008 passes at 10/50/100 and List fallback remains present.                                                                                   |

## Explicit Absence

- No test requires legacy URL redirects or compatibility query parsing.
- No test requires every legacy `apps/web` page before default cutover.
- No test accepts a static placeholder as a usable destination.
