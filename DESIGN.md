# Yundu Console Design Rules

## Source Inspiration

Yundu's console design is adapted from the Vercel-inspired DESIGN.md in
`VoltAgent/awesome-design-md`:

- collection: <https://github.com/VoltAgent/awesome-design-md>
- selected inspiration: <https://getdesign.md/vercel/design-md>

The useful principle is not the brand look itself; it is the product discipline: deployment
infrastructure should feel precise, quiet, and strongly hierarchical.

## Product Model

Yundu is a tool console for deployment operations. The UI must keep the domain order visible:

```text
Project -> Environment -> Resource -> Deployment
```

Project pages are resource collection pages. Resource pages own deployment history, deployment
actions, runtime logs, proxy configuration, and domain/TLS actions. Deployment pages are execution
attempt pages.

## Visual Direction

- Use a monochrome precision base: white/near-black surfaces, narrow gray scales, and visible
  structure.
- Use color only for workflow and status meaning:
  - green: succeeded/ready;
  - red: failed/not ready;
  - blue: running/planning/focus;
  - neutral gray: no deployment or unknown.
- Use shadow-as-border for major surfaces instead of decorative heavy shadows.
- Prefer list/table density over card grids when objects are operational records.
- Do not use decorative banners, hero sections, gradient blobs, marketing copy, or unrelated
  metrics in the console.

## Navigation Rules

- Left navigation shows global sections first, then `Project -> Resource` hierarchy.
- Project children in the sidebar are resources, not deployments.
- Resource rows and sidebar children display latest deployment status as read-model/projection
  information.
- Every detail page has breadcrumbs. When possible, routes include the full ownership context:
  `/projects/:projectId/environments/:environmentId/resources/:resourceId/deployments/:deploymentId`.
- Legacy short routes may exist for compatibility, but new links should use ownership routes.

## Page Structure

- Project detail:
  - identity and summary;
  - primary resource list;
  - create resource button;
  - secondary environment, access, and deployment rollups.
- Resource detail:
  - profile summary and latest status;
  - full-width URL-backed horizontal tabs for deployments, access, runtime logs, and settings;
  - no public redeploy action until the operation is reintroduced by spec.
- Deployment detail:
  - status and ownership context first;
  - logs and progress are primary;
  - plan, execution, snapshot, and metadata are secondary tabbed/expandable content.
- Create flows:
  - creation is opened by a button or dedicated route, not embedded as a permanent form inside
    list pages.

## Component Rules

- Base primitives must be shadcn-svelte components when the project has that primitive available,
  including breadcrumb, button, select, tabs, skeleton, input, textarea, and badge.
- Component styling belongs in Tailwind utility classes. Add global CSS only for design tokens,
  shadcn/base integration, or cases Tailwind cannot express.
- Repeated status visuals must be Svelte components or snippets keyed by status, not exported
  `*Class()` helper functions or global `data-status` CSS.
- Buttons use 6px radius and direct verbs.
- Cards use at most 8px radius and only frame real repeated items or functional panels.
- Avoid cards inside cards.
- Status badges must use semantic colors and should stay compact.
- Technical labels, ids, ports, and command text use monospace.
- Text must remain stable and truncated where object names can be long.

## Copy Rules

- Copy names the product object or operation directly.
- Avoid explaining the UI itself.
- Avoid marketing language.
- User-facing text in `apps/web` must go through `packages/i18n`.
