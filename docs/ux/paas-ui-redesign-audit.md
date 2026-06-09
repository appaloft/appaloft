# PaaS UI Redesign Audit

## Progress Log

- Phase 0 complete: wrote `docs/ux/paas-ui-redesign-style-contract.md`.
- Phase 1 started: inspected `apps/web`, `packages/ui`, `packages/design`, i18n, oRPC client use, and the existing web console redesign plan.
- Phase 1 completed: documented current screen inventory, task model, structural UX issues, interaction-pattern misuse, state gaps, and visual weaknesses.

## 1. Current Screen Inventory

Data flow summary: the console is a SvelteKit static client with `ssr = false` pages, TanStack Svelte Query for client state, `createConsoleQueries` for shared list/system queries, `orpcClient` for business operations, `/api/*` fetches for health/auth/version/instance upgrade, and direct query invalidation after mutations. Long-running deployment flows stream progress events through `createDeploymentWithProgress`, deployment detail can follow deployment event streams, resource logs can follow runtime log streams, and terminal sessions are embedded through `TerminalSessionPanel`.

| Screen / Component | Purpose | Primary User Task | Current Layout Model | Current Interaction Model | Current Problems | Current Pattern Feel |
| --- | --- | --- | --- | --- | --- | --- |
| `ConsoleShell.svelte` | Main console frame, sidebar, breadcrumbs, session controls, health fallback | Navigate workspace and open deployment flow | Persistent sidebar plus sticky top header | Sidebar project/resource tree, account dropdown, global deploy button | Sidebar is useful but top-level IA is still a flat page list plus project tree; header duplicates title/description from page content; backend error state is good but isolated | App shell |
| `ManagementShell.svelte` | Secondary shell for instance/org management | Manage control plane/admin areas | Sticky top header, no sidebar | Back-to-workspace, theme toggle, deploy button | Splits management pages out of primary shell but visually diverges and uses raw `bg-background`; management surfaces do not inherit the richer console IA | App shell variant |
| `/` | Home command center | Start or recover a deployment loop | Large custom dashboard blocks | Links to deploy, projects, deployments, dependency resources | Visually distinctive but too marketing/editorial for an operator home; huge hero/status display can bury actual next actions; uses custom local CSS instead of shared product blocks | Page / dashboard |
| `/deploy` with `QuickDeploySheet.svelte` | Global deployment wizard | Quick deploy from source to project/server/resource | Two-column wizard page with side summary | Step buttons, URL-persisted state, optional advanced context, GitHub connect, server registration, env var, progress dialog | Good full-page choice, but component is very large; labels include hardcoded Chinese strings; long-running result is a modal; side summary competes with form; advanced context is toggled inside one giant page | Wizard page |
| `QuickDeployProgressDialog.svelte` | Show quick-deploy workflow and deployment progress | Track create project/server/env/resource/deployment execution | Modal overlay with dark log panel | Auto-scroll, view deployment, close after completion | Long-running work is trapped in a modal; dark terminal styling conflicts with Quiet Infrastructure; progress is not a durable route users can revisit | Modal |
| `/projects` | Project index | Choose project, scan resources/deployments | Header, metrics strip, record list | Row navigation to project detail | Mostly good dense list, but empty state points to deployments instead of creating/deploying; no filters/search in content; loading is skeletal but generic | Page / list |
| `/projects/[projectId]` | Project workspace | Inspect project resources, environments, deployments, lifecycle | Long page: header, metrics, runtime monitor, settings, resources, side environment/access panel, deployments | Inline rename/archive/delete, environment forms/actions, resource list, deployment list | Stable sibling sections are not tabs; settings appear before resources; destructive project archive/delete appears high on the default page; environment management is cramped in a side panel; project monitor may overshadow resources | Page that should be tabs |
| `/projects/[projectId]/resources/new` | Project-scoped resource creation and immediate deploy | Create resource and deploy it | Long multi-section form with sticky review aside | Submit creates resource then deployment; progress modal | Correctly page-based, but not a clear wizard; source/runtime/target/health all on one page; validation is mostly submit-time; long-running work uses modal; no step preservation beyond local state | Page / wizard candidate |
| `/resources/[resourceId]` and nested canonical route | Resource detail workspace | Operate one resource | Resource header plus tabs; the first tab contains many profile sections and some operational content lives in later top-level tabs | URL tab/section params, popover health, inline forms, runtime controls, logs, terminal, domain forms | Historically this defaulted to an overloaded `settings` tab with profile, source, config, storage, dependencies, domains, usage, health, proxy, and diagnostics. Current IA should keep source/runtime/network/access, auto-deploy, storage, health, proxy, diagnostics, and danger zone under Overview, while promoting variables, dependencies, domains, and usage to top-level tabs. Domain/TLS flow is still a form panel rather than a guided verification flow. | Tabbed detail page with evolving IA |
| Resource `logs` tab | Runtime controls and logs | Start/stop/restart, inspect logs | Two stacked bordered cards | Refresh/follow logs, runtime control mutations | Runtime controls inside Logs tab blur intent; log viewer is dark terminal-like; loading/empty states are text in the log well; no search/filter/copy action | Tab / operational panel |
| Resource `terminal` tab | Resource terminal | Open an operator shell | Terminal panel | Embedded session panel | Correct as tab, but disabled state depends on deployment count and could provide better next action | Tab |
| Resource `deployments` tab | Resource deployment history | Inspect deployment history and start Quick Deploy | Header plus deployment table | Quick Deploy button and table navigation | Good table choice, but empty state is a muted strip with little guidance | Tab |
| `/projects/.../deployments/new` | Resource deployment creation | Deploy existing resource | Two-column form and side context | Preview plan, create deployment, progress modal | Correctly page-based, but uses `border-y` layout, no step/timeline after submit, progress returns to modal, plan preview is valuable but visually dense | Page |
| `/deployments` | Deployment index | Scan attempts and failures | Header, metrics strip, deployment table | Filter by query `projectId`; rows link to detail | Good operational table, but no visible filter control/search; empty state points to projects, not quick deploy/resource deployment; no long-running inline active deployment treatment | Page / list |
| `/deployments/[deploymentId]` | Deployment attempt detail | Inspect one attempt, logs, timeline, snapshot, recovery | Header plus tabs | Recovery actions, live progress dialog, event follow, copy logs/diagnostics | Better IA than resource detail; however progress can still be opened as a modal; logs are dark terminal-like; recovery readiness appears in overview but long-running recovery action uses modal | Tabbed detail page |
| `DeploymentProgressDialog.svelte` | Deployment progress/log stream | Track detect/plan/package/deploy/verify/rollback | Large modal overlay with dark log panel | Auto-scroll, open deployment, trace link | Represents an operation as an interruptive overlay instead of durable page/timeline; styling is more terminal/cyber than Quiet Infrastructure; close is disabled while running | Modal |
| `/servers` | Server and credential library | Manage deployment targets and saved SSH credentials | Header, default access policy form, server list, credential library | Inline system policy, credential rotate/delete dialogs | Server list is useful; default access policy competes with list; credential library is large on same page; rotate credential is a complex modal but acceptable as focused credential action; delete/rotate are very close to normal actions | Page with inline panels and modals |
| `/servers/new` with `ServerRegistrationForm.svelte` | Register deployment target | Connect server and configure credential | Full page, reusable large form | Test connectivity inline, create server | Correctly page-based; good sectioning; success remains on page; could be strengthened as a wizard/checklist because readiness testing is sequential | Page / wizard candidate |
| `/servers/[serverId]` | Server target workspace | Inspect target readiness, proxy, capacity, credentials, deployments, terminal, danger | Header plus tabs | Connectivity test, capacity inspect/prune, credential detail, proxy/access forms, danger dialogs | Much improved from prior long page; still many panels with similar visual weight; capacity prune is a risky operation inside a normal tab; danger dialogs are good; overview lacks stronger current-readiness summary | Tabbed detail page |
| `/domain-bindings` | Global custom domain management | Create/check/configure/delete domain binding | Two-column create form plus list/details | Inline create, show details, retry verification, route edit, delete confirmation input | Domain binding is complex and should be resource-scoped guided flow; DNS/TLS verification is not clearly staged; delete controls sit in every row; global page mixes create, troubleshooting, route config, and delete | Page that should be guided flow + rollup |
| `/dependency-resources` | Managed Postgres/Redis resources | Provision DB/cache, backup/restore, bind indirectly | Create panel, record list, side detail panel | Inline create, backup, delete, restore with checkboxes | Dense and operational, but create form spans many columns; delete has no strong confirmation; detail side panel works but needs clearer backup/restore risk framing | Page + side panel |
| `/preview-environments` | Preview env rollup | Inspect PR preview environments | Header, metrics, table | Table links to resource preview detail | Good use of table; empty state is useful; no filters/search and no cleanup action at list level | Page / list |
| `/preview-policies` | Configure preview behavior | Configure project/resource preview policy | Scope panel plus form panels | Select scope, edit settings | Appropriate page; lacks permission denied state and richer save-state feedback | Page / settings |
| `/organization*`, `/instance` | Management/admin operations | Manage users/tokens/control plane | Management shell pages | Inline forms, confirmations, tables | Secondary scope for this redesign; use raw card/border styling and some `window.confirm`; should inherit state primitives later | Management pages |

## 2. Primary User Task Map

| Task | User Intent | Frequency | Risk | Complexity | Quick Action Or Full Flow | Ideal UI Pattern |
| --- | --- | --- | --- | --- | --- | --- |
| Start first deployment | Get a source running on a target | High during onboarding | Medium | High | Full flow | Guided `/deploy` wizard with durable progress route/panel |
| Create project | Establish an ownership boundary | Medium | Low | Low | Quick inside deploy, full when standalone | Inline step in deploy wizard or project create page |
| Create app/service/worker/static resource | Add deployable workload | High | Medium | High | Full flow | Project-scoped wizard/page, not modal |
| Connect Git repository | Select GitHub or remote source | High | Medium | Medium | Full flow step | Source step with repo picker, auth state, validation, preserved URL state |
| Configure build/runtime | Define commands, Docker/static strategy, health | Medium | Medium | High | Full flow or configure tab | Wizard advanced section plus resource Configure tab |
| Configure environment variables | Add secret/plain config | High | High for secrets | Medium | Full panel | Dense editor with masked values, validation, save state, import/export |
| Deploy existing resource | Create new attempt from known resource | High | Medium | Medium | Full flow | Resource deployment page with plan preview and inline progress timeline |
| Inspect deployment | Understand what happened and recover | High | Medium | Medium | Full page | Deployment detail with overview, timeline, logs, snapshot, recovery |
| View logs | Diagnose runtime/deployment behavior | High | Medium | Medium | Tab/panel | First-class log viewer with filters, copy, follow, plain loading/error |
| Bind domain | Attach custom domain to resource | Medium | High | High | Full flow | Guided resource-scoped flow with DNS, route, TLS stages |
| Verify DNS | Confirm ownership/route readiness | Medium | High | Medium | Guided action | Domain verification panel with exact current status and retry/check again |
| Issue or retry TLS certificate | Secure public endpoint | Medium | High | Medium | Guided action | Certificate status panel tied to domain binding |
| Connect server | Register deployment target and credential | Medium | High | High | Full flow | Server create wizard/page with connectivity test as a step |
| Inspect server health | Check target readiness/capacity/proxy | Medium | Medium | Medium | Detail tab | Server overview plus Connectivity/Capacity tabs |
| Manage SSH credential | Rotate/delete credential safely | Low | High | Medium | Focused interruptive action | Modal/dialog for rotation/delete with usage readiness and typed confirmation |
| Manage resource profile sections | Update source/runtime/network/access/health | Medium | Medium to high | High | Stable detail section | Resource Overview tab with vertical section nav |
| Delete resource/project/server/domain | Remove live infrastructure | Low | High | Medium | Focused confirmation | Danger zone plus dialog or typed inline confirmation |
| Backup/restore dependency resource | Protect or restore data | Low/medium | High | Medium | Contextual side panel / page | Side detail panel with explicit data overwrite acknowledgements |
| Manage preview environments/policies | Control PR preview lifecycle | Medium | Medium | Medium | Page/tabs | Tables for instances, settings page for policy |

## 3. UX Structural Problems

- Resource detail historically defaulted to `settings`, so the most important operational questions were not first: what is live, what URL works, is it healthy, what deployed last, and what needs attention.
- The old resource `settings` tab was overloaded with profile, source, auto-deploy, configuration, storage, dependencies, domains, usage, health, proxy, and diagnostics. These need clearer grouping under `Overview`, `Deployments`, `Logs`, `Domains`, `Environment`, `Dependencies`, `Metrics/Health`, and operational sections that remain inside Overview.
- Project detail is a long document rather than a stable project workspace. Resources, environments, deployments, and settings all compete vertically.
- Destructive actions appear too close to primary operations. Resource archive/delete are in the resource header; project archive/delete appear before resources; dependency delete sits beside backup/view actions.
- Domain binding is global-first and form-first even though users usually bind a domain to a specific resource and then need a staged DNS/TLS verification workflow.
- Long-running deployment and quick-deploy progress are modal overlays. They are useful, but they are not durable operational surfaces and they use a dark terminal treatment that conflicts with the design contract.
- Loading state quality is uneven. Many screens have skeletons, but skeletons often do not resemble final layout structure, and some nested panels use text-only loading.
- Empty states are uneven. Some are helpful, but many are simple muted strips without a next-step CTA, especially resource deployments/logs/settings subpanels.
- Error recovery is inconsistent. Mutations usually show inline error text, but query errors often have no retry action except backend unavailable and some health/connectivity panels.
- Permission denied is mostly implicit through disabled `CapabilityGate` actions; there is no designed "you do not have access" state for screens or sections.
- There is no reusable operation-progress block. Deployment timeline, quick-deploy workflow steps, runtime log following, server connectivity checks, and TLS/DNS verification each express progress differently.
- The app has multiple one-off visual systems: named console surfaces, shadcn primitives, `nothing-*` home CSS, dark log panels, raw `rounded-md border`, and management shell cards.
- The primary app shell has a reasonable sidebar, but top-level navigation still reads as a collection of pages rather than a product task model around projects, resources, deployments, servers, access, and observe.

## 4. Modal / Drawer / Page Misuse

| Flow | Current pattern | Recommended pattern | Reason |
| --- | --- | --- | --- |
| Quick deploy execution progress | Modal dialog | Inline durable progress panel on `/deploy`, plus link to deployment detail | The operation is long-running, revisitable, and central to the product loop. |
| Project-scoped resource create | Long page plus progress modal | Multi-step page/wizard with sticky review and inline progress after submit | Resource creation has sequential choices and validation dependencies. |
| Existing resource deployment | Page plus progress modal | Page with plan preview and inline timeline/log panel after submit | Users may need to keep context, inspect plan, and recover from failure. |
| Deployment detail "view progress" | Modal dialog | `Timeline` tab and optional drawer for live stream details | Progress belongs to the deployment attempt page. |
| Domain binding creation | Global two-column page form | Resource-scoped guided flow/page; global page becomes rollup/troubleshooting | Domain setup requires DNS/TLS stages and ownership context. |
| Domain binding row details | Inline expanded row after button | Drawer for contextual inspection from list, or detail route for deep troubleshooting | Keeps list scannable while preserving rich detail. |
| Domain binding delete | Inline confirmation input in every row | Danger-zone confirmation dialog/drawer after delete check | Destructive controls should not live next to route edits for every row. |
| SSH credential rotation | Modal | Modal or drawer | Focused but sensitive action; current modal is acceptable, though a drawer could preserve credential library context. |
| SSH credential delete | Modal | Modal | Short focused destructive confirmation with usage readiness is appropriate. |
| Server creation | Full page | Wizard/page | Correct pattern; can become clearer as sequential identity/access/readiness steps. |
| Server deactivate/delete | Danger tab plus modal | Danger tab plus modal | Correct pattern. |
| Resource runtime controls | Inside Logs tab card | Resource Overview or Runtime/Health tab action bar | Start/stop/restart are runtime operations, not log-viewer controls. |
| Resource environment variables | Subsection of Settings tab | Environment tab or Configure section with dense editor | Config editing is a repeated operational task needing stronger editor affordances. |
| Dependency resource restore | Side panel with checkboxes | Side panel or drawer with danger framing | Contextual side panel works, but restore risk needs clearer operation state. |

## 5. State Audit

| Screen / Component | Initial Loading | Skeleton Loading | Empty State | Partial Data | Error State | Permission Denied | Long-Running | Retry | Success Confirmation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ConsoleShell` | Yes | No | N/A | N/A | Backend unavailable panel | No | No | Health check action | Sign-out error only |
| Home | Yes | Weak custom loading | Yes | No | Via shell only | No | Active deployment counts only | No | No |
| Projects list | Yes | Yes | Yes, weak CTA | No | Shell only | No | No | No | N/A |
| Project detail | Yes | Yes | Resource/deployment/env empty strips | Runtime rollup unavailable text | Inline mutation errors | Disabled actions via `CapabilityGate` | Mutations show saving only | No query retry | Inline feedback |
| Resource create page | Yes | Yes | No environment/server options are select labels only | Partial create then deployment error handled | Inline feedback | No explicit state | Deployment progress modal | No | Inline plus redirect |
| Quick deploy | Yes | Some skeletons in subqueries | Existing/new fallbacks | Can create missing objects | Inline deploy feedback | No explicit state | Progress modal | No | Inline feedback |
| Resource detail | Yes | Yes | Many text/strip states | Health/loading/detail partials, diagnostics | Many inline panel errors | Disabled actions only | Runtime follow, controls saving, logs following | Refresh buttons in health/logs | Inline feedback |
| Resource logs | No separate | Text in log well | Text in log well | Observation window filter | Inline error | No | Follow state text | Refresh/follow | Runtime control feedback |
| Resource terminal | No separate | Inside panel unknown | Disabled if no deployments | No | Panel-specific | No | Terminal session lifecycle | Panel-specific | Panel-specific |
| Deployment list | Yes | Yes | Yes | Project filter empty | Shell only | No | Counts only | No | N/A |
| Deployment detail | Yes | Yes | Logs/timeline empty text | `sectionErrors` panel | Inline errors and fallback copy | No | Event follow, recovery progress modal | Some refetch implicit | Inline/copy states |
| Deployment progress dialog | N/A | Waiting text | Waiting text | Events can stream partially | Stream error | N/A | Yes | No | View deployment |
| Servers list | Yes | Yes | Good empty server state; credential empty state | Credential usage loading | Dialog/readiness errors | No | Credential mutations saving | No | Inline feedback |
| Server create | Providers/credentials load | No page skeleton | N/A | Connectivity result/checks | Inline create/connectivity errors | No | Connectivity test, submit | Retest | Inline success |
| Server detail | Yes | Yes | Deployments empty | Rollups/capacity/credential partials | Section errors | No | Connectivity/capacity prune/terminal | Refresh/test buttons | Inline feedback |
| Domain bindings | Yes | Yes | List empty state | Show details populates per row | Inline feedback | No | Verification retry pending only | Retry verification | Inline feedback |
| Dependency resources | Yes | Yes | Good list empty | Backups/policies side panel | Inline feedback | No | Create/backup/restore saving | No | Inline feedback |
| Preview environments | Yes | Yes | Useful docs CTA | No | Shell only | No | Cleanup requested status only | No | N/A |
| Preview policies | Yes | Yes | Empty projects | Policy default/readback | Inline feedback | No | Save pending | No | Inline feedback |
| Organization / Instance | Mixed | Mixed | Mixed | Mixed | Inline feedback | Some permissions boolean | Terminal/upgrade worker operations | Some refresh | Inline feedback |

State gaps to prioritize: permission denied, recoverable query errors with retry, durable long-running operation panels, richer empty states for resource tabs, skeletons shaped like final sections, and safer success/failure states for destructive operations.

## 6. Visual Audit

- The product already imports canonical design tokens from `@appaloft/design/styles/web.css`, but page composition still falls back to raw shadcn patterns: `rounded-md border bg-card`, `bg-muted/25`, generic metric strips, and repeated panels.
- Surface grammar exists but is not consistently used. `console-panel`, `console-subtle-panel`, and `console-record-list` are mixed with raw borders, `border-y`, local `nothing-*` styles, and dark log panels.
- The home page has strong personality, but it is too large and editorial for an operational console. Huge type and rounded 16px panels break from the compact 6px/low-radius design contract.
- Page rhythm is inconsistent. Some pages have a strong owner header; others repeat shell title inside content; resource detail uses a border-bottom header with destructive actions in the main action cluster.
- Typography hierarchy is workable but often generic. There are many `text-lg font-semibold` sections, creating weak priority between critical state, configuration, and secondary metadata.
- Status indicators are under-designed. Badges are compact and semantic, but status meaning is fragmented across badges, dots, text, and custom variants without one reusable status summary model.
- Tables are used appropriately for deployments and previews, but resource lists are record rows and dependency/domain rows become dense action panels; some operational lists need better column hierarchy.
- Cards/panels are overused for unrelated purposes: forms, summaries, alerts, repeated records, warnings, and tools can all look like the same bordered rectangle.
- Empty states are too plain. Many say no data or show a short sentence, rather than suggesting the safest next action.
- Loading states are often generic bars rather than layout-faithful skeletons.
- Logs and progress panels lean into a black terminal style. Logs should remain precise and monospaced without becoming the visual identity.
- Destructive surfaces use red/destructive buttons, but danger zones and confirmation flows are not consistently isolated.
- The design has a good foundation in `packages/design`, `packages/ui`, `ConsoleShell`, and `ServerRegistrationForm`; the redesign should consolidate around reusable product blocks rather than inventing another page-local style.
