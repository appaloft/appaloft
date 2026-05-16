# Operation Guard Extension Point

Appaloft exposes operation checks as a neutral application-layer guard port. The guard evaluates a command or query by operation catalog key and returns a standard allow/deny decision with check results, a reason, and optional details for tests, logs, and adapters.

The public implementation does not depend on a specific policy engine or commercial policy source. Community runtime registers a compatibility implementation that preserves existing self-hosted behavior. Hosted or private distributions can replace the guard through server composition or another documented extension boundary.

This guard is separate from transport/session access metadata. The operation catalog may describe whether a route needs a product session before dispatch; that metadata preserves existing transport behavior and is not a policy engine contract.

## Request Shape

An operation check request carries:

- operation key and operation name from the operation catalog;
- command/query kind;
- actor and principal when an authenticated session is present;
- organization id when known;
- resource references such as project, environment, resource, and server ids;
- action name derived from the operation;
- context attributes for entrypoint, request id, route, and test diagnostics.

Project-scoped checks should use the public project ownership read model instead of duplicating project or organization data. Organization, team, member, and role information comes from the existing Appaloft identity and organization ports.

## Boundary Rules

- Operation checks run at the application command/query boundary, not only in HTTP middleware.
- The guard is operation-level and policy-engine-neutral.
- Individual checks are composable. A deployment can register authorization, entitlement, quota, or validation checks behind the same public result shape.
- Public Appaloft must not import private distribution packages.
- The existing `ProductOrganizationRole` compatibility role may remain, but execution context preserves the full organization team role: `owner`, `admin`, `billing`, `developer`, or `viewer`.
- Community defaults keep local/self-hosted behavior compatible; stricter deployments should supply a fail-closed adapter.

## Project Ownership

Projects carry an organization id so policy adapters can decide whether an actor is a member of the project's organization. Existing local projects are backfilled to the self-hosted default organization id during migration.

Queries should filter by known organization scope where practical, and resource-scoped commands should pass project, environment, resource, or server ids to the guard so adapters can resolve ownership.
