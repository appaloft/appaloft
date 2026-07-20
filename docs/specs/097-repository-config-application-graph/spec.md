# Repository Config Application Graph

## Status

- Round: Spec -> Test Matrix -> Code
- Artifact state: active public-neutral repository config workflow slice
- Operation keys: existing repository config entry workflows, `resources.create`,
  `deployments.create`

## Business Outcome

A repository config file can describe more than one named application entry in a provider-neutral
way. Operators can keep one source-adjacent file for a repository that contains an API, worker,
admin UI, or internal service, and a trusted entry workflow can expand that graph into explicit
Resource creation and ids-only deployment admission for each application.

This capability follows the same shape as Compose-oriented platforms: the committed file describes
the application topology, public exposure remains explicit, and private/internal workloads stay
private by default. It does not create a new deployment command, does not add deployment profile
fields to `deployments.create`, and does not encode hosted Cloud, billing, tenant, server, or
provider-account choices in public config.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Application graph | The named application map declared by `applications.<key>` in repository config. | Repository config | multi-app config, app graph |
| Application key | Stable repository-local key for one deployable Resource entry. | Repository config | app key, component key |
| Application entry | One declared Resource/profile/deployment draft inside the application graph. | Repository config | application, component |
| Shared application dependency | One top-level named managed dependency resource referenced by two or more application entries and bound separately to every consumer Resource. | Repository config / dependency resources | shared database, graph dependency |
| Primary application | The first sorted application entry used by single-deployment compatibility paths. | Repository config workflow | default app |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- |
| CONFIG-FILE-APPLICATION-GRAPH-001 | Parser accepts application graph | `appaloft.yml` declares `applications.api` and `applications.worker` | config parser runs | application key, resource metadata, source/runtime/network/health, env, secrets, and service graph fields are accepted without accepting broad identity or raw secret fields. |
| CONFIG-FILE-APPLICATION-GRAPH-002 | Parser rejects unsafe application graph | application key shape, required resource name, raw secret material, identity fields, or unsupported orchestration fields are invalid | config parser runs | parsing fails before mutation with config schema/identity/secret/capability errors. |
| CONFIG-FILE-APPLICATION-GRAPH-003 | Config snapshot preserves application entries | repository config reader loads an application graph | filesystem reader returns a config snapshot | each application entry carries its normalized Resource draft and requested deployment profile for workflow expansion. |
| CONFIG-FILE-APPLICATION-GRAPH-004 | CLI config workflow expands application graph | `appaloft deploy --config appaloft.yml` runs with application graph entries and trusted target context | CLI entry workflow resolves deployment inputs | each application entry is expanded into a Resource-specific ids-only `deployments.create` input; final deployment admission remains single-Resource and ids-only per application. |
| CONFIG-FILE-APPLICATION-GRAPH-005 | Parser accepts explicit dependency references | Top-level `dependencies.database` has a stable `resourceName`, while `applications.api.dependencies` and `applications.worker.dependencies` both reference `database` | config parser runs | The shared definition and each consumer reference are accepted and preserved without copying credentials or provider identity into config. |
| CONFIG-FILE-APPLICATION-GRAPH-006 | Parser rejects ambiguous dependency references | An application references an undefined or duplicate dependency, a definition is unreferenced, multiple applications reference a dependency without `resourceName`, or multiple applications share an ephemeral preview dependency | config parser runs | Parsing fails before mutation with a path-specific application-graph dependency error. |
| CONFIG-FILE-APPLICATION-GRAPH-007 | CLI reconciles one shared dependency for all consumers | API and worker reference the same named managed Postgres dependency | CLI config workflow expands the graph | The named dependency resource is provisioned at most once, each consumer Resource gets its own `DATABASE_URL` binding, non-consumers stay unbound, and each deployment remains ordinary ids-only admission. |
| CONFIG-FILE-APPLICATION-GRAPH-008 | CLI selects named applications | Config declares `api`, `site`, and `worker` applications | `appaloft deploy --application site` runs | Only the selected application is reconciled and deployed; omitting the option still deploys every application in stable key order, and repeating the option selects multiple applications. |
| CONFIG-FILE-APPLICATION-GRAPH-009 | CLI rejects an unknown application selector | Config declares `api` and the caller selects `missing` | CLI config workflow validates selection | The workflow fails before state initialization or mutation with the unknown and available application keys. |

## Domain Ownership

- Bounded context: Workload Delivery / repository config entry workflow.
- Aggregate owners: `Resource` owns each deployable unit and its source/runtime/network/profile
  state. `Deployment` owns one attempt for one Resource.
- Repository config owns only source-adjacent desired profile input. It must not become the identity
  owner for project, environment, server, destination, credential, organization, or tenant
  selection.
- Application graph expansion is an entry workflow over explicit operations, not a new aggregate,
  not a command shortcut, and not a hidden cross-Resource transaction.

## Public Surfaces

- Repository config: `applications.<key>` is a map. Keys must be lowercase stable identifiers.
- Each entry must declare `resource.name`. Supported application-entry fields in this slice are
  `resource`, `source`, `runtime`, `network`, `health`, `access`, `env`, `secrets`, `services`, and
  dependency-key references under `dependencies`.
- Top-level `dependencies.<key>` remains the single dependency definition. `resourceName` is an
  optional stable managed dependency display name for one consumer and is required when the same
  dependency key is referenced by multiple application entries. Application entries reference the
  key; they never duplicate the definition or carry a dependency resource id.
- In an application graph, every top-level dependency must be referenced by at least one
  application, every reference must resolve to a top-level definition, and one application cannot
  repeat the same key. This prevents silently ignored or duplicated dependency declarations.
- A dependency with `preview.lifecycle: ephemeral` may have only one application consumer. Shared
  preview dependency lifecycle and cleanup semantics remain unsupported and fail before mutation.
- CLI config deploy may expand application entries into multiple Resource-specific deployment
  inputs and execute them sequentially through the existing `deployments.create` command.
- CLI config deploy may repeat `--application <key>` to select a subset of declared application
  entries. No selector preserves the all-applications behavior. Every selected key must exist, and
  selection validation completes before state initialization or mutation.
- API/HTTP: no new deployment input is added. `deployments.create` stays ids-only and single
  Resource scoped.
- Runtime planning: each application entry uses its own Resource profile. If an entry also declares
  `services.<key>`, the existing Resource service graph planning rules apply within that Resource.
- Web/UI: application graph editing and readback are later surfaces.

## Non-Goals

- Atomic cross-Resource releases, rollback, health gates, dependency startup ordering, or release
  groups. Shared dependency reconciliation is sequential and idempotent, not transactional.
- Provider-specific Compose project settings, Kubernetes manifests, Helm, Cloud billing, hosted
  worker topology, tenant placement, or plan limits.
- Selecting durable identity such as project id, resource id, server id, destination id, credential
  id, organization id, provider account, registry credential, or secret store in committed config.
- Adding application graph fields to `deployments.create`.

## Migration Gaps

- The first slice expands application entries in trusted CLI/config workflows. Action/server-side
  config package expansion, Web affordances, cross-Resource dependency ordering, and durable
  release-group semantics remain later specs.
- Existing Resource profile drift remains Resource-scoped. A later reconciliation command can make
  application graph updates idempotent for existing Resources without weakening drift safety.
