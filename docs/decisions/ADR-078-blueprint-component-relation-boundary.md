# ADR-078: Blueprint Component Relation Boundary

Status: Accepted

## Context

ADR-065 defines a Blueprint as a portable application or service topology definition and allows a
neutral `BlueprintApplicationBundlePlan` to group multiple components, generated resource intents,
deployment intents, and dependency-resource bindings.

The current Blueprint component model can describe deployable units and external dependency
resources, but it cannot describe relationships between components in the same Blueprint
installation. Multi-component applications therefore lose intent such as:

- a worker uses an API component's HTTP endpoint;
- a frontend needs a backend URL injected as a runtime variable;
- a service should start only after another component is healthy;
- an application component sends telemetry to a bundled tracing backend component;
- one component needs private service discovery for another component's private port.

Without a neutral relation model, provider adapters and future surfaces would either infer intent
from component order, add ad hoc private fields, or incorrectly model a component as a dependency
resource. Those approaches would make the public format ambiguous and would weaken the separation
between deployable components and external or managed dependency resources.

## Decision

- Add a neutral `componentRelations` field to the Blueprint manifest and variant override shape.
- A `BlueprintComponent` is a deployable runtime unit inside the Blueprint. It normally compiles to
  one Appaloft Resource and one or more deployment attempts.
- A `BlueprintResourceRequirement` is an external, managed, imported, or otherwise separately
  bound dependency resource such as Postgres, Redis, MySQL, ClickHouse, object storage, OpenSearch,
  volume, or a shared tracing backend capability. It continues to be connected through
  component-to-dependency binding.
- A `BlueprintComponentRelation` expresses only a relationship between two components inside the
  same Blueprint installation. It may describe endpoint consumption, lifecycle ordering, private
  service discovery, network allowance, or telemetry attachment.
- Relation direction is canonical: `from` is the consumer or dependent component; `to` is the
  provider or dependency component.
- A component relation does not create ownership. Application ownership remains
  application-to-components through the bundle/application grouping.
- A component relation does not replace dependency resources. It may not point at
  `BlueprintResourceRequirement` ids. Resource requirements continue to use component dependency
  bindings.
- A component may expose ports. Endpoint and telemetry relations that reference `endpoint` must
  reference an existing port name on the `to` component.
- A tracing backend such as Jaeger has different modeling roles depending on installation intent:
  if it is bundled and deployed with the application, it is a component; if it is shared or
  externally managed, it is a dependency resource or capability binding. The same distinction
  applies to other observability backends.
- `required: true` means the relation must be satisfied by the compiler and selected runtime target
  before the dependent component can be admitted for execution. `required: false` means the relation
  is best-effort: the plan must preserve it and may produce warnings when a target cannot satisfy
  it, but it does not block unrelated component deployment.
- Required lifecycle ordering must be acyclic. Required startup cycles are invalid because no
  component can become ready first. Optional lifecycle relations may preserve advisory intent but
  must not be used to prove startup safety.
- Relation effects may only consume outputs made available by the relation type and endpoint. For
  example, `inject-env.valueFrom = endpoint-url` is valid only when the relation references an
  endpoint-bearing provider port.
- Blueprint install planning must compile relations into neutral plan operations such as
  `configure-component-link`, with optional effect operations for `inject-env`, `network-allow`,
  `private-service-discovery`, `order-after`, `readiness-gate`, and `attach-telemetry`.
- Runtime/provider-specific rendering of these operations remains behind runtime target adapters.
  The manifest must not expose Docker, Swarm, Kubernetes, DNS, or provider SDK configuration when a
  portable Appaloft operation can express the intent.

## Consequences

- Blueprint manifests can carry same-application component graph intent without treating databases,
  caches, object stores, search indexes, or shared observability backends as application components.
- Dry-run install plans can show component links before execution and can preserve required versus
  optional semantics.
- Existing single-component Blueprints and component-to-dependency bindings remain valid.
- The validator must enforce relation id uniqueness, component existence, endpoint existence on the
  provider component, required lifecycle cycle rejection, and relation effect output compatibility.
- The application bundle plan must preserve component relations as neutral relationships so
  downstream consumers can display, audit, upgrade, or reconcile the component graph without owning
  the deployment semantics.
- Upgrade planning must treat added, removed, or changed required relations as at least
  `potentially-breaking` because they can alter runtime configuration or startup admission.

## Alternatives Considered

- Use a generic `dependsOn` array on each component: rejected because it hides relation direction,
  cannot distinguish endpoint, lifecycle, telemetry, and private network intent, and encourages
  startup-order-only thinking.
- Reuse dependency resources for component links: rejected because component-to-component links are
  internal to one Blueprint installation while dependency resources are external or separately
  bound resources.
- Infer links from environment variable names or component order: rejected because inference is not
  portable, cannot be validated, and cannot safely drive dry-run planning.
