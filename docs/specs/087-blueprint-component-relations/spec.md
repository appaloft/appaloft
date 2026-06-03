# Blueprint Component Relations

## Status

- Round: Code Round / Post-Implementation Sync
- Artifact state: implemented package-level public neutral behavior with runtime projection coverage
- Roadmap target: Blueprint package-level capability before a public import/install command
- Compatibility impact: `pre-1.0-policy`; additive manifest and dry-run plan fields

## Business Outcome

Blueprint authors can describe how deployable components inside one Blueprint installation connect,
wait for each other, discover private endpoints, or attach telemetry, while dependency resources
remain separately modeled as external or managed resources.

The same manifest can validate locally, load from JSON or YAML, compile into a dry-run install
plan, and preserve the component graph in a neutral application bundle plan without introducing a
second deployment engine.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| BlueprintComponent | Deployable runtime unit inside a Blueprint. It usually maps to one Appaloft Resource and deployment path. | Blueprint format | component |
| BlueprintResourceRequirement | External, managed, imported, or separately bound dependency requirement such as Postgres, MongoDB, Redis, MySQL, ClickHouse, object storage, OpenSearch, volume, or a shared capability. | Blueprint dependency resources | dependency resource |
| BlueprintComponentRelation | Directed relationship from one Blueprint component to another component in the same installation. | Blueprint component graph | component link |
| Relation consumer | The `from` component. It consumes, depends on, waits for, or emits to the provider. | Component graph | dependent |
| Relation provider | The `to` component. It provides the endpoint, readiness, service discovery target, or telemetry receiver. | Component graph | dependency |
| Relation effect | Neutral plan effect derived from a relation, such as env injection, private service discovery, ordering, readiness gate, or telemetry attachment. | Install plan | link effect |
| Relation output | Typed value a relation can provide to effects, such as an endpoint URL. | Validation and planning | output |

## Manifest Shape

`componentRelations` is optional and defaults to an empty array. It is allowed at the manifest root
and inside a variant override. A selected variant replaces the root relation set when it supplies
`componentRelations`, matching the current component/resource/secret override behavior.

```yaml
schemaVersion: appaloft.blueprint/v1
id: example-app
name: Example App
version: 1.0.0
summary: Multi-component application.
components:
  - id: api
    name: API
    kind: service
    runtime:
      strategy: container-image
      image: example/api:latest
    ports:
      - name: http
        containerPort: 3000
        protocol: http
  - id: worker
    name: Worker
    kind: worker
    runtime:
      strategy: container-image
      image: example/worker:latest
componentRelations:
  - id: worker-uses-api
    type: endpoint
    from: worker
    to: api
    endpoint: http
    required: true
    effects:
      - kind: inject-env
        name: API_BASE_URL
        valueFrom: endpoint-url
profiles:
  production:
    replicas: 1
```

Canonical TypeScript shape:

```ts
type BlueprintComponentRelation = {
  id: string;
  type: "endpoint" | "lifecycle" | "telemetry";
  from: string;
  to: string;
  endpoint?: string;
  required?: boolean;
  description?: string;
  effects?: BlueprintComponentRelationEffect[];
};

type BlueprintComponentRelationEffect =
  | {
      kind: "inject-env";
      name: string;
      valueFrom: "endpoint-url" | "endpoint-host" | "endpoint-port" | "endpoint-scheme";
    }
  | {
      kind: "network-allow";
      mode?: "private";
    }
  | {
      kind: "private-service-discovery";
      valueFrom?: "service-name" | "endpoint-host";
    }
  | {
      kind: "order-after";
      readiness: "created" | "started" | "healthy";
    }
  | {
      kind: "readiness-gate";
      readiness: "started" | "healthy";
    }
  | {
      kind: "attach-telemetry";
      signal: "traces" | "metrics" | "logs";
      valueFrom?: "endpoint-url";
    };
```

## Direction And Semantics

- `from` is always the consumer or dependent component.
- `to` is always the provider or dependency component.
- A relation is scoped to one Blueprint installation. It must not reference a component from a
  different Blueprint or a dependency resource requirement.
- `required: true` is the default. It makes the relation part of admission and dry-run readiness.
- `required: false` keeps the relation in the plan as advisory or best-effort. Optional relations
  still must reference valid components and valid provider ports when they name an endpoint.
- `endpoint` references a port name on the `to` component. Endpoint relations require it.
  Telemetry relations require it when an effect needs endpoint output. Lifecycle relations do not
  need it unless an effect consumes endpoint output.

## Component Versus Dependency Resource

Use a component when the Blueprint installs and operates the runtime unit as part of the application
instance. Use a dependency resource when the requirement is externally managed, imported, shared, or
provisioned through the dependency resource lifecycle.

Examples:

- A bundled Jaeger service deployed alongside PocketBase is a component, and PocketBase can have a
  telemetry relation to that component.
- A shared tracing backend selected by the user is a dependency resource or capability binding, not
  a component relation target.
- Postgres, MongoDB, Redis, MySQL, ClickHouse, object storage, OpenSearch, and ordinary volumes remain
  dependency resources by default. They become components only when the Blueprint explicitly
  bundles a deployable database/cache/search service as part of the application topology.

## Validation Rules

The manifest validator must reject:

- duplicate relation ids in the selected relation set;
- `from` or `to` component ids that do not exist in the selected component set;
- `from` or `to` references to dependency resource ids;
- endpoint relations without `endpoint`;
- endpoint or telemetry relations whose `endpoint` is not a port on the `to` component;
- required lifecycle `order-after` or `readiness-gate` cycles;
- effects whose `valueFrom` is not available from the relation type and endpoint;
- duplicate `inject-env.name` effects targeting the same `from` component after profile,
  parameter, component variable, and relation effects are combined.

The validator may warn, but should not reject, optional lifecycle cycles because optional links are
advisory. A runtime target still may report optional relation effects as unsupported in the plan.

## Relation Outputs

| Output | Available when | Intended effects |
| --- | --- | --- |
| `endpoint-url` | Relation has a provider `endpoint` port with `protocol` | `inject-env`, `attach-telemetry` |
| `endpoint-host` | Relation has a provider `endpoint` port | `inject-env`, `private-service-discovery` |
| `endpoint-port` | Relation has a provider `endpoint` port | `inject-env` |
| `endpoint-scheme` | Relation has a provider `endpoint` port with protocol mappable to a scheme | `inject-env` |
| `service-name` | Relation links two components in one application bundle | `private-service-discovery` |
| `readiness-state` | Lifecycle relation has `order-after` or `readiness-gate` | `order-after`, `readiness-gate` |

## Core Graph Class Contract

`@appaloft/blueprints` exposes `BlueprintComponentRelationGraph` as the neutral core class for
component relation topology questions. The class owns only in-manifest component graph reasoning;
it does not execute deployments and does not know about installed application persistence.

The class exposes:

- `topologicalSortDescription`: a stable human-readable rule explaining that topological sort
  orders provider components before consumer components for required lifecycle relations, while
  relation direction remains `from` consumer/dependent to `to` provider/dependency.
- `topologicalSort()`: returns sorted component ids plus required and optional lifecycle edges, or
  a `required_lifecycle_cycle` error with cycle component ids and relation ids.
- `describeTopologicalSort()`: returns the same rule with the current sorted order or cycle.
- `requiredLifecycleEdges()` and `optionalLifecycleEdges()`: expose lifecycle topology edges for
  validators, plan compilers, and diagnostics.
- `relationOutputs(relation)`: returns the typed outputs available to a relation's effects.

## Install Plan Contract

The install plan compiler must keep component creation as component-driven operations and then add
neutral relation operations. It must not execute relation effects.

Required operation shape:

```ts
type BlueprintInstallOperation =
  | ExistingBlueprintInstallOperation
  | {
      kind: "configure-component-link";
      relationId: string;
      relationType: "endpoint" | "lifecycle" | "telemetry";
      fromComponentId: string;
      toComponentId: string;
      endpoint?: string;
      required: boolean;
      effects: BlueprintComponentRelationEffect[];
      outputs: BlueprintComponentRelationOutput[];
    };
```

The compiler should place `configure-component-link` after the provider and consumer component
resource/network configuration exists and before the `from` component deployment operation. When a
required lifecycle relation changes startup ordering, deployment operations should be emitted in a
topological order that satisfies required `order-after` links, or the plan must carry a
`readiness-gate` effect that an accepted execution path can enforce.

Effect lowering is still neutral:

- `inject-env`: set or plan a runtime variable on the `from` component from a relation output.
- `network-allow`: allow `from` to reach `to` through the selected private application network.
- `private-service-discovery`: expose a stable provider service name or host to `from`.
- `order-after`: make `from` start after `to` reaches the requested readiness state.
- `readiness-gate`: block `from` readiness until `to` reaches the requested readiness state.
- `attach-telemetry`: configure `from` to emit the selected signal to `to`.

## Application Bundle Plan Contract

`BlueprintApplicationBundlePlan.relationships` must preserve component links alongside existing
application/component/dependency relationships:

```ts
type BlueprintApplicationBundleRelationship =
  | ExistingBlueprintApplicationBundleRelationship
  | {
      kind: "component-links-component";
      relationId: string;
      relationType: "endpoint" | "lifecycle" | "telemetry";
      fromComponentId: string;
      toComponentId: string;
      endpoint?: string;
      required: boolean;
      effects: BlueprintComponentRelationEffect[];
    };
```

The bundle plan remains a dry-run planning artifact. It does not persist installed state and does
not own execution, rollback, upgrade, or audit semantics.

## Runtime Projection Contract

`@appaloft/blueprints` exposes `createBlueprintComponentRuntimeProjection()` to lower application
bundle component links into per-component runtime instructions without adding provider-specific
fields to the manifest.

The projection is intentionally serializable and target-neutral:

```ts
type BlueprintComponentRuntimePlan = {
  componentId: string;
  serviceName: string;
  networkName: string;
  injectedEnv: BlueprintComponentRuntimeInjectedEnv[];
  serviceDiscovery: BlueprintComponentRuntimeServiceDiscovery[];
  networkAllows: BlueprintComponentRuntimeNetworkAllow[];
  readinessGates: BlueprintComponentRuntimeReadinessGate[];
  telemetryAttachments: BlueprintComponentRuntimeTelemetryAttachment[];
};
```

The projection maps effects as follows:

- `inject-env` becomes an explicit runtime variable for the `from` component.
- `private-service-discovery` becomes a provider service name or host visible to the `from`
  component.
- `network-allow` becomes an application-private network allowance for the `from` component.
- `order-after` and `readiness-gate` become provider readiness gates for the `from` component.
- `attach-telemetry` becomes a telemetry signal attachment from the `from` component to the `to`
  component endpoint.

Runtime targets may consume the projection directly or through
`blueprintComponentRuntimePlanToMetadata()` /
`blueprintComponentRuntimePlanFromMetadata()`. Target-specific lowering can choose platform
commands, labels, env vars, networks, or readiness checks, but it must preserve the neutral
relation direction: `from` is the consumer/dependent and `to` is the provider/dependency.

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| BP-COMP-REL-SCHEMA-001 | Validate endpoint relation | A worker relation points from `worker` to `api` endpoint `http` | Manifest validation runs | Validation succeeds and preserves `required = true` plus `inject-env` effect. |
| BP-COMP-REL-SCHEMA-002 | Reject missing component | A relation references unknown component `api` | Manifest validation runs | Validation fails with a structured issue at `componentRelations`. |
| BP-COMP-REL-SCHEMA-003 | Reject missing endpoint | An endpoint relation names `endpoint: http` but the provider has no `http` port | Manifest validation runs | Validation fails without treating the endpoint as a dependency resource. |
| BP-COMP-REL-SCHEMA-004 | Reject required startup cycle | Required lifecycle relations create `api -> worker -> api` ordering | Manifest validation runs | Validation fails with a required lifecycle cycle issue. |
| BP-COMP-REL-SCHEMA-005 | Reject invalid effect output | An `inject-env` effect uses `endpoint-url` on a lifecycle relation with no endpoint | Manifest validation runs | Validation fails because the output is unavailable. |
| BP-COMP-REL-SCHEMA-006 | Reject duplicate relation id | Two relations share the same id | Manifest validation runs | Validation fails with a relation id uniqueness issue. |
| BP-COMP-REL-SCHEMA-007 | Reject dependency resource target | A relation points `to` a resource requirement such as `postgres` | Manifest validation runs | Validation fails and dependency resources continue through component dependency binding. |
| BP-COMP-REL-LOADER-001 | Load YAML component relations | A YAML Blueprint declares endpoint, lifecycle, and telemetry relations | The loader reads the file | The loaded manifest contains typed relation defaults and effects. |
| BP-COMP-REL-PLAN-001 | Compile endpoint relation into dry-run plan | A worker uses an API endpoint relation | The install plan compiler runs | Operations include `configure-component-link` and a neutral `inject-env` effect before worker deployment. |
| BP-COMP-REL-PLAN-002 | Compile lifecycle relation into ordering effect | A worker must start after API is healthy | The install plan compiler runs | Operations preserve a required `order-after` or `readiness-gate` effect and avoid required startup cycles. |
| BP-COMP-REL-BUNDLE-001 | Preserve relations in application bundle plan | A multi-component plan has endpoint and telemetry relations | The bundle plan compiler runs | Relationships include `component-links-component` entries without replacing component ownership. |
| BP-COMP-REL-SAMPLE-001 | Validate PocketBase plus bundled Jaeger sample | PocketBase and Jaeger are both components | Sample validation and dry-run planning run | PocketBase traces to the Jaeger component through a telemetry relation. |
| BP-COMP-REL-SAMPLE-002 | Validate OpenClaw-like multi-component sample | Web/API/worker components and a DB dependency are declared | Sample validation and dry-run planning run | Component relations connect web/worker to API while DB stays a dependency resource. |
| BP-COMP-REL-SAMPLE-003 | Validate worker readiness sample | Worker has a required lifecycle relation to API | Sample validation and dry-run planning run | The dry-run plan preserves readiness ordering. |
| BP-COMP-REL-RUNTIME-001 | Project relation effects for runtime targets | An application bundle contains endpoint, lifecycle, and telemetry relations | The runtime projection helper runs | Each consumer component gets neutral env, discovery, network, readiness, and telemetry instructions. |
| BP-COMP-REL-RUNTIME-002 | Consume relation projection in Docker Swarm target | A runtime plan carries one component runtime plan in metadata | Docker Swarm intent and apply plan rendering run | The target renders env injection, private networks, readiness wait steps, telemetry env, and relation labels. |

## Non-Goals

- No new public install execution command in this slice.
- No provider-specific networking, DNS, Docker, Swarm, Kubernetes, or telemetry SDK fields in the
  manifest. Provider-specific lowering belongs to runtime targets that consume the neutral
  projection.
- No persistence model for installed applications.
- No replacement for dependency resource provisioning, import, bind, backup, restore, or secret
  rotation flows.
- No ownership transfer from application-to-components to component-to-component relations.

## Implemented Gap Assessment

- Implemented: manifest and variant schemas include `componentRelations`.
- Implemented: validation covers relation ids, component references, dependency-resource
  non-targeting, endpoint references, effect output compatibility, duplicate injected env names, and
  required lifecycle cycles.
- Implemented: install plans emit `configure-component-link` and use
  `BlueprintComponentRelationGraph.topologicalSort()` for required lifecycle ordering.
- Implemented: application bundle relationships preserve `component-links-component`.
- Implemented: runtime projection lowers relation effects into per-component env, discovery,
  network, readiness, and telemetry instructions.
- Implemented: the Docker Swarm runtime target consumes the projection through metadata and renders
  concrete env, network, readiness, telemetry, and relation-label operations.
- Implemented: samples cover bundled Jaeger telemetry, OpenClaw-like endpoint links, and worker
  readiness.
- Deferred: additional runtime targets can adopt the same projection independently when they add
  provider-specific lowering.
