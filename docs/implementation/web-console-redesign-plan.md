# Web Console Redesign Plan

> Status: Design Round with first implementation pass in `apps/web`.
>
> Scope: `apps/web` information architecture, interaction grammar, layout rules, and future screen
> generation guidance.
>
> This document does not change business behavior. It defines how the Web console should present
> existing Appaloft operations and how future Web work should choose navigation, tabs, cards,
> panels, tables, terminals, and help surfaces.

## Governing Inputs

- [Product Roadmap To 1.0.0](../PRODUCT_ROADMAP.md)
- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Domain Model](../DOMAIN_MODEL.md)
- [Public Documentation Structure](../documentation/public-docs-structure.md)
- [Public Docs Traceability](../documentation/public-docs-traceability.md)
- [Project Resource Console Workflow Spec](../workflows/project-resource-console.md)
- [Project Resource Console Test Matrix](../testing/project-resource-console-test-matrix.md)
- [Minimum Console And Deployment Loop Test Matrix](../testing/minimum-console-deployment-loop-test-matrix.md)
- [Operator Terminal Session Workflow Spec](../workflows/operator-terminal-session.md)
- [Appaloft Design Language](../../packages/design/DESIGN.md)
- Stitch design workflow: `stitch-design` and `design-md` installed from
  `google-labs-code/stitch-skills`

## Product Interpretation

The Web console is an operator workspace for a deployment control plane. It should make the v1 loop
visible without turning the product into generic CRUD:

```text
Project
  -> Environment
  -> Deployment Target / Server
  -> Credential
  -> Resource
      -> Deployment attempt
      -> Health
      -> Runtime logs
      -> Access route
      -> Diagnostics
      -> Terminal session
```

The console must follow the public documentation IA because that IA is organized by user goals:

| Public docs group | Console area | Console responsibility |
| --- | --- | --- |
| Start Here | Home and Quick Deploy | Guide a first successful deployment and show the next blocking step. |
| Deploy | Deployment create, progress, deployment detail | Show attempt lifecycle, plan, execution, verify, rollback context, and history. |
| Projects And Resources | Project list/detail, resource detail, resource creation | Make `Project -> Resource -> Deployment history/actions` the primary mental model. |
| Servers And Credentials | Servers, credentials, server terminal, connectivity, proxy readiness | Manage deployment targets and safe operator access. |
| Environments And Configuration | Environment panels, variable and effective config surfaces | Explain config ownership, precedence, snapshots, and secret masking. |
| Access, Domains And TLS | Resource access, domain bindings, TLS/certificates, default access policy | Separate generated access, server-applied routes, and durable custom domains. |
| Observe And Troubleshoot | Health, logs, diagnostics, operator work, failure recovery | Put evidence and recovery near the affected resource or target. |
| Integrations | Future GitHub/provider/plugin surfaces | Keep vendor setup out of core deployment pages until selected. |
| Reference | API/CLI/help links and advanced details | Link through `DocsHelpLink`, not long inline explanations. |
| Self-Hosting And Operations | Future app/system operations | Keep Appaloft control-plane operation separate from deployed app operation. |

## Current Console Problems

1. Server detail uses a long stacked page for unrelated modes: identity, settings, credential usage,
   default access policy, connectivity, deployments, and terminal. This forces the terminal to the
   bottom even though terminal access is an operator task, not a footnote.
2. Resource detail has a better top-level tab structure, but the section taxonomy still mixes
   profile editing, configuration, domains, health, proxy, and diagnostics under a generic
   "settings" label.
3. Cards, border bands, and muted blocks are used interchangeably. The same visual treatment can
   mean a repeated object, a functional form, a status readout, or a warning.
4. Top-level list pages sometimes optimize for metrics before the user's next action. Operational
   records should favor dense lists, filters, status, and object ownership.
5. Help links exist, but they are not yet the organizing spine. Console classification should match
   public docs groups and traceability rows.
6. Terminal and logs are treated as visual appendices. They should be first-class operational
   workspaces with their own persistent controls, streaming state, resize behavior, and recovery
   affordances.

## Redesign Principles

1. Default to the user's next operation, not the database object.
2. Preserve domain ownership in page structure. Project owns resource collection. Resource owns
   deployment actions and runtime observation. Deployment owns one attempt. Server owns target
   readiness and safe operator access.
3. Use tabs only for mutually exclusive modes on the same owner. Use section navigation for a set
   of configuration panels inside one mode. Use cards only for repeated objects or framed tools.
4. Keep the primary evidence near the primary action. Access URL, health, and diagnostic summary
   belong on the default resource workspace. Connectivity, proxy readiness, credential state, and
   terminal belong on server operational tabs.
5. Make terminal sessions docked workspaces, not bottom-of-page content. The terminal can be a tab,
   split pane, drawer, or route state, but it must be reachable from the page header or top-level
   tabs without scrolling.
6. Prefer tables and lists for operational records. Use cards for resource summary rows only when
   each item has enough heterogeneous state to justify a richer object tile.
7. Do not explain the UI in the UI. Use concise domain labels, status, inline validation, and
   docs help links.
8. Every major panel must answer one question: "What is this?", "What can I do now?", "What
   happened?", or "How do I recover?"

## Implemented Surface Grammar

The first implementation pass uses explicit surface classes instead of implicit border utilities:

- `console-panel`: one owner operation or form surface. Use for settings, policy forms, terminal
  panels, and creation flows.
- `console-subtle-panel`: low-emphasis status, empty state, helper, or result block inside a
  larger owner surface.
- `console-record-list` and `console-record-row`: repeated operational records. Use instead of
  cards for projects, servers, credentials, routes, resources, and deployment tables.
- `console-metric-strip`: compact related counters. It is a supporting element, not the primary
  page structure.
- `console-field-label`: label plus docs help affordance. Use this for forms so help icons never
  collide with labels or inputs.
- `console-page-kicker`: small owner/category marker. Do not use it as the only owner signal.

Do not rely on raw `border-y` to create page structure. If a new area needs visual ownership,
choose one of the surfaces above or add a specific component-level surface with the same semantics.

## Visual Direction Update

The console should not look like an unmodified shadcn installation, but it should remain a light
deployment operator bench:

- light, persistent navigation rail with quiet active states;
- cool off-white workspace without decorative gradients;
- rectangular, lower-radius panels with a thin operational spine instead of generic white cards;
- compact uppercase badges for machine state and status;
- primary actions use deep ink/blue treatment rather than default black buttons;
- lists and tables reveal active rows with a left status rail, not only a pale hover fill.

This style remains restrained and operational. Do not add marketing gradients, decorative blobs,
dark novelty shells, or large illustrative sections to the console.

## Target Information Architecture

### Global Shell

The shell should become a persistent console frame:

- left sidebar: `Projects -> Resources` hierarchy with compact health state;
- top utility row: current project/environment context, docs, API status, theme/language;
- global primary action: Quick Deploy;
- contextual breadcrumbs: owner path only, not every related object;
- command palette later: search objects, docs anchors, and operations.

The sidebar should be shaped by `Project -> Resource`, not by a flat list of pages. Top-level
entries remain available for `Deployments`, `Servers`, `Access`, and future `Operator Work`, but
resource work should always feel owner-scoped.

### Home

Home should not be a marketing dashboard. It should be a start and recovery surface:

- first deployment checklist when no deployable resource exists;
- next blocked item when the minimum loop is incomplete;
- latest active work when deployments or operator tasks are running;
- recently affected resources and failures;
- compact system readiness.

Avoid decorative metrics unless they guide action.

### Project Detail

Project detail should be a resource collection surface:

Top-level tabs:

- `Resources`: default. Resource list, health, environment, latest deployment context, create
  resource.
- `Environments`: environment lifecycle, config ownership, lock/archive state.
- `Deployments`: project rollup only. No direct project-owned deployment mutation.
- `Settings`: project rename/archive and lifecycle metadata.

Use a list/table for resources when there are more than a few. A resource card is allowed only for
empty states, onboarding, or an object tile that includes health, access, environment, and latest
deployment context.

### Resource Detail

Resource detail is the core application workspace.

Top-level tabs:

- `Overview`: default. Current access URL, health, profile summary, latest deployment context,
  diagnostics shortcut.
- `Configure`: source, runtime, network, environment variables, health policy, access policy.
- `Deployments`: resource-scoped history and new deployment action.
- `Logs`: runtime logs, refresh/follow controls, copy/export later.
- `Terminal`: resource-scoped terminal session.
- `Diagnostics`: diagnostic summary, proxy preview, support payload, failure context.

Inside `Configure`, use vertical section navigation because these are panels in the same mode:

- `Source`
- `Runtime`
- `Network`
- `Configuration`
- `Health`
- `Access`
- `Domains And TLS`

The current `settings` tab should be renamed because it hides the product meaning. The first
resource tab must keep the access URL visible when available. Domain binding and TLS setup belongs
under `Configure -> Domains And TLS`, not a modal-first path.

### Deployment Detail

Deployment detail owns one attempt.

Top-level tabs:

- `Overview`: status, source, target, access snapshots, links to owning resource.
- `Progress`: detect, plan, execute, verify, rollback timeline.
- `Logs`: attempt logs.
- `Snapshot`: immutable deployment snapshot, masked config, runtime plan.

Deployment pages must not become the primary place to operate the live application after the
attempt finishes. The resource page owns current health, runtime logs, access, and terminal.

### Server Detail

Server detail should be reworked from a long document into a target operations workspace.

Top-level tabs:

- `Overview`: identity, host, provider, lifecycle, credential summary, proxy summary, capacity
  later.
- `Connectivity`: connectivity test, check history, proxy bootstrap/repair affordance when active.
- `Credentials`: reusable credential usage and rotation/delete links when supported.
- `Proxy And Access`: edge proxy kind, default access override, route readiness summary.
- `Deployments`: deployments and resources placed on this target.
- `Terminal`: server-scoped terminal session.
- `Danger Zone`: deactivate/delete safety and guarded destructive actions.

The terminal must be a top-level tab and reachable from a header action. It must not appear only
after connectivity and deployment rollups.

### Access, Domains, And TLS

Access should be object-scoped in normal work and global only for policy:

- resource overview shows the current effective public URL;
- resource configure shows generated access mode and custom domain bindings;
- server proxy/access tab shows target-level default access override and proxy readiness;
- global Access page, when added, is a rollup and troubleshooting index, not the owner of every
  domain action.

Generated default access, server-applied route state, and durable `DomainBinding` records must be
visually separate.

### Observe And Troubleshoot

Every owner page should have an evidence path:

- resource: health, runtime logs, diagnostics, proxy preview, terminal;
- deployment: attempt progress, attempt logs, immutable snapshot;
- server: connectivity, proxy readiness, terminal, capacity later;
- global: operator work ledger and cross-resource failure queue later.

Troubleshooting surfaces should show safe support payload copy controls and mask secrets by
default.

## Interaction Grammar

### Surface Grammar

The console must not use raw horizontal rules as the primary way to explain structure. Thin lines
are allowed for table rows, tab underlines, and compact dividers inside an already named panel.
Owner pages use a small set of surface types:

- `Owner header`: title, status chips, one primary action, and two or fewer secondary actions.
- `Work-mode tabs`: URL-backed modes on the current owner.
- `Operation panel`: a named command/query surface with fields, docs help, submit state, and
  inline feedback.
- `Evidence panel`: read-only status, diagnostics, logs, terminal, or immutable snapshots.
- `Record list/table`: scan-first operational records, never card grids by default.
- `Empty state`: one explanation, one primary action, optional secondary navigation.
- `Danger surface`: destructive or irreversible actions with blocker/readiness evidence.

Panel boundaries should be visible as complete surfaces: subtle background, 6-8px radius, thin
border, and internal spacing. A section that is only `border-y` is considered unfinished.

### Container Decision Matrix

Choose the container from the operation's effect and duration:

| Container | Use For | Do Not Use For |
| --- | --- | --- |
| Inline operation panel | Persistent owner configuration, single command forms, read/write settings that explain current state | Multi-step creation, destructive confirmation |
| Sheet | Multi-step creation, deployment/registration flows, task-focused side work that benefits from preserving the current page | Routine field edits, dangerous actions |
| Modal dialog | Destructive confirmation, unsafe transition confirmation, short blocking review before a high-risk command | Normal create/edit forms, long workflows |
| Top-level route | Durable owners, shareable object detail, attempt history, terminal/log workspaces that need URL state | Temporary one-field edits |
| Popover/dropdown | Short choice sets, overflow actions, language/theme/account menus | Forms with validation, domain operations |

The default rule: if the command changes the current owner and the user needs surrounding context,
keep it inline. If the command creates a new owner or starts a workflow, use a sheet or route. If
the command can delete, revoke, rotate, archive, deactivate, or expose access, require a modal or a
danger-zone panel with explicit readiness evidence.

### Navigation

Use route-level pages for durable owners:

- `/projects`
- `/projects/:projectId`
- `/resources/:resourceId`
- `/deployments/:deploymentId`
- `/servers/:serverId`

Use query state for tabs and inner panels:

```text
/resources/:resourceId?tab=configure&section=runtime
/servers/:serverId?tab=terminal
```

Do not use hash anchors for core configuration panels that swap operational content.

### Tabs

Use tabs when:

- the user is staying on one owner;
- each tab is a different mode of work;
- showing all panels at once would create a long mixed-purpose page;
- tab state is worth preserving in the URL.

Do not use tabs for:

- one-item navigation;
- small field groups inside one form;
- filtering a list. Use filters, segmented controls, or table views instead.

Top-level tab labels should be nouns or concise work modes: `Overview`, `Configure`, `Deployments`,
`Logs`, `Terminal`, `Diagnostics`.

### Section Navigation

Use inner section navigation when:

- one tab has multiple sibling configuration areas;
- only one panel should be edited at a time;
- the left side names product-owned profiles or policies.

Do not nest cards inside the section navigation panel. The panel itself is the frame.

### Cards

Use cards for:

- repeated object tiles in low-density contexts;
- framed tools such as terminal, log viewer, diagnostics payload, or wizard steps;
- empty states with one primary action;
- small status summaries when the panel has a clear owner and action.

Do not use cards for:

- page sections;
- rows of operational records that should be tables or lists;
- nested panels inside another card;
- decorative separation where a border band or list row is enough.

Cards use 6px radius from the design token, thin borders, and shadow only when elevation conveys
popover or overlay state.

### Tables And Lists

Use tables for deployments, servers, credentials, domain bindings, certificates, and operator work
when comparing rows matters. Use list rows for project/resource navigation when each row has a
primary label, status, and one or two secondary facts.

Tables should support:

- compact row height;
- status badge;
- owner link;
- created/updated time;
- contextual actions in an overflow menu when actions exceed two.

### Forms

Forms should be operation-shaped, not object-shaped:

- `Rename project`
- `Configure runtime`
- `Configure network`
- `Set variable`
- `Confirm domain ownership`

Each form panel should name the operation, show only the fields governed by that operation, and link
to the matching docs anchor. Broad "update" forms are forbidden.

### Terminal

Terminal panels are operational tools:

- use a top-level `Terminal` tab or a right-side docked split opened from a top action;
- never require scrolling to the bottom of a long detail page;
- reserve stable height with `min-height: 28rem` on desktop and viewport-relative height on
  smaller screens;
- keep connect/disconnect, copy, reconnect, session id, and scope visible above the terminal;
- show scope clearly: server target shell or resource workspace shell;
- preserve terminal state while switching between nearby tabs when feasible;
- keep logs and terminal separate. Logs are observation. Terminal is intervention.

### Logs

Logs are read-only observation by default:

- keep refresh/follow controls in a sticky panel header;
- use monospace with stable line wrapping and timestamp/source columns;
- mask secrets visually and label masked lines;
- provide copy/export later through explicit commands.

### Feedback

Use feedback by severity:

- inline validation next to fields;
- compact alert row in the operation panel after command submission;
- toast only for transient confirmation that does not require reading;
- blocking dialog only for destructive confirmation or unsafe navigation.

### Destructive Actions

Use a `Danger Zone` tab or section when destructive actions require safety context. It should show
the blocking query result before the destructive button. Destructive actions must not sit beside
routine save controls.

## Visual System

The console should feel precise, quiet, and operator-focused.

Palette roles follow `@appaloft/design`:

- page canvas: white or near-black;
- primary text/action: near-black or near-white;
- border structure: narrow neutral gray;
- blue ring/accent: focus, links, active tab underline;
- green: ready/succeeded;
- red: failed/destructive;
- amber: warning, delayed readiness;
- neutral gray: unknown, not configured, no deployment.

Typography:

- IBM Plex Sans for UI text;
- IBM Plex Mono for ids, ports, command text, code, logs, and terminal;
- Fraunces only for rare brand/editorial use, not console section titles.

Density:

- console pages use compact spacing and predictable alignment;
- no oversized heroes inside authenticated console surfaces;
- headings inside panels stay small: `text-lg` or below;
- object names may use `text-2xl` in owner headers only.

Shape and depth:

- default radius: 6px;
- buttons and inputs use shared shadcn-svelte primitives;
- border-first surfaces;
- shadow only for popovers, dialogs, drawers, and floating command palettes.

## Stitch Design System Prompt

Use `.stitch/DESIGN.md` as the semantic design system when generating redesigned screens in Stitch.
Before generating a screen, enhance the prompt with:

```markdown
Design an Appaloft Web console screen for [owner and task].

Overall vibe: precise, dense, calm, deployment-operations workspace. No marketing hero, no
decorative gradients, no card-heavy dashboard.

DESIGN SYSTEM REQUIRED:
- Platform: Web desktop-first with responsive tablet/mobile fallbacks.
- Palette: monochrome precision base, blue active/focus accents, semantic status colors only.
- Typography: IBM Plex Sans for UI, IBM Plex Mono for ids/logs/commands.
- Layout: persistent sidebar, owner header, top-level work-mode tabs, dense tables/lists.
- Components: tabs for owner modes, section nav for configuration panels, cards only for repeated
  object tiles or framed tools.

PAGE STRUCTURE:
1. Console shell with project/resource/sidebar context.
2. Compact owner header with status and one primary action.
3. Work-mode tabs.
4. Main content panel optimized for the selected task.
5. Docs help affordances near operation-specific fields.
```

## Migration Plan

### Round 1: Shared Console Grammar

- Add a real `ConsoleShell` sidebar that models `Projects -> Resources`.
- Add reusable owner header, work-mode tabs, section nav, and operation panel primitives.
- Align route query state for tabs and sections.
- Add Storybook or static fixture coverage later if a design preview surface is introduced.

### Round 2: Resource Workspace

- Rename resource `settings` to `configure`.
- Split default resource overview from configure panels.
- Keep current access URL, health, and diagnostic shortcut visible on default overview.
- Move proxy preview and diagnostics out of configure when they are observation/recovery surfaces.
- Keep `Terminal` as a top-level tab.

### Round 3: Server Workspace

- Replace the long server detail page with top-level tabs:
  `Overview`, `Connectivity`, `Credentials`, `Proxy And Access`, `Deployments`, `Terminal`,
  `Danger Zone`.
- Move terminal above the fold through tab/header access.
- Move delete safety and destructive actions into `Danger Zone`.
- Move default access override under `Proxy And Access`.

### Round 4: Project And Deployments

- Make project resources the default dense list.
- Keep deployment rollups secondary.
- Ensure project-level deployment shortcuts route through Quick Deploy or resource selection.
- Keep deployment detail attempt-scoped and push live-app operation back to resource detail.

### Round 5: Public Docs And Help Alignment

- Add missing public docs pages or migration gaps for any Web surface without a stable help anchor.
- Update `packages/docs-registry` and public docs traceability when links change.
- Add Web e2e assertions for tab defaults, terminal placement, and help anchors.

## Acceptance Checklist

- Resource default page answers: current access, current health, latest deployment context, next
  action, and recovery entry.
- Server terminal is reachable as a top-level work mode without scrolling.
- No top-level owner page mixes unrelated forms, readouts, destructive actions, and terminal in one
  uninterrupted vertical stack.
- Cards are used only for repeated object tiles, framed tools, and empty states.
- Operational records use tables or dense lists.
- Top-level tabs represent owner work modes.
- Inner section nav represents sibling configuration panels.
- Every form maps to an explicit command/query operation and docs help target.
- Generated default access, server-applied routes, and durable custom domain bindings are visually
  distinct.
- Destructive actions live in a safety context with blocker readout.
- Public wording follows documentation IA and does not expose DDD/CQRS implementation language.
- UI copy uses `packages/i18n` keys.

## Deferred Gaps

- This document does not implement the redesign.
- Stitch MCP screen generation was not available in this Codex session, so `.stitch/DESIGN.md`
  acts as the reusable Stitch input rather than a downloaded Stitch project export.
- Some referenced public docs pages are IA targets and may still be migration gaps until the docs
  app contains the full IA v2 tree.
