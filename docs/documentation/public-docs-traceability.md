# Public Docs Traceability

> GOVERNING DOCUMENT
>
> This file records how public docs topics connect to internal behavior specs and product surfaces.
> Public pages remain task-oriented; this file is the maintainer-facing relationship map.

## Purpose

Each row answers:

- which public docs page and stable anchor explains the behavior;
- which internal spec files govern that behavior;
- which Web surface links users to that anchor.

The machine-readable source for topic ids, anchors, spec references, and Web surfaces is
`packages/docs-registry/src/index.ts`.

## Initial Traceability Rows

| Public topic | Public page and anchor | Governing specs | Web surface |
| --- | --- | --- | --- |
| `project.lifecycle` | `/docs/resources/projects/#project-lifecycle` | `docs/workflows/project-lifecycle.md`; `docs/queries/projects.show.md`; `docs/commands/projects.rename.md`; `docs/commands/projects.archive.md`; `docs/errors/projects.lifecycle.md`; `docs/testing/project-lifecycle-test-matrix.md` | Project detail/settings surfaces |
| `server.deployment-target` | `/docs/servers/register-connect/#server-deployment-target` | `docs/workflows/deployment-target-lifecycle.md`; `docs/queries/servers.show.md`; `docs/commands/servers.rename.md`; `docs/commands/servers.deactivate.md`; `docs/queries/servers.delete-check.md`; `docs/commands/servers.delete.md`; `docs/events/server-renamed.md`; `docs/events/server-deleted.md`; `docs/errors/servers.lifecycle.md`; `docs/testing/deployment-target-lifecycle-test-matrix.md`; `docs/workflows/server-bootstrap-and-proxy.md` | Server list/detail and registration surfaces |
| `default-access.policy` | `/docs/access/generated-routes/#default-access-policy` | `docs/decisions/ADR-017-default-access-domain-and-proxy-routing.md`; `docs/commands/default-access-domain-policies.configure.md`; `docs/workflows/default-access-domain-and-proxy-routing.md`; `docs/testing/default-access-domain-and-proxy-routing-test-matrix.md` | `apps/web/src/routes/servers/+page.svelte` system default access policy form; `apps/web/src/routes/servers/[serverId]/+page.svelte` server override form |
| `domain.generated-access-route` | `/docs/access/generated-routes/#access-generated-route` | `docs/decisions/ADR-017-default-access-domain-and-proxy-routing.md`; `docs/workflows/default-access-domain-and-proxy-routing.md`; `docs/testing/default-access-domain-and-proxy-routing-test-matrix.md` | `apps/web/src/routes/resources/[resourceId]/+page.svelte` access area; `apps/web/src/routes/deployments/[deploymentId]/+page.svelte` deployment access URL area |

## Maintenance Rules

- Add a row when a public topic explains a behavior with a governing ADR, command, workflow, error,
  or testing spec.
- Keep public pages user-facing; put internal file relationships here or in the docs registry.
- When a Web `?` target changes, update the registry topic, this file, and the relevant
  `PUB-DOCS-003` or `PUB-DOCS-010` test expectation in the same change.
