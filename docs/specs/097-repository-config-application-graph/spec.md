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
| Primary application | The first sorted application entry used by single-deployment compatibility paths. | Repository config workflow | default app |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- |
| CONFIG-FILE-APPLICATION-GRAPH-001 | Parser accepts application graph | `appaloft.yml` declares `applications.api` and `applications.worker` | config parser runs | application key, resource metadata, source/runtime/network/health, env, secrets, and service graph fields are accepted without accepting broad identity or raw secret fields. |
| CONFIG-FILE-APPLICATION-GRAPH-002 | Parser rejects unsafe application graph | application key shape, required resource name, raw secret material, identity fields, or unsupported orchestration fields are invalid | config parser runs | parsing fails before mutation with config schema/identity/secret/capability errors. |
| CONFIG-FILE-APPLICATION-GRAPH-003 | Config snapshot preserves application entries | repository config reader loads an application graph | filesystem reader returns a config snapshot | each application entry carries its normalized Resource draft and requested deployment profile for workflow expansion. |
| CONFIG-FILE-APPLICATION-GRAPH-004 | CLI config workflow expands application graph | `appaloft deploy --config appaloft.yml` runs with application graph entries and trusted target context | CLI entry workflow resolves deployment inputs | each application entry is expanded into a Resource-specific ids-only `deployments.create` input; final deployment admission remains single-Resource and ids-only per application. |

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
  `resource`, `source`, `runtime`, `network`, `health`, `access`, `env`, `secrets`, and `services`.
- CLI config deploy may expand application entries into multiple Resource-specific deployment
  inputs and execute them sequentially through the existing `deployments.create` command.
- API/HTTP: no new deployment input is added. `deployments.create` stays ids-only and single
  Resource scoped.
- Runtime planning: each application entry uses its own Resource profile. If an entry also declares
  `services.<key>`, the existing Resource service graph planning rules apply within that Resource.
- Web/UI: application graph editing and readback are later surfaces.

## Non-Goals

- Atomic cross-Resource releases, rollback, health gates, dependency ordering, or release groups.
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
