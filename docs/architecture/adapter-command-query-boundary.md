# Adapter Command/Query Boundary

## Normative Rule

Adapters are transport and presentation boundaries. `packages/orpc`,
`packages/adapters/http-elysia`, `packages/adapters/cli`, and future MCP adapters may parse
transport input, authenticate or verify transport envelopes, translate responses, and dispatch
application messages. They must not own domain policy, repository lookup, aggregate mutation, or
aggregate-state predicates.

Allowed adapter dependencies:

- application `Command` and `Query` messages;
- `CommandBus`, `QueryBus`, and `ExecutionContext` construction;
- transport-only ports such as webhook verifier interfaces;
- contract schemas and public DTOs;
- CLI-only local filesystem or SSH state helpers when the helper is the transport/runtime owner and
  does not decide application policy.

Forbidden adapter dependencies:

- application repository ports such as `ResourceRepository`, `SourceLinkRepository`, or aggregate
  read/write repositories;
- core repository specifications such as `ResourceByIdSpec` for business lookup;
- direct aggregate `toState()` reads for command/query decisions;
- direct repository `findOne`, `upsert`, or mutation orchestration for business workflows;
- duplicated command input schemas that drift from application command/query schemas.

## Aggregate State Peeling

`toState()` is allowed at serialization, persistence, read-model projection, fixture, logging, and
test assertion boundaries. It is not allowed as a way to ask business questions from adapters or
application services when the aggregate can expose an explicit method.

Examples:

- good: `Resource.genericSignedWebhookSecretValue()` answers whether the resource has a valid
  runtime secret for generic signed webhook verification;
- good: `Deployment.hasRealizedAccessRoute(...)` answers whether a runtime plan contains the
  requested access route;
- bad: an oRPC route reading `resource.toState().autoDeployPolicy` or
  `deployment.toState().runtimePlan.execution.accessRoutes` to decide acceptance.

## oRPC And HTTP

`packages/orpc` owns typed business transport routes. It may import application commands, queries,
their schemas, and transport verifier interfaces. It must dispatch through `CommandBus` or
`QueryBus`.

`ExecutionContext` must always carry a tenant context. Product-session operations derive that
tenant from the authenticated session/current organization before dispatch. The Web console and
ordinary API callers do not pass tenant ids for product-session operations. Backend query handlers,
query services, use cases, and read models must apply bounded defaults for list/read-model queries
so an omitted transport `limit` can never load an entire table.

`packages/adapters/http-elysia` composes HTTP middleware and mounts oRPC/static assets. It may pass
the buses and transport verifier ports into oRPC. It must not pass repository ports into oRPC.

## CLI

The CLI may render read-model DTOs and manage CLI-owned local/SSH runtime state. When a workflow
needs project/resource/source-link/resource-secret policy, the CLI must dispatch an application
command/query or use an application read-model helper instead of embedding the policy in the command
module.

## Package Boundary Recommendation

Future package layout should make the boundary harder to violate:

- expose adapter-safe imports from `@appaloft/application/messages` for commands, queries, and
  schemas;
- expose `@appaloft/application/bus` for `CommandBus`, `QueryBus`, and execution context types;
- expose transport verifier ports from a narrow `@appaloft/application/transport-ports` subpath;
- keep repositories, use cases, query services, handlers, and DI tokens on internal application
  subpaths used only by shell/composition and tests;
- add an import-boundary rule that rejects adapter imports of application repository ports or core
  repository specs.

Commands, queries, handlers, use cases, and query services belong in `packages/application`, not
`packages/core`. Core owns aggregates, value objects, specifications, domain events, and runtime
plan value types.
