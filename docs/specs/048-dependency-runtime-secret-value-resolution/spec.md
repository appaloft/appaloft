# Dependency Runtime Secret Value Resolution

## Status

- Round: Spec Round
- Artifact state: accepted ADR/spec/plan/tasks; Test-First and Code Rounds remain open
- Roadmap target: Phase 7 / `0.9.0` beta, Day-Two Production Controls
- Compatibility impact: `pre-1.0-policy`, durable secret storage and runtime execution behavior
  change for dependency resources and bindings
- Decision state: governed by
  [ADR-041](../../decisions/ADR-041-dependency-runtime-secret-value-resolution.md)

## Business Outcome

Operators can import or provision a dependency, bind it to a Resource, deploy the Resource, and have
the workload receive the actual Postgres or Redis connection value at runtime without editing files
on the server, passing raw secrets to `deployments.create`, or exposing the connection value in
Appaloft read surfaces.

This closes the value-resolution gap after dependency runtime injection captured only safe secret
handles. It does not add provider-native Redis realization, provider credential rotation, build-time
dependency injection, or new public deployment input fields.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| DependencySecretValueStore | Application port that stores dependency connection material and returns safe references. | Dependency Resources / Persistence | dependency secret store |
| DependencyRuntimeSecretResolver | Execution-only application port that checks and resolves captured dependency secret references. | Release Orchestration / Runtime Target | runtime secret resolver |
| ResolvedDependencyRuntimeSecret | Execution-only value containing the target name, resolved secret value, and sanitized display handle. | Runtime Target | resolved dependency secret |
| AppaloftOwnedDependencySecretRef | A safe reference whose value Appaloft is responsible for storing and resolving. | Dependency Resources | appaloft secret ref |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| DEP-BIND-SECRET-RESOLVE-001 | Store imported Postgres connection value | Operator imports an external Postgres dependency with a raw connection URL and no external `secretRef` | `dependency-resources.import-postgres` succeeds | The raw connection URL is stored through the dependency secret-value store, the dependency resource persists only a safe Appaloft-owned secret reference and masked endpoint summary, and list/show/events/logs omit the raw URL. |
| DEP-BIND-SECRET-RESOLVE-002 | Store imported Redis connection value | Operator imports an external Redis dependency with a raw connection URL and no external `secretRef` | `dependency-resources.import-redis` succeeds | The raw Redis URL is stored through the dependency secret-value store, the dependency resource persists only a safe Appaloft-owned secret reference and masked endpoint summary, and list/show/events/logs omit the raw URL. |
| DEP-BIND-SECRET-RESOLVE-003 | Validate managed Postgres connection reference | A managed Postgres provider realization returns a safe Appaloft-owned reference or a provider-owned externally resolvable reference | realization is applied | The dependency resource becomes binding-ready only when the reference can be resolved or is explicitly provider-owned and backend-supported; otherwise binding readiness is blocked with a safe reason. |
| DEP-BIND-SECRET-RESOLVE-004 | Block unresolved runtime secret before deployment acceptance | A Resource has an active injectable binding whose captured secret reference is missing, inactive, malformed, or Appaloft-owned but not resolvable | `deployments.plan` or `deployments.create` runs | Plan reports blocked runtime injection with a safe `dependency_runtime_secret_unresolved`-style reason, and create rejects before creating a deployment attempt without exposing secret values. |
| DEP-BIND-SECRET-RESOLVE-005 | Resolve and inject single-server dependency env | A deployment snapshot has resolvable Postgres and imported Redis binding secret references | single-server local-shell or generic-SSH runtime execution materializes the deployment | The runtime target receives `DATABASE_URL` and/or `REDIS_URL` as execution-only secret values; sanitized command display, logs, events, errors, and diagnostics show only handles or redacted markers. |
| DEP-BIND-SECRET-RESOLVE-006 | Materialize Swarm dependency secrets | A deployment snapshot has resolvable dependency secret references and the selected target is Docker Swarm | Swarm runtime execution materializes the deployment | The adapter creates or updates Docker secrets from resolved values before service update, references only Docker secret handles in the rendered service intent, and never places raw connection values in Swarm intent readback or diagnostics. |
| DEP-BIND-SECRET-RESOLVE-007 | Preserve historical resolution across rotation | Deployment A captured binding secret ref v1, then the binding is rotated to v2 and Deployment B captures v2 | retry/redeploy/rollback reads or executes either attempt | Deployment A resolves v1 and Deployment B resolves v2; rotation does not rewrite historical snapshots or deactivate retained refs needed by rollback candidates. |

## Domain Ownership

- Bounded contexts: Dependency Resources, Release Orchestration, Runtime Topology, and Persistence.
- Aggregate/resource owner:
  - `ResourceInstance` owns safe dependency connection metadata and binding readiness.
  - `ResourceBinding` owns current binding secret reference/version metadata.
  - `Deployment` owns the immutable captured runtime secret reference for one attempt.
  - Persistence adapters own protected storage and lookup of raw dependency secret payloads.
  - Runtime target adapters own backend-specific materialization from resolved values to runtime
    environment variables or backend-native secrets.
- Application services coordinate storage/resolution through explicit ports. Core aggregates never
  store raw dependency connection values and runtime adapters never query persistence tables
  directly.

## Public Surfaces

- API/oRPC: no new `deployments.create` input fields. Import commands keep accepting connection
  URLs as command input and may accept external safe refs. Plan/show/create readiness uses existing
  dependency runtime injection summaries with safe blocked reasons.
- CLI: import commands continue accepting connection URLs; deploy/plan/show JSON and human output
  show only readiness, handles, and masked connection summaries.
- Web/UI: dependency import forms and plan/show read surfaces must not display raw stored values.
- Repository config: no dependency secret fields are added to deployment config.
- Public docs/help: existing dependency runtime injection docs remain the user-facing anchor unless
  Code Round changes user-visible setup steps.
- Future MCP/tools: use the same command/query schemas and readiness fields.

## Runtime Secret Resolution Contract

For the Phase 7 Code Round, a dependency secret reference is resolvable when:

- the reference is captured from an active ready binding or binding rotation;
- Appaloft owns the reference and the dependency secret-value store has an active payload for it; or
- the reference is provider-owned/external and the selected runtime target backend has an explicit
  resolver/mount strategy for that reference kind;
- the resolved value is supplied only through an execution-only runtime input;
- sanitized display data contains target name, dependency kind, binding id, dependency resource id,
  safe reference handle, and redaction marker, but not the raw value.

The resolver must not return raw values to read-model queries, `deployments.plan`, `deployments.show`,
OpenAPI descriptions, Web views, CLI table output, lifecycle events, diagnostics, or error details.

## Non-Goals

- No dependency-specific fields on `deployments.create`.
- No provider-native Redis realization.
- No provider credential rotation or provider-native database password rotation.
- No build-time dependency injection.
- No file/reference injection modes beyond environment-variable delivery.
- No generic user-facing secret browsing or plaintext reveal operation.
- No deactivation of historical secret refs still needed by retained deployment snapshots or
  rollback candidates.

## Current Implementation Notes And Migration Gaps

Current implementation stores imported Postgres and Redis connection URLs through the
`DependencyResourceSecretStore`, persists them in `dependency_resource_secrets`, and returns only
safe `appaloft://dependency-resources/.../connection` refs plus masked endpoint summaries on
dependency resource read surfaces. Managed Postgres realization now validates Appaloft-owned
connection refs before marking binding readiness ready; unresolved Appaloft-owned refs keep the
provider realization ready while safely blocking binding readiness. `deployments.plan` and
`deployments.create` now validate captured Appaloft-owned dependency runtime refs through the
dependency resource secret store, report `dependency_runtime_secret_unresolved` safely during plan,
and reject create before deployment acceptance when resolution fails. Local-shell and generic-SSH
single-server execution now resolve Appaloft-owned dependency refs into execution-only runtime
environment values and mark dependency target variables for redaction in Docker command display and
runtime output. It also stores rotated binding secret values in `dependency_binding_secrets`.
Deployment snapshots capture safe runtime secret references and runtime adapters render safe
handles, but Docker Swarm secret materialization and historical rotated-ref execution coverage
remain open before the Postgres and Redis closed-loop exit criteria can be checked.
