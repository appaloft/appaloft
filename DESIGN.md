# Appaloft Design Rules

The canonical design language now lives in
[packages/design/DESIGN.md](./packages/design/DESIGN.md).

All Appaloft-owned product surfaces should import design tokens from `@appaloft/design` instead of
redefining colors, fonts, radius, shadows, or Tailwind theme variables locally.

Current consumers:

- `apps/web`: imports `@appaloft/design/styles/web.css` and remains the reference surface.
- `apps/docs`: imports `@appaloft/design/styles/docs.css` for Starlight.
- future `www`: should import `@appaloft/design/styles/www.css`.
