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
- `@appaloft/ui`: Community Svelte design primitives and shell primitives built on these tokens.
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

- Console canvas: `oklch(1 0 0)` for page background and main workspace surface.
- Console ink: `oklch(0.205 0 0)` for primary text, primary action fill, and active tab text.
- Subtle surface: `oklch(0.985 0 0)` for sidebars, empty states, low-emphasis tool surfaces, and
  row hover background.
- Quiet border: `oklch(0.922 0 0)` for panel boundaries, table rows, input borders, and dividers.
- Focus blue: `oklch(0.57 0.19 255)` for focus rings, links, active navigation accents, and
  running/planning status.
- Ready green: `oklch(0.58 0.18 145)` for healthy, ready, succeeded, or configured-positive
  states.
- Failure red: `oklch(0.61 0.21 27)` for failed, unhealthy, destructive, or unsafe actions.
- Warning amber: `oklch(0.66 0.16 75)` for delayed readiness, warnings, or pending verification.
- Muted text: `oklch(0.45 0 0)` for secondary labels, timestamps, descriptions, and placeholders.

Avoid gradient backgrounds in the console. Depth comes from spacing, borders, typography, and
restrained shadows. Semantic colors are only for real workflow meaning.

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
- Buttons are compact rectangular controls with gently rounded 6px corners.
- Cards frame repeated object tiles, framed tools, and empty states. Avoid nested cards.
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
- `console-metric-strip`: compact related counters.
- danger surface: destructive action plus readiness or blocker evidence.

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
