# Example Spec Drafts

> Analysis date: 2026-04-13.
>
> These are lightweight drafts for agent orientation. They are not complete command/event specs.
> Convert them into files under `docs/commands/`, `docs/events/`, and `docs/workflows/` when the
> team decides to formalize them.

## Example: `deployments.create`

Current code basis:

- Command: `CreateDeploymentCommand`
- Schema: `createDeploymentCommandInputSchema`
- Handler: `CreateDeploymentCommandHandler`
- Use case: `CreateDeploymentUseCase`
- Operation key: `deployments.create`
- Transports: CLI `yundu deploy`, oRPC/OpenAPI `POST /api/deployments`, oRPC stream
  `/api/deployments/stream`, Web QuickDeploy through typed oRPC client

Current behavior:

1. Accepts a source locator and optional project/server/destination/environment/resource ids.
2. Applies deployment config and default-context bootstrap when identifiers are omitted.
3. Resolves project, deployment target/server, destination, environment, and resource.
4. Rejects if latest deployment for the resource is not terminal.
5. Detects or constructs the source descriptor.
6. Creates an immutable environment snapshot.
7. Builds runtime plan resolution input from source, server, snapshot, detection reasoning, and
   command hints.
8. Resolves a runtime plan.
9. Creates a `Deployment` aggregate.
10. Moves status through planning and planned, persists, and publishes domain events.
11. Starts execution, persists, and publishes domain events.
12. Runs execution backend synchronously from the command caller perspective.
13. Persists final deployment and publishes final deployment events.
14. Returns `{ id }`.

Current synchronous errors:

- invalid command input -> `validation_error`
- missing required context when defaults policy requires explicit ids -> `validation_error`
- missing project/environment/destination/server/resource -> `not_found`
- non-terminal latest deployment -> `deployment_not_redeployable`
- source detection failure -> `validation_error`, `infra_error`, or provider/adapter-specific
  error depending on detector
- runtime plan resolution failure -> usually validation/provider/infra error depending on adapter
- execution backend failure returned as `Result` may become a synchronous command failure today

Current async/stream behavior:

- Progress stream events are emitted for detect and plan from application code, and runtime
  adapters can emit phase logs/events through the progress reporter.
- Domain events are emitted when the deployment aggregate state changes.
- The current command does not return `accepted` before execution completes.

Target spec questions:

- Should command success mean "deployment accepted" or "deployment execution finished"?
- Should plan and execute become separate commands?
- Should `deployments.create` permit resource bootstrap once `resources.create` exists?
- Which errors should be persisted as deployment failure instead of returned synchronously?

Initial test matrix:

| Scenario | Given | When | Then |
| --- | --- | --- | --- |
| explicit context deployment | all ids exist | create deployment | returns id, status becomes succeeded/failed, snapshot is immutable |
| omitted local context | local defaults policy allows bootstrap | create deployment | project/server/destination/environment/resource are created or reused |
| hosted explicit context required | ids omitted | create deployment | returns `validation_error` before runtime execution |
| active latest deployment | latest status is running | create deployment | returns `deployment_not_redeployable` |
| configured source | `source` is provided | create deployment | detector is bypassed and source descriptor uses configured source |
| runtime plan invalid | unsupported method/source combination | create deployment | returns stable validation/provider/infra error code |
| execution failed | backend returns failed execution result | create deployment | persisted deployment status and returned error semantics match command spec |

## Example: Server Register To Edge Proxy Bootstrap

Current code basis:

- Command: `RegisterServerCommand`
- Use case: `RegisterServerUseCase`
- Aggregate: `DeploymentTarget`
- Event: `deployment_target.registered`
- Event handler: `BootstrapServerEdgeProxyOnTargetRegisteredHandler`
- Runtime port: `ServerEdgeProxyBootstrapper`

Current behavior:

1. `servers.register` creates a deployment target/server.
2. When `proxyKind` is omitted, the command currently defaults to `traefik`.
3. The aggregate records `deployment_target.registered`.
4. The use case persists server metadata and publishes domain events.
5. The shell event bus dispatches the event handler asynchronously.
6. The handler reloads the server, skips if missing or proxy kind is `none`.
7. The handler marks edge proxy bootstrap started and persists the server.
8. The handler calls the runtime edge proxy bootstrapper.
9. Success marks server edge proxy `ready`.
10. Failure marks server edge proxy `failed` with error code and message.

Important distinction:

- `servers.register` success means server metadata was created and the bootstrap event was
  published.
- It does not guarantee edge proxy bootstrap succeeded.

Current failure behavior:

- Missing server during event handling logs a warning and returns ok.
- Bootstrapper `Result` errors are converted into edge proxy failure state.
- Bootstrapper non-ready result also becomes edge proxy failure state.
- Event handler unhandled errors are logged by the in-memory event bus and are not returned to the
  caller of `servers.register`.

Initial event/workflow test matrix:

| Scenario | Given | When | Then |
| --- | --- | --- | --- |
| proxy kind traefik | registered server has pending traefik proxy | handle event | status becomes ready when bootstrapper returns ready |
| bootstrap failure | bootstrapper returns failed | handle event | status becomes failed and stores error code/message |
| proxy kind none | registered server has no proxy intent | handle event | handler returns ok and no bootstrap is attempted |
| missing server | event aggregate id has no server | handle event | handler returns ok and logs skipped warning |
| repeated event | ready/failed state already exists | handle same event again | expected idempotency must be specified before durable retries |

Target spec questions:

- Should proxy bootstrap be retried automatically? If yes, who owns retry state?
- Should `deployment_target.edge_proxy_bootstrap_failed` trigger notification or a follow-up
  command?
- Should proxy bootstrap status be projected into server read models for UI/CLI?
- Should event handling use outbox/inbox before production automation depends on it?
