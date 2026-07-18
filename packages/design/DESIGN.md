# Appaloft Design Language

## Status

This package is the only canonical design language source for Appaloft product surfaces.

Other `DESIGN.md` files in the repository may exist only as pointers to this file. They must not
define separate palettes, typography, spacing, surface grammar, or component rules.

Consumers:

- `apps/web`: product console and reference implementation.
- `apps/docs`: public documentation, styled to match the console.
- future `www`: product website, expected to import the same tokens and intentionally layer
  marketing composition on top.

## Package Entrypoints

- `@appaloft/design`: typed product identity and package metadata.
- `@appaloft/design`: also exports `appaloftPortableDesignTokens` for non-CSS renderers such as
  email templates that need Appaloft color, radius, shadow, and font tokens as plain values.
- `@appaloft/ui`: Community Svelte design primitives and shell primitives built on these tokens.
- `@appaloft/ui/theme`: also exports `appaloftPortableTailwindTheme` and
  `createAppaloftPortableTailwindConfig` so non-DOM renderers can reuse the canonical Appaloft token
  mapping while supplying their own renderer preset.
- `@appaloft/design/styles/web.css`: Web console fonts, tokens, Tailwind v4 theme mapping, and
  base layer.
- `@appaloft/design/styles/docs.css`: documentation theme derived from Web tokens.
- `@appaloft/design/styles/www.css`: future website entrypoint using the same fonts, tokens, and
  theme.
- `@appaloft/design/styles/tokens.css`: raw CSS custom properties.
- `@appaloft/design/styles/tailwind.css`: Tailwind v4 `@theme inline` mapping.
- `@appaloft/design/assets/*`: canonical Appaloft logo and icon SVG assets.

## Product Model

Appaloft is a precise, calm, dense deployment-operations workspace. It should feel like a reliable
control plane for real application deployments, not a generic SaaS dashboard and not a marketing
site.

The console must keep the product's operational order visible:

```text
Project -> Environment -> Resource -> Deployment
Deployment Target / Server -> Credential -> Destination
Resource -> Access -> Health -> Logs -> Diagnostics -> Terminal
```

## Color Roles

- Console canvas: cool structural gray `#f4f7fb` for the workspace outside object panels. It must
  stay neutral and low-chroma rather than reading as blue decoration, heavy gray-blue, cream, sand,
  beige, or yellow.
- Console panel: `#ffffff` for object panels, tables, sheets, popovers, and form surfaces.
- Console ink: `#152238` for primary text and active tab text. Do not use pure black as the brand
  fill for primary actions.
- Appaloft blue: `#4e84ff`, taken from the canonical logo asset, for primary actions, selected
  states, links, focus rings, and running/planning status. Use it sparingly.
- Appaloft soft blue: `#e8f0ff` and `#edf2f8` for selected row, subtle callout, and low-emphasis
  CTA backgrounds.
- Quiet border: `#c9d4e3` for panel boundaries, table rows, and dividers.
- Input hairline: `#b5c3d6` for form controls so fields remain more visible than passive panels.
- Sidebar rail: `#eef3f8` with `#c2cede` separation. Active navigation keeps the soft-blue row tint
  and adds a 2px Appaloft-blue inset rail so location remains legible without pill navigation. The
  collapsed icon rail uses a compact Appaloft-blue active square with white ink.
- Ready green: `oklch(0.58 0.18 145)` for healthy, ready, succeeded, or configured-positive
  states.
- Failure red: `oklch(0.61 0.21 27)` for failed, unhealthy, destructive, or unsafe actions. Empty,
  unavailable, unconfigured, and not-yet-created states stay on neutral card or muted surfaces.
- Warning amber: `oklch(0.66 0.16 75)` for delayed readiness, warnings, or pending verification.
- Muted text: `#64748d` for secondary labels, timestamps, descriptions, and placeholders.

Avoid gradient backgrounds in the console. Depth comes from spacing, borders, typography, and
restrained shadows. Semantic colors are only for real workflow meaning; absence or missing setup is
neutral until it represents a real failure or blocker. Avoid warm yellow canvases,
deep navy-heavy chrome, black primary buttons, and generic shadcn neutral gray as the product
identity.

## Typography

- UI/body: IBM Plex Sans.
- Code, ids, ports, commands, logs, route fragments, and masked configuration values: IBM Plex Mono.
- Product wordmark and rare editorial headings: Fraunces.
- Avoid Inter, Roboto, Space Grotesk, Doto, Space Mono, or system-only stacks for Appaloft-owned
  surfaces.
- Never use negative letter spacing. Keep uppercase labels sparse and compact.

## Component Rules

- Base primitives should come from `@appaloft/ui` when available.
- `@appaloft/ui` owns neutral controls, overlays, form controls, app-shell regions, icon wrappers,
  and shell primitives. App-specific project, resource, deployment, organization, provider, and
  operational workflow components stay in the consuming app.
- Shell regions should support contributed header, dropdown, toolbar, and sidebar content without
  naming a page workflow in the primitive package.
- Prefer package subpath imports such as `@appaloft/ui/button` and `@appaloft/ui/dialog` for
  tree-shaking-friendly consumers.
- Component styling belongs in Tailwind utility classes.
- Global CSS is limited to design tokens, Tailwind theme mapping, base typography, and framework
  adapters.
- Buttons are compact rectangular controls with 2px corners. Default product buttons
  are 32px tall on desktop, use Appaloft blue for the single primary action, and avoid oversized
  pills.
- Panels and overlays use 4px corners. Large card-like 12-16px rounding is not part of the console
  grammar; full pills are reserved for badges, compact status, and intentionally pill-shaped input.
- Form controls are 32px tall by default, with a consistent 4px label-to-control gap and visible
  input hairlines.
- Default console borders use a quiet 1px hairline for primary panels, secondary panels, metric
  strips, and data display rows. Inputs use the stronger input hairline. Show hierarchy with spacing,
  typography, surface tint, and a crisp 1px directional shadow; reserve primary color for hover,
  focus, selected, warning, and destructive states.
- Cards frame repeated object tiles, framed tools, and empty states. Avoid nested cards.
- Product illustrations use human-centered workplace scenes: an operator at a workstation, reviewing a deployment graph, or maintaining server infrastructure. Keep the line work calm and sparse, with neutral ink, white space, and a restrained Appaloft blue accent. Avoid text inside artwork, fake UI screenshots, logos, watermarks, ornamental gradients, and isolated oversized resource icons.
- Collection empty states may map several resource tones to a small neutral illustration set. The illustration is decorative context, never the only explanation: preserve the semantic title, description, and primary action, use an empty `alt`, and keep the artwork responsive without page overflow.
- Overview pages must not place variable-height primary content beside a vertical stack of summary
  cards when that stack would delay the next full-width section. Keep equal-role summaries in their
  own responsive grid: stretch cards to the shared desktop row, then let them return to natural
  content height when stacked on narrow screens. Do not hard-code a shared total card height to
  create visual alignment.
- Tables are dense, scan-friendly records with status badges, owner links, timestamps, and action
  affordances.
- Status badges use semantic colors and stay compact.
- Text must remain stable and truncated where object names can be long.

## Console Surface Grammar

Screens must not rely on loose borders or raw `bg-background` blocks to imply ownership. Every major
area uses one named surface:

- `console-panel`: one command/query form, evidence panel, terminal panel, or framed tool.
- `console-subtle-panel`: low-emphasis status, empty state, helper, or result block inside a larger
  owner surface.
- `console-side-panel`: secondary owner-side context such as environment or public access summaries.
- `console-record-list` and `console-record-row`: repeated operational records.
- Selectable object choices such as repositories, projects, servers, environments, and credentials
  use Tailwind utilities at the consuming component: white `bg-card` row surface, soft Appaloft blue
  `hover:bg-primary/5`, and blue border/tint selected state. Do not use failure red, pink, rose, or
  destructive tints for normal selectable rows.
- `console-metric-strip`: compact related counters.
- danger surface: destructive action plus readiness or blocker evidence.

Blueprint detail pages follow one operator path: product summary and compact footprint, deployment
choice and upgrade implications, the topology Appaloft will create, then configuration requirements.
Do not repeat external links, plan summaries, or equal-weight count cards across the page. Keep one
deploy action summary near the decision area, and use record lists rather than nested cards for
topology and configuration detail.

`console-subtle-panel` must use the same border strength as inputs and other console containers. Do
not use pale inset-shadow borders for data rows inside panels because they make the product feel like
multiple visual systems.

Use modal dialogs only for destructive confirmation or short blocking review. Routine configuration
stays inline.

## Surface Rules

### Web

Web is the reference implementation. Token changes start from Web usage and then flow into Docs and
future www.

Web console information architecture and interaction grammar are governed by
[`docs/implementation/web-console-redesign-plan.md`](../../docs/implementation/web-console-redesign-plan.md).
Use that document before adding new owner pages, tabs, cards, terminal surfaces, operational lists,
or configuration panels.

### Docs

Docs must look like the product manual for the console, not a separate marketing site. Docs may use
Starlight structure, but typography, accent color, surface contrast, and diagrams must derive from
`@appaloft/design`.

### www

The future website may be more expressive, but it must still import the same tokens and fonts. It
may add composition layers, not redefine product colors or typography.

## Copy Rules

- Copy names the product object or operation directly.
- Avoid explaining the UI itself.
- Avoid marketing language inside the console.
- User-facing text in `apps/web` must go through `packages/i18n`.
