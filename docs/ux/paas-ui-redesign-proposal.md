# PaaS UI Redesign Proposal

## Progress Log

- Phase 0 complete: locked the Quiet Infrastructure visual contract in `docs/ux/paas-ui-redesign-style-contract.md`.
- Phase 1 complete: audited the current web console in `docs/ux/paas-ui-redesign-audit.md`.
- Phase 2 started: translated the audit into a target IA, interaction model, reusable product blocks, state design matrix, and implementation plan.
- Phase 2 completed: selected a coherent first implementation slice covering app shell rhythm, project/resource operations, resource overview, resource creation progress, and reusable operation/state primitives.

## 1. New Information Architecture

The console should organize around operational ownership, not around implementation categories. The sidebar can remain persistent, but the content model should make `Project -> Resource -> Deployment -> Server/Access` relationships obvious.

### Top-Level Console

| Area | Route | Purpose | Notes |
| --- | --- | --- | --- |
| Home | `/` | Command center for current work, warnings, active deployments, and next actions | Keep compact and operational; avoid marketing-style hero composition. |
| Projects | `/projects` | Ownership boundaries and resource groups | Primary path into the product. |
| Deploy | `/deploy` | Guided first or cross-project deployment | Full-page wizard, not modal. |
| Deployments | `/deployments` | Operational history and active attempts | Dense table with visible filters and active-running treatment. |
| Servers | `/servers` | Deployment targets and credential library | Server registration remains page-based. |
| Access | `/domain-bindings` | Domain/DNS/TLS rollup and troubleshooting | Global rollup; creation should be resource-scoped. |
| Dependency Resources | `/dependency-resources` | Managed Postgres/Redis lifecycle | Dense list plus contextual detail drawer/panel. |
| Previews | `/preview-environments`, `/preview-policies` | PR previews and policy settings | Keep separate list/settings surfaces. |
| Admin | `/organization`, `/instance` | Organization and control-plane management | Secondary shell, later aligned with console surfaces. |

### Project Detail

Target route family: `/projects/[projectId]`.

| Section | Recommended Route / Tab | Purpose |
| --- | --- | --- |
| Overview | `/projects/[projectId]?tab=overview` | Project status, resource summary, warnings, recent activity, next actions. |
| Resources | `/projects/[projectId]?tab=resources` | Dense resource list with create CTA, status, environment, endpoint, latest deployment. |
| Environments | `/projects/[projectId]?tab=environments` | Environment list and lifecycle. |
| Deployments | `/projects/[projectId]?tab=deployments` | Project-scoped deployment table and activity. |
| Settings | `/projects/[projectId]?tab=settings` | Name, metadata, lifecycle, danger zone. |

First implementation slice: improve the current long project page by elevating resources and replacing weak list/empty states with reusable product blocks. Full tab split can follow without changing the domain model.

### Resource Detail

Target route family: `/resources/[resourceId]` and canonical nested project resource route.

| Section | Recommended Tab | Purpose |
| --- | --- | --- |
| Overview | `tab=overview` | Default. Current status, endpoint, latest deployment, health, runtime controls, recent logs/activity, warnings. |
| Deployments | `tab=deployments` | Deployment history and create deployment CTA. |
| Logs | `tab=logs` | Runtime logs with follow/search/copy and precise loading/error states. |
| Domains | `tab=domains` | Resource-scoped domain/DNS/TLS flow and attached domains. |
| Environment | `tab=environment` | Dense environment variable editor, secret masking, validation, save state. |
| Metrics / Health | `tab=monitor` | Usage, diagnostics, proxy/readiness/health details. |
| Settings | `tab=settings` | Source, runtime/build, network, storage, dependencies, advanced configuration, danger zone. |
| Terminal | `tab=terminal` | Operator shell when a deployment exists. |

First implementation slice: add `overview` as the default resource tab, keep existing deeper tabs operational, and use the overview to answer the main operator questions before configuration.

### Deployment Detail

Target route: `/deployments/[deploymentId]`.

| Section | Recommended Tab | Purpose |
| --- | --- | --- |
| Overview | `tab=overview` | Outcome, resource/project/server context, recovery readiness. |
| Timeline | `tab=timeline` | Detect, plan, package, deploy, verify, rollback progression. |
| Logs | `tab=logs` | Deployment logs with follow/copy/filter. |
| Snapshot | `tab=snapshot` | Immutable execution snapshot and environment summary. |

Progress should be rendered as a reusable operation panel on the page. Modals may remain only as temporary layered previews or for focused recovery confirmation.

### Server Detail

Target route: `/servers/[serverId]`.

The current tabbed structure is close to the target model:

| Section | Recommended Tab | Purpose |
| --- | --- | --- |
| Overview | `tab=overview` | Readiness summary, active deployments, key warnings, next checks. |
| Health | `tab=monitor` / `tab=connectivity` | Connectivity, Docker/runtime readiness, SSH state. |
| Resources | `tab=deployments` | Workloads running through the server. |
| Proxy / Routing | `tab=proxy-access` | Domains, access policy, routing. |
| Capacity | `tab=capacity` | Disk/containers/images/volumes and cleanup. |
| Credentials | `tab=credentials` | Credential details, rotation, usage. |
| Terminal | `tab=terminal` | Server terminal. |
| Settings / Danger | `tab=danger` | Deactivate/delete with explicit confirmation. |

## 2. Page / Drawer / Modal / Wizard Decisions

| User Task | Recommended UI Pattern | Why | Notes |
| --- | --- | --- | --- |
| Start first deployment | Full-page wizard | Sequential decisions affect later steps and progress is central to the product loop. | `/deploy` remains the primary entry; progress becomes inline/durable. |
| Create project | Wizard step or lightweight page | Low complexity alone, but usually part of deploy flow. | Modal only acceptable for very short standalone create. |
| Create resource | Project-scoped wizard/page | Source, runtime, target, health, environment, and deploy plan need preserved context. | Current `/projects/[projectId]/resources/new` becomes more wizard-like. |
| Deploy existing resource | Full page with inline operation panel | Users need plan preview, progress, logs, and recovery without losing page context. | Replace spinner/modal dependency with operation panel. |
| Inspect deployment | Detail page with tabs | Attempts are durable operational records. | Timeline is first-class; logs stay tabbed. |
| View live progress | Inline panel or detail tab | Long-running operations should remain visible and revisitable. | Modal can be kept only as temporary transitional affordance. |
| View logs | Tab/panel | Logs are repeated operational work and need density. | Avoid black terminal identity; use restrained mono panel. |
| Bind domain | Resource-scoped guided flow | DNS and TLS are staged, risky, and resource-specific. | Global page becomes rollup/troubleshooting. |
| Verify DNS / issue TLS | Guided status panel | Requires exact records, current state, retry, and troubleshooting. | Show pending/failed/active separately. |
| Configure environment variables | Dedicated tab or dense inline editor | Repeated task with validation and secret handling. | Use table-like editor, save state, masked values. |
| Configure runtime/build | Configure/settings tab sections | Important but not always sequential after create. | Keep advanced options progressive. |
| Connect server | Full-page wizard/checklist | Identity, credential, connectivity, and readiness are sequential. | Current page is good base. |
| Inspect server health | Overview plus Health/Connectivity tabs | Health spans multiple signals. | Surface current readiness at top. |
| Rotate SSH credential | Modal or drawer | Focused sensitive operation with limited fields. | Current modal is acceptable after visual alignment. |
| Delete resource/project/server/domain | Danger zone plus confirmation modal | Destructive and low-frequency. | Require typed name for irreversible delete where practical. |
| Backup/restore dependency resource | Drawer/side panel | Contextual operation while preserving list/detail. | Restore needs stronger danger framing. |

## 3. Product-Level UI Blocks

| Block | Purpose | When To Use | Rough Layout | Key States | Actions |
| --- | --- | --- | --- | --- | --- |
| App shell | Persistent product navigation and global health/session context | All console pages | Sidebar, compact top header, breadcrumb/title, action cluster | Backend unavailable, auth loading, partial project tree | Deploy, theme, account, retry health |
| Page header | Establish page owner, scope, status, primary action | List, detail, creation pages | Kicker, title, description, badges, metadata row, right action slot | Loading title, partial metadata, permission-limited action | Primary CTA, secondary links |
| Project header | Show project status and next action | Project overview/detail | Name, status, counts, environment summary, action bar | Loading, archived, empty resources, warning | Create resource, deploy, settings |
| Resource header | Show one workload's operational identity | Resource detail | Name, type, environment, status badge, endpoint, primary deploy action | Loading, degraded, stopped, archived | Deploy, open endpoint, logs, settings |
| Status summary cards | Make current state scannable | Overview pages | Compact 2-4 item strip with icon/status/text | Skeleton, unknown, warning, failed | Open detail, retry/check |
| Resource list table | Scan resources in a project | Project detail and resource rollups | Table/record list with type, status, environment, latest deployment, endpoint, updated | Skeleton rows, empty CTA, partial deployment data | Open, deploy, logs, endpoint |
| Deployment timeline | Explain operation stage | Deployment detail and active deploy panels | Vertical/compact timeline with status, timestamp, message | Waiting, running, failed, completed, partial stream | Retry, cancel, open logs |
| Deployment log viewer | Read build/runtime/deploy logs | Deployment detail, resource logs | Monospace panel with severity, timestamp, search/filter/copy/follow | Skeleton lines, empty, stream error, partial logs | Copy, follow, refresh |
| Operation progress panel | Reusable long-running operation feedback | Deploy, resource create, deployment detail, DNS/TLS checks | Header summary, current step, timeline, restrained log well | Pending, running, failed, success, stream interrupted | View detail, retry/check, cancel where supported |
| Environment variable editor | Dense config editing | Resource Environment tab and create flow | Table editor, add row, masked secrets, changed-state footer | Loading, empty, validation error, saved, saving | Add, import, save, discard |
| Domain verification panel | DNS/TLS guided status | Resource Domains tab and domain detail drawer | Domain header, DNS record table, verification checklist, TLS status | Pending DNS, failed DNS, issuing TLS, active, error | Check again, copy records, retry cert |
| Empty state panel | Useful absence state | Tables/tabs/lists | Compact panel with icon/support mark, title, body, primary/secondary action | N/A | Create, deploy, connect, docs |
| Error recovery panel | Inline recoverable failure | Query or operation failures | Affected scope, explanation, technical detail toggle, retry/log link | Partial data available, fatal unavailable | Retry, open logs, diagnostics |
| Danger zone | Isolate destructive operations | Settings tabs/detail pages | Separate section with warning copy and confirmation trigger | Delete check loading, blocked by dependencies, confirmation required | Archive, deactivate, delete |
| Create resource wizard | Controlled resource creation | `/projects/[projectId]/resources/new` | Step list or segmented sections, main form, sticky review, inline progress after submit | Invalid step, saving, progress, failed, success | Continue, back, create, open resource |
| Activity feed | Recent deployments/events | Home/project/resource overview | Dense chronological list | Skeleton, empty, partial failures | Open event/deployment |
| Inline command/action bar | Local repeated actions | Logs, terminal, tables, runtime controls | Compact toolbar with text/icon buttons and status | Saving, disabled, permission-limited | Refresh, follow, copy, start/stop |

## 4. Visual Style Direction

The implementation must follow `packages/design/DESIGN.md` and `docs/ux/paas-ui-redesign-style-contract.md`. The visual identity is Quiet Infrastructure: warm, precise, compact, and operational.

### Typography

| Type | Direction |
| --- | --- |
| Page title | IBM Plex Sans, compact but strong, high contrast, no decorative sizing. |
| Section title | Medium weight, short, paired with useful metadata or action only when needed. |
| Body text | Comfortable line height, direct operational language, avoid marketing copy. |
| Metadata | Muted but legible; use mono only for IDs, domains, commands, env keys, ports, and logs. |
| Code/log | IBM Plex Mono, readable line height, restrained neutral surface, severity labels. |
| Empty state title/body | Calm and specific; title names the missing object, body explains the next useful action. |

### Layout

| Rule | Direction |
| --- | --- |
| Page width | Dense console pages use full available content width with consistent inner padding; creation flows may use a main column plus sticky review. |
| Dashboard density | Medium-dense. Summary first, detail second, no oversized hero blocks. |
| Sidebar/content | Sidebar is persistent; content headers should avoid duplicating navigation labels without state. |
| Card/table usage | Tables/record rows for operational lists; cards for summaries, choices, overview panels, and empty states. |
| Section spacing | Clear vertical rhythm with fewer equal-weight panels. |
| Detail pages | Owner header, status summary, stable tabs, then focused sections. |

### Surfaces

| Surface | Direction |
| --- | --- |
| Background | Warm neutral from design tokens; avoid pure white blocks where subtle depth helps. |
| Primary panels | `console-panel` with light separation, not heavy shadow. |
| Secondary panels | `console-subtle-panel` for supportive grouping. |
| Nested panels | Avoid deep nesting; use typography, spacing, and dividers instead. |
| Hover | Subtle surface change and clear row affordance. |
| Selected | Restrained accent background or left indicator; no saturated fills. |

### Color Behavior

Use a small semantic palette from `@appaloft/design`. Color must be paired with label, icon, or shape.

| Semantic Use | Behavior |
| --- | --- |
| Primary action | Sparing accent; one obvious primary action per section. |
| Secondary action | Neutral surface, lower weight, clear hover. |
| Success | Active/verified/completed states; never just a green dot. |
| Warning | Degraded/pending risky actions; include explanation. |
| Error | Failed/destructive states; include recovery path. |
| Pending | Neutral/amber label with next check or wait reason. |
| Running | Accent/running badge plus current step/timeline. |
| Disabled | Muted with reason when action is important. |
| Metadata | Muted neutral with sufficient contrast. |

### Components

| Component | Product Direction |
| --- | --- |
| Buttons | Compact, 6px radius, one primary action, destructive separated from normal action clusters. |
| Badges | Compact, semantic, text-first, consistent variants for running/pending/failed/healthy. |
| Tabs | Stable resource siblings; compact, no decorative large pills. |
| Tables | Medium-dense, hierarchy in first column, status and updated metadata visible, skeleton rows. |
| Cards | Summary and choice surfaces only; avoid card soup for every form section. |
| Forms | Grouped fields, helper text, inline validation, save state, advanced collapsed when appropriate. |
| Inputs/selects | Quiet, compact, clear disabled/error states. |
| Drawers | Context inspection and lightweight edits; preserve list context. |
| Modals | Confirmation or short focused actions only. |
| Skeletons | Match final layout: header, table rows, timeline rows, form groups. |
| Toasts | Secondary feedback only; important errors are inline. |
| Timelines | Compact stage list with timestamp/status/message/log affordance. |
| Log viewer | Mono, precise, neutral, not green-on-black or decorative terminal chrome. |
| Empty states | Specific title, concise explanation, primary next action, optional docs/secondary action. |

## 5. State Design Matrix

| Screen / Block | Loading | Empty | Error | Partial | Long-Running | Success |
| --- | --- | --- | --- | --- | --- | --- |
| App shell | Sidebar/header skeleton or preserved last-known nav | No projects prompt in tree/content | Backend unavailable panel with retry | Show shell and mark unavailable sections | Health check status inline | Session/action confirmation in content |
| Home | Header, metric, activity skeletons | Next-step command center CTA | Inline recovery panel for health/deployments | Show known counts before slower lists | Active deployments use progress summary, not spinner | Recent success highlighted in activity |
| Project list | Skeleton table/records | Create/deploy project empty panel | Retryable list error | Counts may be unavailable with notice | N/A | New project row appears with confirmation |
| Project detail | Header/status/resource skeletons | Resource empty panel with create/deploy CTA | Retryable project/resources/deployments panels | Show project metadata even if rollups fail | Active deployment strip in overview/resources | Inline saved/deployed confirmation |
| Resource list table | Skeleton rows | Resource-specific empty state | Retry list/deployment rollup | Rows render without latest deployment when missing | Running deployment badge/current step per row | New resource row plus next action |
| Resource detail | Resource header skeleton, tab content skeleton | Per-tab empty panel | Retryable section errors | Header remains with section errors | Overview shows current stage/timeline | State badge and latest deployment update |
| Resource overview | Summary skeletons | No deployments/logs/domains next action cards | Error recovery panel for health/logs/deployments | Show access URL even if logs fail | Operation progress panel for active deploy/runtime action | Success banner or updated status line |
| Resource create wizard | Step/form skeletons | No servers/providers/source guidance | Inline validation and recoverable submit error | Preserve created resource if deployment fails | Inline operation panel after submit | Link to resource/deployment |
| Deployment detail | Header/tabs/log timeline skeletons | No logs/events panel | Retryable stream/query errors | Show snapshot/context even if logs fail | Timeline/logs follow current stage | Completed summary and recovery options |
| Operation progress panel | Waiting/timeline skeleton | Waiting for first event message | Stream interrupted with reconnect/retry | Render received events and known IDs | Current step, timeline, logs, optional cancel | Completed state with open detail action |
| Domain verification panel | DNS/TLS checklist skeleton | No domains CTA | Verification error with retry/check again | DNS known, TLS unknown or vice versa | Pending DNS/TLS stage with timestamp | Active domain/TLS issued confirmation |
| Environment editor | Row skeletons | Add first variable/import CTA | Row-level validation and save error | Preserve valid rows with invalid marked | Saving footer with changed count | Saved timestamp/clean state |
| Server detail | Header/overview skeletons | No deployments/credentials guidance | Connectivity/capacity retry panels | Show identity even if checks fail | Connectivity/capacity operations as timeline/checklist | Fresh readiness result |
| Danger zone | Dependency/delete-check loading | N/A | Blocked deletion reason | Known blockers listed | Confirmation pending state | Deletion/archive redirect or updated status |

## 6. Implementation Plan

The complete redesign is larger than one safe pass. Phase 3 should implement a coherent vertical slice that improves daily PaaS operation without rewriting every console page.

### Scope For This Pass

1. Add reusable state and operation product blocks.
2. Add a resource `Overview` tab and make it the default resource detail entry.
3. Improve project resource list scanning and empty state with a reusable resource list block.
4. Replace dark/default deployment progress visuals with a restrained operation progress panel.
5. Add inline long-running progress to the project-scoped create/deploy flow.
6. Keep existing business logic and oRPC/TanStack data dependencies intact.

### Files To Change

| File | Planned Change |
| --- | --- |
| `apps/web/src/lib/components/console/ConsoleStatePanel.svelte` | New reusable empty/error/success/permission panel with action slots. |
| `apps/web/src/lib/components/console/OperationProgressPanel.svelte` | New reusable deployment/operation timeline and log block. |
| `apps/web/src/lib/components/console/ResourceListTable.svelte` | New reusable dense resource list block for project/resource rollups. |
| `apps/web/src/lib/components/deployments/DeploymentProgressDialog.svelte` | Refactor internals to use `OperationProgressPanel` and Quiet Infrastructure surfaces. |
| `apps/web/src/routes/(console)/projects/[projectId]/resources/new/+page.svelte` | Add inline operation progress after submit and reuse the progress block. |
| `apps/web/src/routes/(console)/projects/[projectId]/+page.svelte` | Replace ad hoc resource list/empty state with `ResourceListTable` and better resource-first hierarchy. |
| `apps/web/src/routes/(console)/resources/[resourceId]/+page.svelte` | Add `overview` tab/default and an overview content block for access, health, latest deployment, and next actions. |
| `packages/i18n/src/keys.ts` | Add keys for new shared panels, resource overview labels, and operation progress copy. |
| `packages/i18n/src/locales/en-US.ts` | Add English strings for new UI copy. |
| `packages/i18n/src/locales/zh-CN.ts` | Add Chinese strings for new UI copy. |

### Components To Replace Or Avoid

| Existing Pattern | Replacement |
| --- | --- |
| Dark progress/log modal body | `OperationProgressPanel` with neutral surface and compact timeline. |
| Text-only empty strips in resource/project lists | `ConsoleStatePanel` with specific CTA. |
| Project-local resource rows | `ResourceListTable` with consistent status, type, latest deployment, endpoint, updated metadata. |
| Resource detail defaulting to `settings` | `overview` tab with settings retained as a secondary tab. |

### Data Dependencies

- Reuse `createConsoleQueries`, resource/project/deployment queries, and existing mutation functions.
- Reuse existing deployment progress event stream from `createDeploymentWithProgress`.
- Reuse existing deployment table/status helpers where possible.
- Do not introduce new backend contracts in this pass.
- Do not move business behavior into Svelte components beyond UI state composition.

### State Handling Changes

- Keep existing query invalidation and mutation behavior.
- Add visible inline progress state when a deployment starts from the resource create page.
- Preserve stream errors inside the progress panel with retry/open-detail affordance when available.
- Add richer empty and partial states to project/resource list and resource overview.
- Keep modal progress compatibility where existing flows depend on it, but make the modal content reusable and visually aligned.

### Styling And Theme Changes

- No new local color palette, font stack, or Tailwind theme tokens.
- Use existing `console-*` surfaces and `@appaloft/ui` primitives.
- Avoid raw `rounded-md border bg-card` as the default product block.
- Keep log/progress panels light-neutral and monospaced only for log lines/IDs.
- Do not add decorative gradients, glass effects, large hero blocks, or default shadcn card identity.

### Tests And Validation

Run after implementation:

- `bun run --cwd apps/web check`
- `bun run --cwd apps/web lint`
- `bun run --cwd apps/web test:unit -- --run` if existing tests are fast enough for the changed surface
- `bun run lint` if targeted app lint passes and the repo-wide check is feasible

If validation exposes unrelated pre-existing failures, record them separately and fix only issues introduced by this slice.

### Deferred UX Debt

- Split project detail into stable Overview/Resources/Environments/Deployments/Settings tabs.
- Move resource Domains and Environment out of the overloaded Settings tab into dedicated tabs.
- Convert global domain create into resource-scoped guided DNS/TLS flow.
- Add visible deployment/resource filters to list pages.
- Align `QuickDeployProgressDialog.svelte` with the same operation block or remove the modal once `/deploy` has durable progress.
- Align Management shell pages with console surfaces.
- Add typed-name confirmation consistently for irreversible deletes.
