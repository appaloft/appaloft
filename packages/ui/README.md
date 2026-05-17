# @appaloft/ui

`@appaloft/ui` is the neutral Svelte primitive package for Community product surfaces.
It packages reusable design primitives and shell primitives that can be consumed by
`apps/web` and by future Appaloft interface extensions without depending on console business
objects.

## Scope

Included primitives:

- controls: `Button`, `Badge`, `Input`, `Textarea`, `Select`, `Tabs`;
- overlays and menus: `Dialog`, `Sheet`, `Popover`, `DropdownMenu`, `Tooltip`;
- layout and shell: `AppShell`, `AppShellRegion`, `Sidebar`, `Breadcrumb`, `Table`, `Card`;
- utility display pieces: `Avatar`, `Skeleton`, `Separator`, `Icon`;
- helpers: `cn`, component prop utility types, and `@appaloft/design` theme metadata.

The package intentionally does not include project, resource, deployment, provider, or
organization-specific workflows. Those stay in the consuming application layer.

## Entrypoints

Prefer subpath imports so bundlers can keep unused primitive families out of the graph:

```ts
import { Button } from "@appaloft/ui/button";
import * as DropdownMenu from "@appaloft/ui/dropdown-menu";
import { AppShellRegion } from "@appaloft/ui/app-shell";
```

The root entrypoint exposes package metadata, the most common single components, and namespace
exports for grouped primitives:

```ts
import { uiPackage, Button, DialogPrimitives } from "@appaloft/ui";
```

Compatibility re-exports remain under `apps/web/src/lib/components/ui/*` so Community pages can
migrate incrementally.

## Theme Contract

`@appaloft/ui` consumes `@appaloft/design` for product tokens, fonts, CSS entrypoints, and assets.
Consumers should import one of the design CSS entrypoints, usually:

```css
@import "@appaloft/design/styles/web.css";
```

## Extension Regions

Shell primitives are region-based. Use `AppShellRegion` names such as `header-start`,
`header-end`, `toolbar-start`, or a product-specific string to place contributed controls without
coupling the primitive package to a page workflow.

## Forbidden Dependencies

- API clients, command/query handlers, repositories, persistence, or runtime adapters.
- Private workspace package imports.
- Account/package-level workflows that are not design primitives.
- Console business components such as project pages, resource pages, deployment progress panels,
  server forms, or usage panels.
