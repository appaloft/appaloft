# ADR-011: Resource Create Minimum Lifecycle

Status: Accepted

Date: 2026-04-14

## Decision

`resources.create` is the first explicit write command for creating a durable deployable `Resource` inside a project and environment.

The minimum lifecycle for this command is synchronous resource configuration creation:

```text
resources.create
  -> persist Resource
  -> publish or record resource-created
  -> return ok({ id })
```

Command success means the resource aggregate has been created and can be referenced by later commands. It does not mean a deployment exists, source binding is configured, environment variables are set, a domain is bound, or the resource is healthy.

The minimum command owns only profile-level resource data:

- project ownership;
- environment ownership;
- optional default destination reference;
- name and slug;
- resource kind;
- optional description;
- optional declared services for compose-stack or service-aware resources.

Durable source binding, build configuration, runtime configuration, domain/TLS configuration, health policy, storage, auto-deploy, webhook policy, and archive/update lifecycle are future explicit operations. They must not be hidden inside the minimum `resources.create` command.

## Context

The domain model treats `Resource` as the deployable unit inside a project environment. Deployments belong to a resource, not directly to a raw source locator.

Quick Deploy needs a way to create a resource before dispatching `deployments.create`.

Keeping resource creation hidden inside deployment admission makes Quick Deploy harder to reason about and prevents the Web/API/CLI from managing resource configuration as a first-class business object.

## Options Considered

### Option A: Keep Resource Creation Inside `deployments.create`

This keeps `deployments.create.resource` as the only create path.

This option is rejected as the long-term rule because it makes resource lifecycle dependent on deployment admission and prevents resource detail/configuration flows from becoming first-class.

### Option B: Add Minimal `resources.create` For Resource Profile Creation

This introduces an explicit command that creates the resource aggregate and returns a stable id. Quick Deploy and API/CLI callers can then pass `resourceId` to `deployments.create`.

This option is accepted.

### Option C: Add Full Resource Configuration In One Command

This would include source binding, build config, runtime config, health policy, domains, storage, env vars, and auto-deploy policy in one command.

This option is rejected for the first slice because it mixes multiple future lifecycle decisions into the create command and would block the v1 Quick Deploy path on broader resource-management design.

## Chosen Rule

The first `resources.create` command must create only the durable resource profile.

Required input:

- `projectId`;
- `environmentId`;
- `name`.

Optional input:

- `kind`, defaulting to `application`;
- `description`;
- `destinationId`;
- `services`, with multi-service declarations allowed only for `compose-stack`.

The command must reject duplicate resource slugs within the same `(projectId, environmentId)` scope.

Quick Deploy must prefer this sequence once `resources.create` is implemented:

```text
resources.create
  -> deployments.create(resourceId)
```

`deployments.create.resource` remains a compatibility path until Quick Deploy and all callers that create resources during deployment have migrated to explicit resource creation.

## Consequences

Resource configuration becomes a first-class business capability without forcing a full resource-management system in the same slice.

Quick Deploy can stop creating resources through deployment admission while keeping the final deployment command unchanged.

The Web resource detail page can become the owner-scoped management surface for domains, deployments, variables, and future resource configuration.

Source binding and deployment remain separate:

- `resources.create` creates the deployable unit;
- `deployments.create` creates an execution attempt for a source/runtime plan;
- future resource source/config commands persist reusable source/build/runtime policy.

## Governed Specs

- [resources.create Command Spec](../commands/resources.create.md)
- [resource-created Event Spec](../events/resource-created.md)
- [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md)
- [Resource Create And First Deploy Workflow Spec](../workflows/resources.create-and-first-deploy.md)
- [resources.create Test Matrix](../testing/resources.create-test-matrix.md)
- [resources.create Implementation Plan](../implementation/resources.create-plan.md)
- [Quick Deploy Workflow Spec](../workflows/quick-deploy.md)
- [ADR-010: Quick Deploy Workflow Boundary](./ADR-010-quick-deploy-workflow-boundary.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Domain Model](../DOMAIN_MODEL.md)

## Implementation Requirements

`resources.create` must be added as a command operation with a command schema, command message, handler, use case, operation catalog entry, API/oRPC route, CLI command, Web entrypoint, read-model visibility, and tests when Code Round is in scope.

The application use case must:

1. validate input;
2. resolve project and environment;
3. ensure the environment belongs to the project;
4. optionally resolve destination and ensure it is compatible with the intended placement rules;
5. derive the resource slug from the resource name;
6. reject duplicate resource slug within the project/environment scope;
7. create the `Resource` aggregate;
8. persist through `ResourceRepository`;
9. publish or record `resource-created`;
10. return `ok({ id })`.

The use case must not:

- create a deployment;
- configure source binding;
- create domain bindings or certificates;
- set environment variables;
- mutate deployment target/server state;
- hide Quick Deploy draft logic inside the command handler;
- call persistence or transport logic from the command handler.

## Superseded Open Questions

- Should Quick Deploy continue to create resources through `deployments.create.resource` or move to explicit `resources.create`?
- Should the first resource command include the full resource source/build/runtime configuration surface?

## Current Implementation Notes And Migration Gaps

Current code has a `Resource` aggregate, `ResourceRepository`, `ResourceReadModel`, PostgreSQL/PGlite resource persistence, and `resources.list`.

Current deployment config/default bootstrap can resolve or create resources internally during deployment admission.

Current Web QuickDeploy and CLI interactive deploy can pass a `resource` bootstrap object to `deployments.create`.

`resources.create` command/schema/handler/use case, operation catalog entry, API/oRPC route, CLI create command, Web project-page create affordance, Quick Deploy new-resource explicit call path, CLI interactive deploy explicit call path, and command-level use-case tests are implemented.

Additional transport/UI behavior tests remain pending.

## Open Questions

- None for the minimum lifecycle.
