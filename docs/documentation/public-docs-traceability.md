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
| `server.deployment-target` | `/docs/servers/register-connect/#server-deployment-target` | `docs/workflows/deployment-target-lifecycle.md`; `docs/queries/servers.show.md`; `docs/commands/servers.rename.md`; `docs/commands/servers.configure-edge-proxy.md`; `docs/commands/servers.deactivate.md`; `docs/queries/servers.delete-check.md`; `docs/commands/servers.delete.md`; `docs/events/server-renamed.md`; `docs/events/server-edge-proxy-configured.md`; `docs/events/server-deleted.md`; `docs/errors/servers.lifecycle.md`; `docs/testing/deployment-target-lifecycle-test-matrix.md`; `docs/workflows/server-bootstrap-and-proxy.md` | Server list/detail and registration surfaces |
| `server.ssh-credential` | `/docs/servers/credentials/ssh-keys/#server-ssh-credential-path` | `docs/workflows/ssh-credential-lifecycle.md`; `docs/queries/credentials.show.md`; `docs/commands/credentials.delete-ssh.md`; `docs/commands/credentials.rotate-ssh.md`; `docs/errors/credentials.lifecycle.md`; `docs/testing/ssh-credential-lifecycle-test-matrix.md`; `docs/implementation/ssh-credential-lifecycle-plan.md`; `docs/workflows/server-bootstrap-and-proxy.md`; `docs/workflows/quick-deploy.md` | Server registration, Quick Deploy credential step, credential detail/usage surfaces, saved credential destructive delete dialog, and saved credential rotation dialog |
| `server.proxy-readiness` | `/docs/servers/operations/proxy-and-terminal/#server-proxy-readiness` | `docs/decisions/ADR-017-default-access-domain-and-proxy-routing.md`; `docs/decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md`; `docs/commands/servers.configure-edge-proxy.md`; `docs/events/server-edge-proxy-configured.md`; `docs/workflows/server-bootstrap-and-proxy.md`; `docs/testing/deployment-target-lifecycle-test-matrix.md` | `apps/web/src/routes/servers/[serverId]/+page.svelte` server edge proxy intent selector |
| `default-access.policy` | `/docs/access/generated-routes/#default-access-policy` | `docs/decisions/ADR-017-default-access-domain-and-proxy-routing.md`; `docs/commands/default-access-domain-policies.configure.md`; `docs/queries/default-access-domain-policies.show.md`; `docs/queries/default-access-domain-policies.list.md`; `docs/workflows/default-access-domain-and-proxy-routing.md`; `docs/testing/default-access-domain-and-proxy-routing-test-matrix.md`; `docs/specs/004-default-access-policy-readback/spec.md` | `apps/web/src/routes/servers/+page.svelte` system default access policy form and readback; `apps/web/src/routes/servers/[serverId]/+page.svelte` server override form and readback |
| `domain.generated-access-route` | `/docs/access/generated-routes/#access-generated-route` | `docs/decisions/ADR-017-default-access-domain-and-proxy-routing.md`; `docs/workflows/default-access-domain-and-proxy-routing.md`; `docs/testing/default-access-domain-and-proxy-routing-test-matrix.md` | `apps/web/src/routes/resources/[resourceId]/+page.svelte` access area; `apps/web/src/routes/deployments/[deploymentId]/+page.svelte` deployment access URL area |
| `environment.lifecycle` | `/docs/environments/model/#environment-lifecycle` | `docs/workflows/environment-lifecycle.md`; `docs/commands/environments.archive.md`; `docs/events/environment-archived.md`; `docs/errors/environments.lifecycle.md`; `docs/testing/environment-lifecycle-test-matrix.md` | Project detail environment lifecycle action |
| `environment.variable-precedence` | `/docs/environments/variables/precedence/#environment-variable-precedence` | `docs/queries/environments.effective-precedence.md`; `docs/testing/environment-effective-precedence-test-matrix.md`; `docs/queries/resources.effective-config.md`; `docs/testing/resource-profile-lifecycle-test-matrix.md` | Resource detail effective configuration surface; CLI/API environment effective-precedence query |

## Maintenance Rules

- Add a row when a public topic explains a behavior with a governing ADR, command, workflow, error,
  or testing spec.
- Keep public pages user-facing; put internal file relationships here or in the docs registry.
- When a Web `?` target changes, update the registry topic, this file, and the relevant
  `PUB-DOCS-003` or `PUB-DOCS-010` test expectation in the same change.
