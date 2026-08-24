---
name: appaloft-dashboard-design
description: Design, implement, or review the public Appaloft Dashboard (`apps/dashboard`) under the contextual navigation and `dashboard-v2` visual contract. Use for Dashboard routes, shells, components, responsive behavior, theme tokens, pattern-gallery work, or Dashboard visual QA; do not use it as authority for legacy `apps/web` styling.
---

# Appaloft Dashboard Design

Build a calm infrastructure workspace whose navigation scope matches the object the operator is
working on. This skill governs `apps/dashboard`; it does not restyle or preserve legacy Web.

## Sources of Truth

Read these before changing a Dashboard surface:

1. `packages/design/DESIGN.md` for canonical product tokens and component rules.
2. `docs/decisions/ADR-126-contextual-dashboard-and-web-route-boundary.md` for migration and route
   boundaries.
3. `docs/specs/147-contextual-dashboard-app/spec.md` for actor-visible outcomes and performance
   budgets.
4. `docs/testing/contextual-dashboard-test-matrix.md` for the affected acceptance ids.

If these disagree, stop and sync the higher-authority artifact before inventing a local exception.

## Decisions That Must Stay Intact

- `/` resolves to `/projects`; there is no Home destination.
- Workspace product navigation is exactly Projects, Infrastructure, Activity, Marketplace, and
  Settings. Utilities such as Account, Help, and Agent do not become product destinations.
- Entering a Project replaces Workspace navigation with Overview, Deployments, Observability, and
  Settings plus a clear return to Projects.
- Resource state uses one canonical URL. Wide screens may show a Project-owned panel; narrow screens
  show the same route as a full page.
- Route state, query ownership, and visible context must agree. Do not restore legacy route aliases
  or read broad collections in Svelte to reconstruct page truth.

## Visual Contract

- Import `@appaloft/design/styles/dashboard.css` and set `data-console-preset="dashboard-v2"`.
- Use `@appaloft/ui` primitives and semantic Tailwind roles. Do not import `apps/web`, copy private
  UI, or add raw palette values inside app components.
- Keep a 4px spacing base with 24-32px section rhythm and 20-24px card insets. Normal controls are
  40px high; controls use 10px radius, cards 14-16px, and panels 16-18px.
- Use Appaloft blue only for primary action, focus, selection, links, and running/planning state.
  Healthy, warning, and failure colors communicate real status and always include a label or icon.
- Ordinary surfaces use fill, border, and spacing without shadow. Only overlays and route-backed
  panels use `--shadow-overlay`.
- Light uses a near-white neutral canvas. Dark must be complete warm charcoal, not navy chrome or a
  partial token inversion. Do not add gradients, black primary actions, ornamental glass, or pills
  for ordinary navigation.
- All product copy goes through `@appaloft/i18n`; mono is reserved for ids, commands, ports, logs,
  and other machine values.

## Implementation Loop

1. Name the affected test-matrix ids and owner scope before editing.
2. Put route parsing/serialization in `apps/dashboard/src/lib/navigation.ts`, not in components.
3. Reuse public primitives by subpath import; add a neutral public primitive only when the package
   genuinely lacks one.
4. Add the state to `/patterns` when it introduces or changes a reusable visual rule.
5. Run:

   ```bash
   bun test apps/dashboard/test/foundation.test.ts \
     apps/dashboard/src/lib/navigation.test.ts \
     apps/dashboard/test/design-governance.test.ts
   bun run --cwd apps/dashboard check
   bun run --cwd apps/dashboard build
   ```

6. Verify Light and Dark at a desktop width and one mobile width. Check keyboard focus, reduced
   motion, route reconstruction, and horizontal overflow. A build without browser inspection is not
   visual acceptance.

Keep Topology disabled until the 10/50/100 benchmark passes. Do not call a static placeholder a
usable destination or treat preview fixture data as real control-plane evidence.
