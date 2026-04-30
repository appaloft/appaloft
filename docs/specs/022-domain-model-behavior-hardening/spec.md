# Domain Model Behavior Hardening

## Status

- Round: Spec Round
- Artifact state: slices 1, 2, 3, 4, 5, 6, 7, and 8 implemented; remaining hotspots recorded for future slices
- Behavior type: no-behavior-change domain model refactor
- Public behavior impact: none

## Business Outcome

Appaloft's core domain model should answer domain questions in the objects that own the rules. The
same existing deployment, resource, target, domain, certificate, configuration, and workload
behavior must remain observable through the current CLI, HTTP/oRPC, Web, read models, events,
errors, and persistence contracts, but the code should no longer rely on callers peeling
`.toState().x.value` to decide business policy.

This work hardens the model so future behavior can be added by naming domain intent on value
objects, entities, and aggregate roots instead of spreading decisions through application services,
helpers, providers, and adapters.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Domain behavior | A business rule, predicate, transition, comparison, or calculation expressed in Appaloft domain language. | All bounded contexts | None |
| Intention-revealing method | A method that names the business question or operation, such as `requiresInternalPort()` or `canUseGeneratedAccessRoutes()`. | Core domain model | None |
| Serialization boundary | A place where domain objects are intentionally converted to plain DTO/state for persistence, read models, contracts, fixtures, assertions, or adapter rendering. | Boundaries outside domain behavior | `toState()` usage is allowed here |
| Anemic model hotspot | A domain object that mostly exposes `create`, `rehydrate`, `equals`, or `toState`, while external callers own its rules. | Core domain model | None |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| DMBH-SPEC-001 | Resource deployment admission asks Resource-owned questions | A resource has kind, services, source binding, runtime profile, network profile, access profile, and health policy | `deployments.create` or `deployments.plan` needs deployment input | The application layer calls intention-revealing `Resource` or owned value-object methods instead of reimplementing source/network/runtime decisions from primitive state. |
| DMBH-SPEC-002 | Deployment target proxy eligibility is target-owned | A deployment target has optional edge proxy kind/status | generated access, server-applied routes, or proxy bootstrap needs proxy eligibility | Callers ask the target for route/bootstrap eligibility; they do not duplicate `kind === "none"` or `status === "disabled"` checks. |
| DMBH-SPEC-003 | Domain binding readiness decisions are binding-owned | A domain binding progresses through ownership, certificate, route, ready, not-ready, and deleted states | event handlers or commands need to decide whether a transition applies | Callers invoke `DomainBinding` methods for certificate admission, certificate requirement, route-readiness, idempotent readiness, and retry eligibility instead of branching on status/policy primitives. |
| DMBH-SPEC-004 | Configuration precedence belongs to configuration values | Environment/resource configuration entries and snapshots share key/exposure/scope identity | a set entry, unset, snapshot, or diff operation runs | Entry identity, scope matching, precedence, and snapshot equality are expressed on configuration value objects or `EnvironmentConfigSet`, not by repeated external string keys or caller-owned state peeling. |
| DMBH-SPEC-005 | Deployment execution guard uses deployment intent | A deployment may be active, cancel-requested, canceled, superseded, or terminal | execution code decides whether work may continue or whether supersede requires runtime cancellation | The decision is named on `Deployment` or `DeploymentStatusValue`; application guards do not branch on raw status literals. |
| DMBH-SPEC-006 | Workload/runtime compatibility is model-owned | A workload kind and runtime spec must remain compatible | workload declaration validates a static site, worker, or web-server runtime | `Workload` owns the compatibility rule across workload kind and runtime spec; `RuntimeSpec` owns the single-runtime rule that web-server runtime requires a port. |
| DMBH-SPEC-007 | Boundary audit classifies remaining state reads | `toState()` remains in core, application, persistence, and adapter code after focused slices | a model-hardening round ends | Remaining state reads are classified as allowed boundary serialization/mapping/specification reads or recorded as future model-hardening hotspots; no whole-repository mechanical rewrite is performed. |
| DMBH-SPEC-008 | Deployment context ownership is model-owned | Environment, Resource, and Destination aggregates belong to selected parent contexts | deployment context resolution or source-link relink validates project/environment/server/destination consistency | Callers ask aggregate-owned intention methods such as `belongsToProject(...)`, `belongsToEnvironment(...)`, `belongsToServer(...)`, and `canDeployToDestination(...)` instead of peeling ids from state for ownership decisions. |

## Domain Ownership

- Bounded contexts:
  - Workspace
  - Configuration
  - Runtime Topology
  - Workload Delivery
  - Release Orchestration
- Aggregate/resource owners:
  - `Resource` owns resource source/runtime/network/access/profile admission questions.
  - `DeploymentTarget` owns target lifecycle and edge-proxy readiness questions.
  - `DomainBinding` owns domain ownership, route, certificate, and ready-state questions.
  - `Deployment` owns deployment status/execution-continuation questions.
  - `EnvironmentConfigSet` and configuration entry/snapshot value objects own config identity and precedence.
  - `Workload` and `RuntimeSpec` own workload/runtime compatibility.
  - `Environment`, `Resource`, and `Destination` own context membership and placement compatibility
    checks used by deployment context resolution and source-link relink admission.
- Upstream/downstream contexts: no new context relationship is introduced.

## Public Surfaces

- API: unchanged.
- CLI: unchanged.
- Web/UI: unchanged.
- Config: unchanged.
- Events: unchanged.
- Public docs/help: not user-facing; no public docs page or help anchor required.
- Database schema: unchanged.
- AI tool / future MCP manifest: unchanged.

## Non-Goals

- Do not add a new business capability, command, query, recommender, strategy engine, or simulator.
- Do not change operation catalog entries, command schemas, query schemas, API routes, CLI flags, event payloads, read-model shapes, or database schemas.
- Do not perform a whole-repository mechanical rewrite.
- Do not remove `toState()` from serialization, read-model mapping, persistence/adapter, fixtures, assertions, schema, or DTO boundaries.

## Decision Record

Decision state: no-ADR-needed.

Reason: this refactor does not change command/query boundaries, aggregate ownership, lifecycle
semantics, canonical Appaloft language, durable state shape, persistence policy, public contracts,
or cross-context relationships. It applies existing `AGENTS.md`, `DOMAIN_MODEL.md`, ADR-026, and
DDD tactical rules to move existing behavior into the objects that already own it.

## Open Questions

- None for slice 2. The project-local DDD skill remains under
  `.agents/skills/domain-driven-develop`; no `.codex/skills/domain-driven-develop` copy exists in
  this repository.
