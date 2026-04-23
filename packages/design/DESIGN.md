# Appaloft Design Language

## Status

This package is the canonical design language source for Appaloft product surfaces.

Consumers:

- `apps/web`: product console and reference implementation.
- `apps/docs`: public documentation, styled to match the console instead of a separate marketing site.
- future `www`: product website, expected to import the same tokens and intentionally layer marketing composition on top.

## Package Entrypoints

- `@appaloft/design`: typed product identity and package metadata.
- `@appaloft/design/styles/web.css`: Web console fonts, tokens, Tailwind v4 theme mapping, and base layer.
- `@appaloft/design/styles/docs.css`: Starlight-compatible documentation theme derived from Web tokens.
- `@appaloft/design/styles/www.css`: future website entrypoint using the same fonts, tokens, and Tailwind theme.
- `@appaloft/design/styles/tokens.css`: raw CSS custom properties.
- `@appaloft/design/styles/tailwind.css`: Tailwind v4 `@theme inline` mapping.

## Product Model

Appaloft is a deployment operations console. The design must keep the domain order visible:

```text
Project -> Environment -> Resource -> Deployment
```

Project pages are resource collection pages. Resource pages own deployment history, deployment
actions, runtime logs, proxy configuration, and domain/TLS actions. Deployment pages are execution
attempt pages.

## Visual Direction

- Use a monochrome precision base: white/near-black surfaces, narrow gray scales, and visible structure.
- Use blue only for focus, links, and active affordances.
- Use semantic color only for workflow and status meaning:
  - green: succeeded/ready;
  - red: failed/not ready;
  - amber: warning or delayed readiness;
  - blue: running/planning/focus;
  - neutral gray: no deployment or unknown.
- Use shadow-as-border for major surfaces instead of decorative heavy shadows.
- Prefer list/table density over card grids when objects are operational records.
- Do not use decorative banners, gradient blobs, marketing copy, or unrelated metrics in the console.

## Typography

- UI/body: IBM Plex Sans.
- Code, ids, ports, commands, and logs: IBM Plex Mono.
- Product wordmark and rare editorial headings: Fraunces.
- Avoid Inter/Roboto/system-only stacks for Appaloft-owned surfaces.
- Technical labels, ids, ports, and command text must use monospace.

## Component Rules

- Base primitives should come from the existing shadcn-svelte implementation when available.
- Component styling belongs in Tailwind utility classes.
- Global CSS is limited to design tokens, Tailwind theme mapping, base typography, and framework adapters.
- Buttons use direct verbs and the shared radius tokens.
- Cards frame real repeated items or functional panels; avoid cards inside cards.
- Status badges use semantic colors and stay compact.
- Text must remain stable and truncated where object names can be long.

## Surface Rules

### Web

Web is the reference implementation. Token changes start from Web usage and then flow into Docs and
future www.

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
