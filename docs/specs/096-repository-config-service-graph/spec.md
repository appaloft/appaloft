# Repository Config Service Graph

## Status

- Round: Spec -> Test Matrix -> Code
- Artifact state: active public-neutral foundation slice
- Operation keys: existing repository config entry workflows, `resources.create`,
  `deployments.create`

## Business Outcome

A repository config file can describe more than one named runnable service in a provider-neutral
way. Operators can commit one service graph for a web process, worker process, API service, or
private/internal service without putting project, server, destination, credential, or Cloud-specific
identity into the repository.

This foundation keeps current deployment admission ids-only. It lets first-run config bootstrap
create a Resource with declared service metadata, while later runtime-target work can turn the same
service graph into multiple candidate containers, Compose services, process groups, or provider
services.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Service graph | The named service map declared by `services.<key>` in repository config. | Repository config | process graph, app services |
| Service key | Stable repository-local key for one named service. | Repository config | service name |
| Service role | Provider-neutral kind such as `web`, `api`, `worker`, `database`, `cache`, or `service`. | Resource profile | process type |
| Public service | A service whose network profile exposes traffic through reverse proxy or direct port. | Network profile | web service |
| Internal service | A service with `exposureMode = none`. | Network profile | private service, worker |
| Service replicas | Requested process count for one service key. | Runtime target planning | scale, instances |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- |
| CONFIG-FILE-SERVICE-GRAPH-001 | Parser accepts service graph | `appaloft.yml` declares `services.web` and `services.worker` | config parser runs | service kind, runtime, network, health, replicas, env, and secret references are accepted without accepting broad identity or raw secret fields. |
| CONFIG-FILE-SERVICE-GRAPH-002 | Parser rejects unsafe service graph | service key shape, required kind, secret material, or unsupported target fields are invalid | config parser runs | parsing fails before mutation with config schema/secret/capability errors. |
| CONFIG-FILE-SERVICE-GRAPH-003 | First-run config creates Resource service metadata | no existing Resource is selected and config declares multiple services | config deploy bootstraps Resource identity | `resources.create` receives `kind = compose-stack`, declared service names/kinds, source/runtime/network profile, and final `deployments.create` remains ids-only. |
| CONFIG-FILE-SERVICE-GRAPH-004 | Existing Resource service drift blocks deployment | selected Resource service metadata differs from config services | config deploy runs without an accepted service reconciliation operation | workflow fails at `resource-profile-resolution` with `resource_profile_drift` instead of silently ignoring the graph. |

## Domain Ownership

- Bounded context: Workload Delivery / Resource profile bootstrap.
- Aggregate owner: `Resource` owns declared service metadata and current service-cardinality
  invariants.
- Repository config owns only the entry workflow profile input. It must not become the identity
  owner for project/resource/server/destination selection.
- Runtime adapters will later consume a snapshot of the service graph during deployment planning;
  adapters must not infer Cloud-only worker topology from public config names.

## Public Surfaces

- Repository config: `services.<key>` is a map. Keys must be lowercase stable identifiers. Each
  entry must declare `kind`.
- Supported service fields in this foundation slice: `kind`, `source`, `runtime`, `network`,
  `health`, `replicas`, `env`, and `secrets`.
- CLI config deploy: first-run Resource creation stores service name/kind metadata; existing
  Resource drift is blocking.
- API/HTTP: no new deployment input is added. `deployments.create` stays ids-only.
- Web/UI and runtime execution: deferred. The current Resource detail already reads service
  metadata, but service-specific deployment execution and editing require later specs.

## Non-Goals

- Creating multiple Appaloft Resources from one config file.
- Starting multiple runtime containers/processes from this slice alone.
- Allowing top-level CPU, memory, restart, rollout, autoscaling, or broad target sizing fields.
- Cloud billing, entitlement, plan limits, or hosted worker topology.
- Kubernetes manifests, Helm, provider-specific service classes, or Cloud-only deployment groups.

## Migration Gaps

- `services.<key>.runtime`, `services.<key>.network`, `services.<key>.source`, and
  `services.<key>.replicas` are parsed and preserved in the public config schema, but runtime
  execution still uses the existing Resource runtime/network profile until a service-graph
  deployment planning spec maps service entries into runtime intents.
- Non-Compose multi-process execution needs a later ADR/spec to decide whether Appaloft models the
  service graph as one Resource with multiple runtime services, multiple Resources coordinated by a
  release workflow, or both.
