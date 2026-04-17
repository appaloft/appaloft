# ADR-016: Deployment Command Surface Reset

## Status

Accepted

## Decision

Appaloft v1 keeps `deployments.create` as the only public deployment write command.

Deployment read/query and observation surfaces remain available so users and agents can inspect the result of a deployment attempt. The deployment progress stream remains a transport for observing `deployments.create`; it is not a separate business command.

The following deployment write commands are removed from the public operation surface until they are rebuilt through source-of-truth specs and implementation plans:

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
| Reset deployment write surface to create-only | Keep `deployments.create` plus read/progress/log observation; remove the rest until rebuilt from specs. | Accepted. |

## Chosen Rule

The operation catalog, API/oRPC router, CLI commands, Web console, application exports, application registrations, and tests must expose only `deployments.create` as a deployment write command.

The following are still allowed:

- `deployments.list`
- `deployments.logs`
- deployment progress stream tied to `deployments.create`
- deployment detail/read-model pages
- resource/project/server/environment/credential/variable commands required by the first deployment workflow

Future reintroduction of cancel, health check, redeploy, reattach, rollback, or equivalent operations requires a new Spec Round covering:

- command spec;
- workflow spec;
- error spec;
- event/async behavior where applicable;
- test matrix;
- implementation plan;
- Web/API/CLI entrypoint contract.

## Consequences

- Users can create and observe deployments, but cannot cancel, redeploy, rollback, reattach, or manually run deployment health checks through public commands.
- Web UI must remove buttons and panels that dispatch removed commands.
- CLI must remove top-level commands that dispatch removed deployment write commands.
- oRPC/OpenAPI must remove removed command routes and client contract members.
- Dead application command files and use-case registrations should be removed rather than left as hidden legacy behavior.
- Runtime/adapters may keep low-level backend capabilities such as cancellation or rollback support when they are internal implementation details, but those capabilities must not be exposed as public business commands until governed by specs.

## Governed Specs

- [Core Operations](../CORE_OPERATIONS.md)
- [deployments.create command spec](../commands/deployments.create.md)
- [deployments.create workflow spec](../workflows/deployments.create.md)
- [deployments.create test matrix](../testing/deployments.create-test-matrix.md)
- [Quick Deploy workflow](../workflows/quick-deploy.md)
- [Quick Deploy test matrix](../testing/quick-deploy-test-matrix.md)

## Superseded Open Questions

- Whether existing cancel, health check, redeploy, reattach, and rollback commands should remain available during the v1 resource-first rebuild.
- Whether Web/CLI should keep actions for deployment operations that have not been rebuilt through the current spec-driven process.

## Current Implementation Notes And Migration Gaps

Public operation registrations and entrypoints for removed deployment write commands are pruned from the v1 Web/API/CLI/MCP-facing surface. Existing low-level runtime backend methods, core state-machine helpers, and persisted read-model fields may remain as internal or historical capabilities until future specs reintroduce public operations.

## Open Questions

None.
