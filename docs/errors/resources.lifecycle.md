# Resource Lifecycle Error Spec

## Normative Contract

Resource lifecycle commands and queries use the shared platform error model and neverthrow
conventions. This file defines the resource-specific error profile for `resources.create`,
`resources.show`, `resources.configure-source`, `resources.configure-runtime`,
`resources.configure-network`, `resources.configure-health`, `resources.archive`,
`resources.delete`, and the minimum resource lifecycle.

Resource errors must use stable `code`, `category`, `phase`, `retriable`, and related entity details. They must not rely on message text as the contract.

## Global References

This spec inherits:

- [ADR-011: Resource Create Minimum Lifecycle](../decisions/ADR-011-resource-create-minimum-lifecycle.md)
- [ADR-012: Resource Runtime Profile And Deployment Snapshot Boundary](../decisions/ADR-012-resource-runtime-profile-and-deployment-snapshot-boundary.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [Resource Profile Lifecycle](../workflows/resource-profile-lifecycle.md)
- [Repository Deployment Config File Bootstrap](../workflows/deployment-config-file-bootstrap.md)
- [Error Model](./model.md)
- [neverthrow Conventions](./neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Error Details

```ts
type ResourceDeletionBlockerKind =
  | "active-resource"
  | "deployment-history"
  | "runtime-instance"
  | "domain-binding"
  | "certificate"
  | "source-link"
  | "dependency-binding"
  | "terminal-session"
  | "runtime-log-retention"
  | "audit-retention"
  | "generated-access-route"
  | "server-applied-route"
  | "proxy-route";

type ResourceLifecycleErrorDetails = {
  commandName?:
    | "resources.create"
    | "resources.configure-source"
    | "resources.configure-runtime"
    | "resources.configure-network"
    | "resources.configure-health"
    | "resources.archive"
    | "resources.delete";
  queryName?: "resources.show";
  eventName?:
    | "resource-created"
    | "resource-source-configured"
    | "resource-runtime-configured"
    | "resource-network-configured"
    | "resource-health-policy-configured"
    | "resource-archived"
    | "resource-deleted";
  phase:
    | "command-validation"
    | "query-validation"
    | "context-resolution"
    | "resource-read"
    | "resource-admission"
    | "resource-source-resolution"
    | "resource-runtime-resolution"
    | "resource-network-resolution"
    | "health-policy-resolution"
    | "resource-lifecycle-guard"
    | "resource-deletion-guard"
    | "config-identity"
    | "config-secret-validation"
    | "config-profile-resolution"
    | "resource-persistence"
    | "event-publication"
    | "event-consumption";
  step?: string;
  projectId?: string;
  environmentId?: string;
  destinationId?: string;
  resourceId?: string;
  resourceSlug?: string;
  resourceKind?: string;
  archivedAt?: string;
  archiveReason?: string;
  sourceKind?: string;
  sourceLocator?: string;
  gitRef?: string;
  baseDirectory?: string;
  dockerfilePath?: string;
  dockerComposeFilePath?: string;
  publishDirectory?: string;
  imageName?: string;
  imageTag?: string;
  imageDigest?: string;
  internalPort?: number;
  healthCheckPath?: string;
  healthCheckType?: "http";
  healthCheckEnabled?: boolean;
  exposureMode?: "none" | "reverse-proxy" | "direct-port";
  upstreamProtocol?: "http" | "tcp";
  targetServiceName?: string;
  lifecycleStatus?: "active" | "archived" | "deleted";
  deletedAt?: string;
  deletionBlockers?: ResourceDeletionBlockerKind[];
  relatedEntityId?: string;
  relatedEntityType?:
    | "project"
    | "environment"
    | "destination"
    | "resource"
    | "deployment"
    | "domain-binding"
    | "certificate"
    | "source-link"
    | "runtime-instance"
    | "terminal-session";
  relatedState?: string;
  correlationId?: string;
  causationId?: string;
};
```

Error details must not include secrets, source credentials, deployment logs, environment secret values, or provider credentials.

## Admission Errors

Admission errors reject `resources.create` and return `err(DomainError)`.

| Error code | Category | Phase | Retriable | Meaning |
| --- | --- | --- | --- | --- |
| `validation_error` | `validation` | `command-validation` | No | Input shape, resource name, resource kind, service name, service kind, or description is invalid. |
| `not_found` | `not-found` | `context-resolution` | No | Project, environment, or destination cannot be found or is not visible. |
| `resource_context_mismatch` | `application` | `context-resolution` | No | Environment or destination does not match the supplied project/environment context. |
| `resource_slug_conflict` | `conflict` | `resource-admission` | No | A resource with the same slug already exists in the same project/environment. |
| `invariant_violation` | `domain` | `resource-admission` | No | Resource aggregate rule rejected the requested state. |
| `validation_error` | `validation` | `resource-source-resolution` | No | Source variant metadata is invalid, such as an uncloneable deep Git URL, ambiguous Git ref/base-directory split, invalid source-relative path, or invalid Docker image tag/digest pair. |
| `validation_error` | `validation` | `resource-runtime-resolution` | No | Runtime profile strategy or strategy-specific fields are invalid, such as missing or unsafe static publish directory. |
| `validation_error` | `validation` | `resource-network-resolution` | No | Resource network profile is missing, invalid, or ambiguous for an inbound resource endpoint. |
| `validation_error` | `validation` | `health-policy-resolution` | No | Resource health policy is missing required HTTP fields, has invalid probe fields, or requests an unsupported policy type. |
| `validation_error` | `validation` | `config-identity`, `config-secret-validation`, `config-profile-resolution` | No | Repository config file profile input cannot be safely mapped into `resources.create`. Error details must identify safe field paths only and must not include secret values. |
| `infra_error` | `infra` | `resource-persistence` | Conditional | Persistence failed before the resource could be safely created. |
| `infra_error` | `infra` | `event-publication` | Conditional | Event publication or outbox recording failed before command success could be safely returned. |

## Profile Lifecycle Errors

These errors apply to `resources.show`, `resources.configure-source`, `resources.configure-runtime`,
`resources.configure-network`, `resources.configure-health`, `resources.archive`,
`resources.delete`, and `deployments.create` where deployment admission reads resource lifecycle
state.

| Error code | Category | Phase | Retriable | Meaning |
| --- | --- | --- | --- | --- |
| `validation_error` | `validation` | `query-validation` | No | `resources.show` input is invalid. |
| `not_found` | `not-found` | `resource-read` | No | Resource cannot be found or is not visible. |
| `infra_error` | `infra` | `resource-read` | Conditional | Resource detail read model cannot be safely read or assembled. |
| `validation_error` | `validation` | `command-validation` | No | Profile command input shape, idempotency key, confirmation value, or lifecycle reason is invalid. |
| `resource_archived` | `conflict` | `resource-lifecycle-guard` | No | A source, runtime, network, health, or deployment command targeted an archived resource. |
| `invariant_violation` | `domain` | `resource-lifecycle-guard` | No | Resource aggregate lifecycle transition rejected the requested change. |
| `validation_error` | `validation` | `resource-source-resolution` | No | Source profile update is invalid, ambiguous, unsafe, or contains forbidden secret/credential material. |
| `validation_error` | `validation` | `resource-runtime-resolution` | No | Runtime profile update is invalid, unsafe, includes health-policy mutation, or includes unsupported runtime target fields. |
| `validation_error` | `validation` | `resource-network-resolution` | No | Network profile update is invalid, unsafe, missing required endpoint data, or requests unsupported direct-port exposure. |
| `resource_delete_blocked` | `conflict` | `resource-deletion-guard` | No | Delete was requested for an active resource or an archived resource with retained blockers such as deployments, runtime instances, source links, domain bindings, certificates, terminal sessions, dependency bindings, routes, logs, or audit requirements. |
| `validation_error` | `validation` | `resource-deletion-guard` | No | Delete confirmation did not match the resource slug. |
| `infra_error` | `infra` | `resource-persistence` | Conditional | Profile/lifecycle state could not be safely persisted. |
| `infra_error` | `infra` | `event-publication` | Conditional | Profile/lifecycle event publication or outbox recording failed before command success could be safely returned. |

## Async Error Profile

`resources.create` and the profile lifecycle mutation commands are synchronous resource-state
commands. They do not start long-running resource provisioning in the minimum lifecycle.

Event consumer failures after a resource lifecycle event is recorded are projection/event-processing
failures. They must not reinterpret the original command result.

| Error condition | Required representation | Retriable |
| --- | --- | --- |
| Read-model projection fails after resource lifecycle event | Event consumer monitoring records `phase = event-consumption`; resource command result remains accepted. | Yes when projection can be retried. |
| Duplicate event consumed | Consumer returns `ok` or no-op; resource read model is not duplicated. | Not applicable |
| Event publication cannot be recorded before command success | Command returns `err` with `code = infra_error`, `phase = event-publication`. | Conditional |

## Consumer Mapping

Web, CLI, HTTP API, workers, and tests must use [Error Model](./model.md).

Resource consumers additionally must:

- show duplicate resource-name failures as slug conflicts;
- distinguish missing project/environment/destination from context mismatch;
- distinguish invalid source variant configuration from runtime-plan failure;
- distinguish invalid resource listener port from deployment runtime failure;
- distinguish archived-resource guards from missing resources;
- distinguish delete blockers from validation failures;
- avoid retry affordances for validation, not-found, conflict, and invariant errors;
- expose `resourceId`, `projectId`, `environmentId`, and `resourceSlug` in structured debug/test contexts when available.

## Test Assertions

Tests must assert:

- `Result` shape;
- `error.code`;
- `error.category`;
- `error.retriable`;
- `phase`;
- related entity ids and resource slug when relevant;
- source variant fields such as `sourceKind`, `gitRef`, `baseDirectory`, `imageTag`, or
  `imageDigest` when a source profile error is relevant;
- runtime variant fields such as `runtimePlanStrategy`, `dockerfilePath`, `dockerComposeFilePath`,
  or `publishDirectory` when a runtime profile error is relevant;
- `internalPort`, `exposureMode`, and `targetServiceName` when a network profile error is relevant;
- `lifecycleStatus` when archived-resource or deletion guard behavior is relevant;
- safe `deletionBlockers` when `resource_delete_blocked` is relevant;
- no resource persisted on admission failure;
- no duplicate read-model or audit effect on duplicate resource lifecycle event consumption.

## Current Implementation Notes And Migration Gaps

Current core/resource value objects and aggregate operations already return `Result` for validation and invariant failures.

Current resource creation can happen inside deployment bootstrap, where errors are currently surfaced through deployment admission phases rather than `resources.create` phases.

`resources.create` command-level error mapping is implemented for validation, not found, context mismatch, slug conflict, invariant, and infra failures. Transport and UI tests for those mappings are still pending.

Current code stores listener port under `networkProfile.internalPort`. [ADR-015](../decisions/ADR-015-resource-network-profile.md) governs resource network profile error phases.

Current code does not yet have typed source variant validation for `resource-source-resolution`.
Until implemented, many invalid source variant cases may be accepted as generic source metadata and
fail later during source detection, Git clone, Docker image pull, or runtime plan resolution.

`resources.show`, `resources.configure-source`, `resources.configure-runtime`, and
`resources.configure-network` are active public surfaces with focused command/query, HTTP/oRPC, CLI
or Web coverage in the resource profile lifecycle slice.

`resources.archive` is an active public surface with `resource_archived` guard coverage for
source/runtime/network/health configuration and deployment admission. `resources.delete` is active
with `resource_delete_blocked`, confirmation mismatch, deleted/tombstone lifecycle state, normal
read-model omission, and `resource-deleted` publication coverage.

## Open Questions

- None for the minimum lifecycle.
