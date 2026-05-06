# ADR-016: Deployment Command Surface Reset

## Status

Accepted

## Decision

Appaloft v1 keeps `deployments.create` as the only general deployment-attempt admission command and
allows one additional narrow preview lifecycle maintenance command:
`deployments.cleanup-preview`.

Deployment read/query and observation surfaces remain available so users and agents can inspect the
result of a deployment attempt. The deployment progress stream remains a transport for observing
`deployments.create`; it is not a separate business command.

`deployments.cleanup-preview` is not a generic cancel, rollback, redeploy, or resource-delete path.
It is the explicit cleanup boundary for preview-scoped runtime, route desired state, and source
link identity.

The following deployment write commands were removed from the public operation surface until they
were rebuilt through source-of-truth specs and implementation plans:

- `deployments.cancel`
- `deployments.check-health`
- `deployments.redeploy-resource`
- `deployments.reattach`
- `deployments.rollback`

## Context

The first deployable v1 loop is:

```text
create/select project
  -> create/select environment
  -> create/select resource
  -> create/select server and credential context
  -> deployments.create
  -> observe deployment status/progress/logs
```

Several deployment operations were implemented before the current spec-driven workflow was established. Keeping them active makes the Web, CLI, API, tests, and operation catalog harder to align because their command boundaries, state transitions, retry semantics, and UI affordances have not been revalidated against the current resource-first deployment model.

## Options Considered

| Option | Rule | Outcome |
| --- | --- | --- |
| Keep all existing deployment commands | Preserve cancel, health check, redeploy, reattach, rollback while continuing resource-first work. | Rejected because these commands were not rebuilt under the current command/event/workflow/error/test contracts. |
| Hide only Web and CLI actions | Keep API/application commands but remove visible affordances. | Rejected because hidden public operations still appear in operation catalog, oRPC contract, and tests. |
| Reset deployment write surface to create plus explicit preview cleanup | Keep `deployments.create`, add narrow `deployments.cleanup-preview`, and remove the rest until rebuilt from specs. | Accepted. |

## Chosen Rule

At reset time, the operation catalog, CLI commands, application exports, application registrations,
and tests had to expose only these deployment write commands in the v1 surface:

- `deployments.create`
- `deployments.cleanup-preview`

The following are still allowed:

- `deployments.list`
- `deployments.logs`
- deployment progress stream tied to `deployments.create`
- deployment detail/read-model pages
- resource/project/server/environment/credential/variable commands required by the first deployment workflow

Future reintroduction of cancel, health check, reattach, or equivalent operations still requires a
new Spec Round covering:

- command spec;
- workflow spec;
- error spec;
- event/async behavior where applicable;
- test matrix;
- implementation plan;
- Web/API/CLI entrypoint contract.

ADR-034 and the Phase 7 recovery specs have since reintroduced `deployments.retry`,
`deployments.redeploy`, and `deployments.rollback` as active recovery write commands. Those
commands are no longer rebuild-required because their readiness query, command specs, error
contracts, test matrix, public docs/help, operation catalog entries, CLI commands, HTTP/oRPC routes,
and Web recovery affordances are aligned.

`deployments.cleanup-preview` is allowed only as a preview-scoped explicit cleanup operation keyed
by trusted preview source identity. It must not expand into a generic deployment cancel/delete
surface without its own ADR/spec work.

## Consequences

- Users can create and observe deployments, and they can explicitly clean preview-scoped runtime
  state through `deployments.cleanup-preview`.
- Users still cannot cancel, reattach, or manually run deployment health checks through public
  commands. Retry, redeploy, and rollback are available only through their ADR-034 recovery
  boundaries.
- Web UI must remove buttons and panels that dispatch still-removed commands.
- CLI must remove top-level commands that dispatch still-removed deployment write commands.
- oRPC/OpenAPI must remove still-removed command routes and client contract members.
- Dead application command files and use-case registrations should be removed rather than left as hidden legacy behavior.
- Runtime/adapters may keep low-level backend capabilities such as cancellation or rollback support when they are internal implementation details, but those capabilities must not be exposed as public business commands until governed by specs.

## Governed Specs

- [Core Operations](../CORE_OPERATIONS.md)
- [deployments.cleanup-preview command spec](../commands/deployments.cleanup-preview.md)
- [deployments.cleanup-preview test matrix](../testing/deployments.cleanup-preview-test-matrix.md)
- [deployments.create command spec](../commands/deployments.create.md)
- [deployments.create workflow spec](../workflows/deployments.create.md)
- [deployments.create test matrix](../testing/deployments.create-test-matrix.md)
- [Deployment Recovery Readiness](../specs/012-deployment-recovery-readiness/spec.md)
- [Deployment Retry And Redeploy](../specs/040-deployment-retry-redeploy/spec.md)
- [Deployment Rollback](../specs/041-deployment-rollback/spec.md)
- [Deployment Recovery Readiness Test Matrix](../testing/deployment-recovery-readiness-test-matrix.md)
- [Quick Deploy workflow](../workflows/quick-deploy.md)
- [Quick Deploy test matrix](../testing/quick-deploy-test-matrix.md)

## Superseded Open Questions

- Whether existing cancel, health check, redeploy, reattach, and rollback commands should remain available during the v1 resource-first rebuild.
- Whether Web/CLI should keep actions for deployment operations that have not been rebuilt through the current spec-driven process.

## Current Implementation Notes And Migration Gaps

Public operation registrations and entrypoints for still-removed deployment write commands remain
pruned from the v1 Web/API/CLI/MCP-facing surface. The active deployment write surface now includes
`deployments.create`, preview-scoped `deployments.cleanup-preview`, and ADR-034 recovery commands
`deployments.retry`, `deployments.redeploy`, and `deployments.rollback`. Existing low-level runtime
backend methods, core state-machine helpers, and persisted read-model fields may remain as internal
or historical capabilities until future specs reintroduce any remaining public operations.

## Open Questions

None.
