# PaaS UI Redesign Style Contract

## Progress Log

- Phase 0 started: read `DESIGN.md` and the canonical `packages/design/DESIGN.md`.
- Phase 0 completed: locked the implementation contract for the PaaS console redesign.
- Feedback pass: replaced the warm/yellow and black-primary direction with a logo-blue, cool-white
  system inspired by Stripe's compact product rhythm without copying Stripe's purple identity.
- Feedback pass: lifted the canvas from gray-blue to near-white and removed red/pink from
  non-error secondary states in the deploy flow.
- Feedback pass: tightened deploy surfaces so list wells, review cards, and the side summary use
  white owner panels plus soft Appaloft-blue tints instead of gray-blue nested blocks.
- Feedback pass: moved the main canvas to white and made deploy stepper states explicit so non-error
  steps cannot inherit red or pink fills.

## Visual Direction Summary

Appaloft's intended product direction is a precise, calm, dense deployment-operations workspace. The
console should feel like a reliable control plane for real infrastructure work: project, environment,
resource, deployment, server, health, access, logs, diagnostics, and terminal state should be easy to
scan without turning the UI into a noisy monitoring wall.

The design language is operational and restrained. It uses IBM Plex Sans for product UI, IBM Plex Mono
only for technical values, Fraunces only for rare product identity moments, cool-white product
surfaces, compact rectangular controls, dense tables, semantic status badges, named console surfaces, and
minimal depth. The interface should feel designed through hierarchy, spacing, copy, and state clarity,
not through decorative gradients, heavy shadows, or default component styling.

The generic UI design-system search produced a bright indigo/emerald, playful block-based direction.
That conflicts with Appaloft's canonical design language, so the repository design contract governs
this redesign.

## 1. What This UI Should Feel Like

- A serious infrastructure control plane for deployment operators.
- Calm, precise, trustworthy, lightly branded, and product-grade.
- Dense enough for frequent use, but not cramped.
- Opinionated through clear resource hierarchy, stable navigation, compact status language, and
  strong operational feedback.
- Human and readable, with direct copy that names real product objects and operations.

## 2. What It Must Avoid

- Default shadcn/ui appearance, generic admin templates, and component-gallery composition.
- Cyberpunk, terminal-first, neon, crypto, gaming, or glassmorphism-heavy styling.
- Marketing-page hero composition inside the console.
- Card soup, nested bordered boxes, and every section competing for equal importance.
- Modal-heavy creation/configuration flows.
- Spinner-only deployment, DNS, TLS, or server operations.
- Decorative gradients, rainbow status color, and accent color used as filler.
- Warm yellow/sand canvases, heavy gray-blue canvases, deep navy-heavy chrome, black primary
  buttons, and red/pink secondary accents outside error or danger states.

## 3. Allowed Visual Patterns

- Persistent sidebar navigation and clear app shell regions.
- Strong page and resource headers with primary action placement.
- Stable tabs for sibling resource sections.
- Dense operational tables with compact badges, metadata, row actions, skeleton rows, and useful empty
  states.
- Cards for summaries, resource type choices, overview panels, repeated tiles, and empty states.
- Drawers for contextual inspection and lightweight edits.
- Full pages or wizards for complex creation, server connection, domain/TLS, and deployment setup.
- Named console surfaces: `console-panel`, `console-subtle-panel`, `console-side-panel`,
  `console-record-list`, `console-record-row`, and `console-metric-strip`.
- One quiet 1px border strength across inputs, display rows, panels, metric strips, and side summaries;
  hierarchy comes from layout and typography, not mismatched border darkness.
- Subtle dividers, surface contrast, restrained shadows only for layered UI such as drawers, popovers,
  dropdowns, modals, and floating bars.

## 4. Forbidden Visual Patterns

- Redefining Appaloft colors, typography, radius, shadows, or Tailwind theme variables locally.
- Inter, Roboto, Space Grotesk, Doto, Space Mono, or system-only stacks for Appaloft-owned UI.
- Negative letter spacing.
- Global CSS for component-specific styling beyond tokens, theme mapping, base typography, or framework
  adapters.
- Raw `bg-background` blocks and loose borders as the main ownership model.
- Pale inset-shadow borders or locally darkened input borders that make nested cards and controls look
  like different products.
- Icon-only destructive actions.
- Green-on-black hacker log treatment or decorative prompt chrome.
- Vague status labels like "Good" or "OK" when the actual infrastructure state is known.

## 5. How To Prevent Default shadcn Look

- Use `@appaloft/ui` and shadcn primitives as behavior/accessibility foundations, then compose Appaloft
  product blocks around real PaaS objects.
- Centralize page rhythm and surface grammar in reusable console blocks instead of styling each shadcn
  card/button/table directly on pages.
- Prefer typography, grouping, object metadata, and state badges over default bordered-card layouts.
- Keep buttons compact with 6px corners and use one obvious primary action per section.
- Replace generic centered loaders, empty text, and toast-only errors with designed skeletons, empty
  panels, inline recovery panels, and operation timelines.
- Use the canonical design tokens from `@appaloft/design/styles/web.css`.

## 6. Restrained Brand Personality

- Express brand through operational order, logo-aligned Appaloft blue, crisp typography, compact
  status semantics, and direct product copy.
- Use Appaloft blue sparingly for primary actions, active navigation, links, selected state, and
  running/planning work.
- Use semantic green, amber, and red only for real status meaning.
- Use Appaloft's wordmark/editorial font only in rare identity moments, not as dashboard decoration.
- Let icons clarify resource type, navigation, status, and action meaning without becoming ornament.

## 7. State Treatment Contract

- Loading states use skeletons shaped like the final page, table, header, form, or timeline.
- Empty states include a clear title, short explanation, primary next action, optional secondary action,
  and a subtle product-specific visual structure.
- Error states are recoverable: plain-language explanation, affected scope, retry action, and logs or
  diagnostics link when useful.
- Long-running operations show current step, timeline, timestamps, status labels, partial data, logs,
  and retry/cancel actions where the domain supports them.
- Success states confirm the completed operation without hiding the next likely action.
- Permission or partial-data states should preserve accessible known data and explain what is withheld
  or unavailable.
