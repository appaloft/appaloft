# Dependency Binding Runtime Injection

## Status

- Round: Code Round
- Artifact state: safe runtime injection snapshot, readiness slice, and public docs/help slice
  implemented; store-backed secret value resolution remains open
- Roadmap target: Phase 7 / `0.9.0` beta, Day-Two Production Controls
- Compatibility impact: `pre-1.0-policy`, deployment admission/readiness behavior changes for
  bound dependencies
- Decision state: governed by [ADR-040](../../decisions/ADR-040-dependency-binding-runtime-injection-boundary.md)

## Business Outcome

Operators can bind a ready dependency resource to a Resource, deploy the Resource, and have the
workload receive the dependency connection through its runtime environment without editing files on
the server or passing raw secrets to `deployments.create`.

This closes the runtime-delivery gap after the safe snapshot-reference baseline. It does not create
provider-native Redis infrastructure, rotate provider credentials, or add new public deployment
input fields.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| DependencyRuntimeInjection | Materializing a ResourceBinding into a runtime input for one deployment attempt. | Release Orchestration / Runtime Target | dependency env injection |
| InjectionSnapshot | Immutable safe dependency injection facts captured on the deployment attempt. | Deployment | dependency injection snapshot |
| RuntimeSecretResolution | Adapter-owned step that resolves or mounts a captured dependency secret reference for workload execution. | Runtime Target | secret materialization |
| InjectableBinding | Active ready ResourceBinding whose dependency kind, scope, injection mode, target name, and secret reference can be delivered by the selected runtime target. | Dependency Resources | injectable dependency |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| DEP-BIND-RUNTIME-INJECT-001 | Inject Postgres binding into deployment runtime | Resource has an active ready Postgres binding with `targetName = DATABASE_URL`, `scope = runtime-only`, `injectionMode = env`, and a safe secret reference | `deployments.create` accepts the deployment | The deployment captures an immutable runtime injection snapshot and runtime execution receives `DATABASE_URL` through the selected runtime target without exposing the raw connection in snapshots, read models, logs, events, or errors. |
| DEP-BIND-RUNTIME-INJECT-002 | Inject imported Redis binding into deployment runtime | Resource has an active ready imported Redis binding with `targetName = REDIS_URL`, `scope = runtime-only`, `injectionMode = env`, and a safe secret reference | `deployments.create` accepts the deployment | The deployment captures an immutable runtime injection snapshot and runtime execution receives `REDIS_URL`; managed Redis remains blocked until provider-native Redis realization exists. |
| DEP-BIND-RUNTIME-INJECT-003 | Plan reports injection readiness | Resource has active dependency bindings | `deployments.plan` runs | Plan output reports runtime injection `ready` only when all active bindings are injectable for the selected runtime target; otherwise it reports `blocked` with safe reason codes and no side effects. |
| DEP-BIND-RUNTIME-INJECT-004 | Block non-injectable active binding before acceptance | Active binding has missing secret reference, unsupported kind, unsupported scope, unsupported injection mode, duplicate target name, not-ready dependency state, or target backend cannot deliver secrets | `deployments.create` runs | Command rejects before deployment acceptance with structured `dependency_runtime_injection_blocked`, no deployment attempt is created, and no raw secret appears in the error. |
| DEP-BIND-RUNTIME-INJECT-005 | Preserve historical injection snapshot across rotation | Deployment captured a dependency injection snapshot and the binding secret is rotated later | `deployments.show`, retry, redeploy, or rollback candidate reads the older attempt | The older attempt keeps its captured binding/secret reference; future deployments may use the new binding secret reference, and historical snapshots are not rewritten. |
| DEP-BIND-RUNTIME-INJECT-006 | Runtime adapter redacts resolved secrets | Runtime target resolves or mounts dependency secret values for execution | Runtime command display, logs, events, diagnostics, or failure errors are recorded | Raw dependency connection strings, passwords, tokens, auth headers, cookies, private keys, and provider payloads are redacted. |

## Domain Ownership

- Bounded contexts: Dependency Resources, Release Orchestration, and Runtime Topology.
- Aggregate/resource owner:
  - `ResourceBinding` owns current binding lifecycle, target metadata, and binding secret reference.
  - `ResourceInstance` owns dependency kind, readiness, provider realization, and safe connection
    metadata.
  - `Deployment` owns the immutable injection snapshot for one attempt.
  - Runtime target adapters own backend-specific secret delivery and command rendering.
- Application service owner: a dedicated dependency runtime-injection materializer coordinates
  current binding summaries, deployment environment snapshot materialization, and target-backend
  readiness. `CreateDeploymentUseCase` must not assemble dependency environment variables inline.

## Public Surfaces

- API/oRPC: no new `deployments.create` input fields. Existing plan/show outputs extend the
  dependency binding readiness summary from `deferred` to `ready` or `blocked` after Code Round.
- CLI: existing deploy/plan/show commands expose the same JSON fields; human output may summarize
  ready/blocked dependency runtime injection.
- Web/UI: read-only plan/show surfaces may display safe readiness. Write affordances remain the
  existing dependency binding commands.
- Repository config: no dependency secret fields are added to `deployments.create`; future entry
  workflows may dispatch dependency bind commands before deployment.
- Public docs/help: Docs Round must update dependency deployment task docs before the behavior is
  called user-complete.
- Future MCP/tools: use the same command/query schemas and readiness fields.

## Runtime Injection Contract

For the Phase 7 Code Round, a binding is injectable only when:

- binding status is `active`;
- dependency lifecycle status is `ready`;
- dependency kind is `postgres` or imported external `redis`;
- provider-managed Postgres has ready provider realization with safe secret reference;
- imported Postgres/Redis has a safe connection secret reference;
- scope is `runtime-only`;
- injection mode is `env`;
- target name is a valid config key and does not conflict with an existing effective environment or
  resource variable for the same runtime exposure;
- selected runtime target backend advertises dependency secret delivery support.

The materialized deployment snapshot must include enough safe metadata to replay, retry, redeploy,
rollback, and audit the attempt:

- binding id;
- dependency resource id;
- dependency kind;
- target name;
- scope;
- injection mode;
- captured secret reference or runtime secret handle;
- readiness status/reason.

The materialized deployment snapshot must not include raw connection values, passwords, provider
credentials, or provider response payloads.

## Non-Goals

- No dependency fields on `deployments.create`.
- No provider-native Redis realization.
- No build-time dependency injection.
- No file or reference injection modes.
- No provider credential rotation.
- No mutation of historical deployment snapshots after binding secret rotation.
- No direct storage of raw dependency secret values in Deployment, read models, logs, events, or
  public contracts.

## Current Implementation Notes And Migration Gaps

Current implementation captures safe Postgres and imported Redis runtime secret references in
deployment snapshots, reports runtime injection as `ready | blocked | not-applicable`, rejects
active non-injectable bindings before deployment acceptance, and routes safe secret handles through
single-server and Swarm runtime target adapters. Store-backed resolution of `appaloft://...` secret
references into raw dependency connection values remains a migration gap, so Postgres and Redis
closed-loop exit criteria stay open. Public docs now describe safe bind-to-deploy behavior and
blocked runtime injection readiness.
