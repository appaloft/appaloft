# ADR-010: Quick Deploy Workflow Boundary

Status: Accepted

Date: 2026-04-14

## Decision

Quick Deploy is an entry workflow, not a standalone domain command and not a separate operation-catalog business operation.

Quick Deploy may guide a user through selecting or creating the context needed for the first deployment, including source, project, deployment target/server, credential, environment, resource, resource network input, environment variable, and optional follow-up domain binding. Each write in that guided flow must still dispatch an explicit command owned by the relevant business operation.

The final deployment write in Quick Deploy must be `deployments.create`. The `deployments.create` command remains the source-of-truth command for deployment admission and keeps the acceptance semantics defined by its command spec: success means the deployment request is accepted and a deployment id is available, not that runtime execution has completed.

`yundu deploy` without a source argument is the CLI form of the same entry workflow. Its prompts are input collection and context bootstrap, not CLI-only deployment business rules.

The Web QuickDeploy surface is the Web form of the same entry workflow. Its wizard steps are input collection and preflight UX, not aggregate invariants.

API clients must not rely on a hidden Quick Deploy endpoint or transport-only shape. Non-interactive callers either provide a complete `deployments.create` input or explicitly call the prerequisite operations before dispatching `deployments.create`.

## Context

The product needs a fast path from a new user's intent to a first accepted deployment. That path may need to:

- choose a source;
- create or select a project;
- create or select a deployment target/server;
- create or configure credentials;
- create or select an environment;
- select, infer, or create a deployable resource;
- optionally set first environment variables;
- collect resource network input such as `internalPort`;
- optionally offer a follow-up durable domain binding entrypoint;
- dispatch the first deployment.

Those steps cross multiple aggregate and operation boundaries. Modeling the whole flow as a single domain command would hide distinct business operations, make partial failure semantics unclear, and create a parallel path that Web, CLI, API, and automation could drift from.

## Options Considered

### Option A: Add `quick-deploy.create` As A Standalone Domain Command

This would accept a large input shape and internally create project, server, credential, environment, resource, variables, and deployment state.

This option is rejected for the current architecture because it collapses multiple aggregate boundaries into one command, makes partial side effects hard to explain, and risks duplicating the semantics of existing operations.

### Option B: Keep Quick Deploy As An Entry Workflow Over Explicit Operations

This option treats Quick Deploy as Web/CLI input collection plus a sequence of existing commands and queries. The final deployment admission remains `deployments.create`.

This option is accepted.

### Option C: Add A Durable Onboarding Or Deployment Workflow Command Later

This option would create a durable workflow/process aggregate with its own id, resumability, idempotency keys, audit trail, and retry state.

This option is deferred. It may be introduced later only when the product requires resumable onboarding, automation-level one-shot admission, or cross-command workflow state that cannot be represented by the existing explicit operation sequence.

## Chosen Rule

Quick Deploy must be implemented as an entry workflow over explicit operations:

```text
Quick Deploy user intent
  -> entry-specific input collection
  -> optional queries to list/select context
  -> optional explicit commands to create/configure context
  -> deployments.create
  -> deployment progress/read-model observation
```

Allowed operation calls include:

- `projects.list` and `projects.create`;
- `servers.list`, `servers.register`, `servers.configure-credential`, `servers.test-connectivity`, and `servers.test-draft-connectivity`;
- `credentials.list-ssh` and `credentials.create-ssh`;
- `environments.list`, `environments.create`, and `environments.set-variable`;
- `resources.list`;
- future `resources.create` or `resources.update` when first-class resource configuration is implemented;
- `deployments.create`;
- deployment read/progress queries after acceptance.

Until a first-class `resources.create` operation exists, Quick Deploy may use the existing `deployments.create.resource` bootstrap input as a compatibility path. Once `resources.create` exists, Quick Deploy must prefer creating the resource explicitly and pass `resourceId` into `deployments.create`.

Quick Deploy must not:

- get its own operation-catalog entry unless it becomes a durable workflow/process operation governed by a new ADR;
- hide domain rules inside Web components or CLI prompt helpers;
- create domain bindings or certificates as hidden side effects of deployment;
- collect generated-domain provider settings or pass routing hints into `deployments.create`;
- treat generated default access routes as durable domain ownership;
- change deployment admission or async lifecycle semantics.

## Consequences

Quick Deploy can remain a fast path without weakening CQRS boundaries.

Web and CLI can share behavior at the workflow-contract level while using different input collection UX.

API and automation remain explicit and predictable: callers either call prerequisite commands or submit a complete `deployments.create` input.

Partial workflow failure does not imply cross-aggregate rollback. Commands that already succeeded remain committed unless a separate compensation operation is explicitly modeled.

Future durable onboarding can be added without reinterpreting the current Quick Deploy workflow as a domain aggregate.

## Governed Specs

- [deployments.create Command Spec](../commands/deployments.create.md)
- [deployments.create Workflow Spec](../workflows/deployments.create.md)
- [Quick Deploy Workflow Spec](../workflows/quick-deploy.md)
- [deployments.create Test Matrix](../testing/deployments.create-test-matrix.md)
- [Quick Deploy Test Matrix](../testing/quick-deploy-test-matrix.md)
- [ADR-017: Default Access Domain And Proxy Routing](./ADR-017-default-access-domain-and-proxy-routing.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Domain Model](../DOMAIN_MODEL.md)

## Implementation Requirements

Web QuickDeploy and CLI interactive deploy must dispatch existing commands and queries instead of bypassing the CommandBus/QueryBus path.

Transport input collection may maintain local draft state, but final writes must use command/query schemas from the operation catalog.

Quick Deploy may use a shared, side-effect-free workflow program that yields explicit operation steps and receives step results from an entry-specific executor. The shared program may sequence `projects.create`, `servers.register`, credential configuration, `environments.create`, `resources.create`, environment variable updates, and `deployments.create`; it must not call HTTP clients, CommandBus, QueryBus, service methods, repositories, prompts, or UI APIs directly.

Web, CLI, and future backend convenience surfaces may reuse that workflow program by supplying their own executor:

- Web executors call typed HTTP/oRPC client methods.
- CLI executors dispatch command/query messages through the CLI runtime and CommandBus/QueryBus.
- Backend convenience executors dispatch explicit commands through application buses or services only at the adapter/application boundary accepted for that surface.

Web QuickDeploy must call the normal `deployments.create` operation for the final deployment admission step. It must not call `deployments.createStream` as the workflow executor because stream progress represents deployment execution observation, not Quick Deploy prerequisite sequencing.

Workflow preflight errors may be shown in Web or CLI, but stable business errors come from the underlying command results and must follow the global error model.

If a future implementation adds a backend workflow API for Quick Deploy, that API must either:

- expose a non-durable convenience endpoint that dispatches the explicit operations and documents partial failure semantics; or
- introduce a new durable workflow command with its own ADR, operation-catalog entry, command spec, workflow state, idempotency key, retry semantics, and tests.

The second option is required if the workflow needs resumability, delayed user input, durable cross-step state, or automation-facing one-shot acceptance.

## Superseded Open Questions

- Should Web-created project/server/environment side effects remain inside QuickDeploy workflow or move to explicit separate steps before deployment?
- Should Quick Deploy be a standalone command?
- Should CLI no-arg `yundu deploy` prompts be modeled as deployment command semantics or as input collection?

## Current Implementation Notes And Migration Gaps

Web QuickDeploy uses the shared Quick Deploy workflow program for command sequencing and supplies a Web executor that calls typed oRPC/HTTP methods. UI-local draft collection and validation remain in `QuickDeploySheet.svelte`.

Web QuickDeploy displays per-step workflow progress from the shared workflow executor. It no longer uses the deployment progress stream dialog as the workflow progress UI.

CLI interactive deploy currently resolves prompts and creates/selects project, server, environment, and resource context in `deployment-interaction.ts`, then dispatches `CreateDeploymentCommand`.

CLI interactive deploy has not yet been fully migrated to the shared workflow program. It still follows this ADR by dispatching explicit commands through the CLI runtime rather than hiding service calls in prompt code.

`resources.create` is now a first-class operation for new first-deploy resources. Deployment bootstrap compatibility remains only for legacy/default deployment bootstrap paths.

Web QuickDeploy has UI-local validation and draft orchestration that should be extracted or kept behind a clear workflow boundary as the surface grows.

## Open Questions

- None.
