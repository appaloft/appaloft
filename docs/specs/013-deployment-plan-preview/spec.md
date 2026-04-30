# Deployment Plan Preview

## Status

- Round: Spec Round
- Artifact state: planned public read-only query; Code Round pending
- Roadmap target: Phase 5 First-Deploy Engine And Framework Breadth (`0.7.0` gate)
- Compatibility impact: `pre-1.0-policy`; adds a public read surface for deployment planning output

## Business Outcome

Operators can preview what Appaloft will detect and plan before they start a deployment.

The preview makes the `detect -> plan` portion of the deployment model visible across Web, CLI,
HTTP/oRPC, and future MCP/tool surfaces. It helps users fix resource source, runtime, network,
health, and access configuration before `deployments.create` admits and executes an attempt.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Deployment plan preview | Read-only result of resolving a resource profile into source evidence, planner choice, artifact intent, runtime commands, network, health, and access planning summaries. | Release orchestration / workload planning | plan preview, pre-deploy plan |
| Plan readiness | Whether the current resource profile can produce an executable Docker/OCI-backed deployment plan. | Query output | plan status |
| Source inspection evidence | Typed detection facts from the selected source root, such as framework, runtime family, package manager, scripts, lockfiles, and output paths. | Workload planning | detected framework/runtime evidence |
| Planner key | Stable key for the selected framework/runtime planner. | Workload planning | selected planner |
| Support tier | User-visible support classification for the selected planner or unsupported evidence. | Workload planning | planner support |
| Artifact kind | Provider-neutral result kind: Dockerfile image, static-server image, Compose project, prebuilt image, or custom command image. | Runtime artifact planning | planned artifact |
| Command spec | Sanitized install/build/start/package command intent. | Runtime plan output | command preview |

## Operation Boundary

This Spec Round accepts one public operation boundary:

| Operation | Kind | Role | Code Round state |
| --- | --- | --- | --- |
| `deployments.plan` | Query | Read the current resource profile and selected target context, run source inspection and runtime planning, and return a safe plan preview without execution. | Pending active query. |

`deployments.plan` is read-only. It must not:

- create a deployment attempt;
- persist a plan record or immutable deployment snapshot;
- publish `deployment-requested`, `build-requested`, `deployment-started`, `deployment-succeeded`,
  or `deployment-failed`;
- run install, build, start, verify, Docker, Compose, SSH, proxy, or health-check commands;
- mutate resource, environment, server, route, source-link, runtime, or deployment state;
- reserve runtime capacity or acquire long-running deployment coordination locks;
- accept source/runtime/network/profile fields that belong to `resources.create` or resource
  configuration commands;
- weaken `deployments.create` as the only general deployment-attempt admission command.

The query may materialize or inspect an already configured source through the same safe source
inspection boundary used by deployment planning. If a source cannot be inspected without executing
untrusted code or mutating state, the query returns structured unsupported/missing evidence rather
than executing the source.

## ADR Decision

No new ADR is required for this behavior.

Rationale:

- ADR-012 already places reusable source/runtime/network profile state on Resource and immutable
  attempt snapshots on Deployment.
- ADR-014 keeps `deployments.create` ids-only and allows detection to enrich planning from the
  Resource profile.
- ADR-016 limits public deployment write commands, but does not prohibit read-only deployment
  planning queries.
- ADR-021 already defines `detect -> plan -> execute -> verify -> rollback` and requires v1 plans
  to resolve Docker/OCI-backed artifact intent.
- ADR-023 keeps target-specific execution/rendering behind runtime target backends.

A new ADR is required before this operation persists plan records, changes deployment admission,
adds public target/orchestrator fields, accepts deployment-owned source/runtime/network fields, or
supports non-Docker runtime substrates.

## Input Model

```ts
type DeploymentPlanQueryInput = {
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId?: string;
  includeAccessPlan?: boolean;
  includeCommandSpecs?: boolean;
};
```

Rules:

- The input uses the same deployment context reference set as `deployments.create`.
- `destinationId` follows the existing default-destination compatibility seam.
- `includeAccessPlan` defaults to `true` for Web/CLI surfaces when route planning data is
  available.
- `includeCommandSpecs` defaults to `true` for CLI/API and may be compacted in Web.
- The input must not accept source locators, runtime commands, ports, health paths, Docker options,
  framework names, package names, base images, buildpack names, Kubernetes fields, or repository
  config paths.

## Output Contract

```ts
type DeploymentPlanPreview = {
  schemaVersion: "deployments.plan/v1";
  planId?: never;
  context: DeploymentPlanContext;
  readiness: DeploymentPlanReadiness;
  source: DeploymentPlanSourceSummary;
  planner: DeploymentPlanPlannerSummary;
  artifact: DeploymentPlanArtifactSummary;
  commands: DeploymentPlanCommandSummary[];
  network: DeploymentPlanNetworkSummary;
  health: DeploymentPlanHealthSummary;
  access?: DeploymentPlanAccessSummary;
  warnings: DeploymentPlanWarning[];
  unsupportedReasons: DeploymentPlanUnsupportedReason[];
  nextActions: DeploymentPlanNextAction[];
  generatedAt: string;
};
```

Required user-visible output:

- detected framework/runtime evidence, including runtime family, framework, package manager or build
  tool, project name when safe, scripts, lockfiles, runtime version, output paths, Dockerfile path,
  Compose path, and base directory evidence when available;
- selected `plannerKey` and support tier;
- planned artifact kind: Dockerfile image, static-server image, Compose project, prebuilt image, or
  custom command image;
- install, build, package, and start command specs as sanitized command intent, not adapter-native
  Docker SDK details;
- internal port, upstream protocol, exposure mode, host port only when direct exposure is already
  part of the resource network profile, and Compose target service when relevant;
- health plan including probe path/protocol/port source and whether it is inferred or explicit;
- generated/default access, durable domain, or server-applied route planning summary when the
  existing access planning read surfaces can provide it;
- warnings and structured unsupported reasons with stable reason codes and safe remediation;
- next actions that point to resource configuration commands, Quick Deploy draft edits, docs, or
  `deployments.create` only when readiness is ready.

Secret values, raw environment values, private source credentials, registry credentials, raw command
output, provider SDK responses, Docker daemon responses, and unbounded logs must not appear in the
preview.

## Readiness And Reason Codes

`readiness.status` is one of:

- `ready`: the current resource/context can produce a Docker/OCI-backed runtime plan.
- `blocked`: the plan cannot be produced until the user fixes required input or unsupported
  evidence.
- `warning`: a plan can be produced but carries non-fatal warnings.

Initial stable unsupported or blocked reason codes:

- `resource-source-missing`
- `resource-source-unnormalized`
- `runtime-profile-missing`
- `network-profile-missing`
- `internal-port-missing`
- `static-publish-directory-missing`
- `compose-target-service-missing`
- `unsupported-framework`
- `ambiguous-framework`
- `missing-production-start-command`
- `missing-static-output`
- `incompatible-source-strategy`
- `runtime-target-unsupported`
- `access-plan-unavailable`

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| DPP-SPEC-001 | Successful supported plan | Resource has source/runtime/network profile and selected target supports the plan | User requests `deployments.plan` | Result is `ready`, includes evidence, planner, artifact, commands, network, health, access summary, and no attempt id. |
| DPP-SPEC-002 | Unsupported framework | Source inspection detects a framework/runtime family with no planner and no explicit fallback commands | User requests plan | Result is `blocked` with `unsupported-framework` and suggests explicit commands or resource runtime configuration. |
| DPP-SPEC-003 | Missing command or static output | Inbound/static plan lacks production start command or publish directory | User requests plan | Result is `blocked` with `missing-production-start-command` or `missing-static-output`. |
| DPP-SPEC-004 | Dockerfile path | Runtime profile selects Dockerfile strategy | User requests plan | Artifact kind is Dockerfile image and command summary describes image build intent without executing Docker. |
| DPP-SPEC-005 | Compose path | Runtime profile selects Compose strategy | User requests plan | Artifact kind is Compose project, target service/network summary is visible, and no Compose command runs. |
| DPP-SPEC-006 | Prebuilt image | Source/runtime profile selects prebuilt image | User requests plan | Artifact kind is prebuilt image, image identity is sanitized, and build commands are absent. |
| DPP-SPEC-007 | Custom command fallback | Runtime profile provides explicit install/build/start commands | User requests plan | Planner reports custom command image intent and returns sanitized command specs. |
| DPP-SPEC-008 | Entrypoint parity | Web, CLI, HTTP/oRPC, and future MCP/tool ask for the same ids | Each surface calls the query | They receive the same schema and do not reimplement planner rules locally. |

## Public Surfaces

- Web: Quick Deploy or resource detail can show a read-only plan preview before dispatching
  `deployments.create`.
- CLI: `appaloft deployments plan --project <id> --environment <id> --resource <id> --server <id>
  [--destination <id>] [--json]`.
- HTTP/oRPC: `GET /api/deployments/plan` or equivalent oRPC query using the shared input schema.
- Future MCP/tool: read-only deployment planning tool mapped to `deployments.plan`.
- Public docs/help: deploy page anchor `deployment-plan-preview`.

## Domain Ownership

- Bounded context: Release orchestration with workload-delivery planning input.
- Resource owns reusable source/runtime/network/health/access profile state.
- Deployment owns admitted attempts and immutable snapshots only after `deployments.create`.
- Runtime target adapters own rendered Docker/Compose/SSH execution details; the preview reports
  provider-neutral command/artifact intent only.

## Non-Goals

- Do not implement retry, redeploy, rollback, cancel, manual health check, or cleanup behavior.
- Do not execute build/run/verify/proxy work.
- Do not persist deployment plan records.
- Do not add `source`, `deploymentMethod`, runtime commands, ports, domains, or TLS fields back to
  `deployments.create`.
- Do not introduce provider SDK, Docker SDK, Kubernetes, or framework package types into core.

## Current Implementation Notes And Migration Gaps

- Current `deployments.create` already resolves runtime plans, but its result is observable only
  after admission/execution starts.
- Runtime command specs still include compatibility shell-script leaves for user-authored
  install/build/start steps.
- Some access route planning data is available through resource access/proxy read models; the first
  plan preview may report access summary as unavailable rather than recomputing every route branch.
- Full future MCP/tool descriptors remain a follow-up after the operation catalog entry is active.

## Open Questions

- Should a future `deployments.plan` support a trusted draft profile preview before resource
  persistence, or should draft preview stay inside Quick Deploy until draft-profile specs exist?
