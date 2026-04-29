# Design System: Appaloft Web Console

**Project ID:** local-appaloft-console-redesign

## 1. Visual Theme & Atmosphere

Appaloft is a precise, calm, dense deployment-operations workspace. It should feel like a reliable
control plane for real application deployments, not a generic SaaS dashboard and not a marketing
site. The mood is structured, quiet, technical, and human-readable. Visual energy comes from clear
status, strong alignment, and purposeful controls rather than gradients, illustrations, or oversized
cards.

The console should always expose the product's operational order:

```text
Project -> Environment -> Resource -> Deployment
Deployment Target / Server -> Credential -> Destination
Resource -> Access -> Health -> Logs -> Diagnostics -> Terminal
```

## 2. Color Palette & Roles

- **Console Canvas** (`oklch(1 0 0)`): page background and main workspace surface.
- **Console Ink** (`oklch(0.205 0 0)`): primary text, primary action fill in light mode, and
  active tab text.
- **Subtle Surface** (`oklch(0.985 0 0)`): sidebars, empty states, low-emphasis tool surfaces, and
  row hover background.
- **Quiet Border** (`oklch(0.922 0 0)`): panel boundaries, table rows, input borders, and divider
  lines.
- **Focus Blue** (`oklch(0.57 0.19 255)`): focus ring, links, active navigation accents, and
  running/planning status.
- **Ready Green** (`oklch(0.58 0.18 145)`): healthy, ready, succeeded, configured-positive states.
- **Failure Red** (`oklch(0.61 0.21 27)`): failed, unhealthy, destructive, unsafe actions.
- **Warning Amber** (`oklch(0.66 0.16 75)`): delayed readiness, warnings, pending verification.
- **Muted Text** (`oklch(0.45 0 0)`): secondary labels, timestamps, descriptions, placeholders.

Dark mode mirrors the same roles with near-black canvas, pale text, and brighter semantic colors.

## 3. Typography Rules

- Use IBM Plex Sans for all UI text.
- Use IBM Plex Mono for ids, ports, command snippets, runtime logs, terminal content, route
  fragments, and masked configuration values.
- Use Fraunces only for rare brand/editorial surfaces, not for routine console headings.
- Owner page titles may be large. Panel titles stay compact.
- Labels are short, direct, and domain-specific.
- Never use negative letter spacing. Keep uppercase labels sparse and compact.

## 4. Component Stylings

- **Buttons:** compact rectangular controls with gently rounded 6px corners. Use icon plus text for
  explicit commands and icon-only buttons for common tools with accessible labels.
- **Tabs:** underline or quiet segmented work-mode navigation. Use tabs for owner modes such as
  Overview, Configure, Deployments, Logs, Terminal, and Diagnostics.
- **Section Navigation:** slim vertical navigation for sibling configuration panels inside a tab.
  It changes the right-side content panel and must not scroll to hash anchors.
- **Cards:** thin bordered panels only for repeated object tiles, framed tools, and empty states.
  Avoid nested cards and card-based page sections.
- **Tables:** dense, scan-friendly records with status badges, owner links, timestamps, and overflow
  action menus.
- **Inputs/Forms:** operation-shaped panels. Each form maps to one Appaloft command or query and
  keeps docs help close to fields.
- **Badges:** compact semantic state, not decoration. Use green, red, amber, blue, and neutral only
  for real workflow meaning.
- **Terminal:** dark monospace tool with a persistent header for scope, connect/disconnect,
  reconnect, copy, and session state. It is a top-level work mode or docked split, never only a
  bottom-of-page block.
- **Logs:** read-only monospace viewer with sticky controls for refresh/follow, stable columns, and
  visible masked-line styling.
- **Dialogs:** reserved for destructive confirmation, rare interruption, or advanced flows.
  Routine configuration should stay inline.

## 5. Layout Principles

- Use a persistent console shell with a sidebar shaped by `Projects -> Resources`.
- Put compact owner identity and one primary action at the top of each detail page.
- Use top-level tabs for work modes on the owner.
- Use inner section navigation for multiple configuration panels inside one work mode.
- Use dense lists and tables for operational records.
- Keep terminal, logs, and diagnostics reachable without scrolling through unrelated settings.
- Keep access URL and current health visible on the default resource overview.
- Keep destructive actions in a safety or danger-zone context.
- Align Web console categories with public docs groups: Start Here, Deploy, Projects And
  Resources, Servers And Credentials, Environments And Configuration, Access, Domains And TLS,
  Observe And Troubleshoot, Integrations, Reference, and Self-Hosting And Operations.

## 6. Stitch Prompt Defaults

When generating screens, use this prompt skeleton:

```markdown
Design an Appaloft Web console screen for [owner] doing [task].

Overall vibe: precise, dense, calm, operator-focused deployment control plane. No marketing hero,
no decorative gradients, no card-heavy metric dashboard.

DESIGN SYSTEM REQUIRED:
- Platform: Web, desktop-first, responsive.
- Palette: monochrome precision base, blue active/focus accents, semantic status colors only.
- Typography: IBM Plex Sans for UI; IBM Plex Mono for ids, commands, logs, terminal.
- Shape: 6px gently rounded controls, thin borders, shadow only for overlays.
- Layout: persistent sidebar, compact owner header, work-mode tabs, dense table/list records.

PAGE STRUCTURE:
1. Persistent console shell with Projects -> Resources sidebar.
2. Compact owner header with status and one primary action.
3. Work-mode tabs.
4. Main task panel with operation-shaped controls.
5. Docs help links beside fields or panels that need explanation.
```

## 7. Console Surface Grammar

Screens must not rely on loose horizontal divider lines to imply sections. Every major area should
use one of these named surfaces:

- owner header: identity, status, and primary action;
- operation panel: one command/query form with docs help and feedback;
- evidence panel: diagnostics, status, logs, snapshots, terminal;
- record table/list: dense comparable rows;
- empty state: one primary action and optional secondary navigation;
- danger surface: destructive action plus readiness/blocker evidence.

Use modal dialogs only for destructive confirmation or short blocking review. Use sheets for
creation/deployment workflows. Keep persistent owner settings inline as operation panels.
