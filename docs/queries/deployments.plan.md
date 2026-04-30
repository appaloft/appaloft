# deployments.plan Query Spec

## Metadata

- Operation key: `deployments.plan`
- Query class: `DeploymentPlanQuery`
- Input schema: `DeploymentPlanQueryInput`
- Handler: `DeploymentPlanQueryHandler`
- Query service: `DeploymentPlanQueryService`
- Domain / bounded context: Release orchestration / workload planning read model
- Current status: active read-only query
- Source classification: normative contract

## Intent

`deployments.plan` previews the current `detect -> plan` result for a resource and deployment
target context before `deployments.create` starts execution.

It is a query only. It does not create a deployment attempt, persist a deployment snapshot, publish
deployment lifecycle events, or execute build/run/verify/proxy work.

## Governing Sources

- [Deployment Plan Preview Spec](../specs/013-deployment-plan-preview/spec.md)
- [Deployment Plan Preview Test Matrix](../testing/deployment-plan-preview-test-matrix.md)
- [Deployment Plan Preview Error Spec](../errors/deployments.plan.md)
- [Workload Framework Detection And Planning](../workflows/workload-framework-detection-and-planning.md)
- [Deployment Runtime Substrate Plan](../implementation/deployment-runtime-substrate-plan.md)
- ADR-010, ADR-012, ADR-014, ADR-016, ADR-021, ADR-023
- [Error Model](../errors/model.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Input

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

The input reuses deployment context references. It must not accept resource profile fields,
framework/base-image/buildpack fields, Docker/Kubernetes/Compose native fields, repository config
paths, or secret-bearing values.

## Output

The query returns:

```ts
type DeploymentPlanQueryResult = Result<DeploymentPlanPreview, DomainError>;
```

`DeploymentPlanPreview` uses schema version `deployments.plan/v1` and includes:

- context ids and safe labels;
- readiness status and reason codes;
- source inspection evidence;
- selected planner key and support tier;
- artifact kind and safe artifact summary;
- sanitized install/build/package/start command specs;
- internal port, exposure, target service, and health plan;
- access/proxy route planning summary when already available;
- warnings, unsupported reasons, next actions, and `generatedAt`.

## Failure Semantics

Whole-query `err` results are reserved for invalid input, missing/invisible context, permission
failure, or infrastructure failure that prevents a safe base response.

Planning blockers should usually return `ok(...)` with `readiness.status = "blocked"` and
structured `unsupportedReasons` so Web, CLI, and tools can show remediation without treating a
known unsupported plan as transport failure.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Resource new-deployment read-only plan preview. | Active |
| CLI | `appaloft deployments plan --project <id> --environment <id> --resource <id> --server <id> [--destination <id>] [--json]`. | Active |
| oRPC / HTTP | `GET /api/deployments/plan` using the query schema. | Active |
| Automation / MCP | Future read-only plan inspection tool over the same operation key. | Future |

## Current Implementation Notes And Migration Gaps

- `deployments.plan` is active across application, operation catalog, HTTP/oRPC, CLI, Web, public
  docs/help, and targeted contract coverage.
- The query shares the runtime planning boundary with `deployments.create` and stops before attempt
  creation, event publication, or runtime execution.
- Access plan summary may initially report unavailable when existing read models cannot provide a
  safe summary.
- Draft profile preview before `resources.create` remains out of scope.
