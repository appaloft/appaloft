# deployments.create Workflow Spec

## Normative Contract

All entry points must converge on the same `deployments.create` command semantics.

Entry workflows may differ in input collection, but they must not implement separate deployment business rules. Command success means request accepted; deployment execution proceeds through the async lifecycle contract.

## Global References

This workflow inherits:

- [ADR-001: deployments.create HTTP API Required Fields](../decisions/ADR-001-deploy-api-required-fields.md)
- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-010: Quick Deploy Workflow Boundary](../decisions/ADR-010-quick-deploy-workflow-boundary.md)
- [ADR-014: Deployment Admission Uses Resource Profile](../decisions/ADR-014-deployment-admission-uses-resource-profile.md)
- [ADR-015: Resource Network Profile](../decisions/ADR-015-resource-network-profile.md)
- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

This file defines the deployment-specific workflow sequence and entry boundaries.

## End-To-End Workflow

```text
user intent
  -> entry-specific input collection
  -> explicit project/environment/server/resource selection or creation
  -> explicit deployments.create command input with ids only
  -> command admission
  -> resolve resource network/access snapshots from resource, server, domain, and default access policy state
  -> deployment-requested
  -> build-requested, when build/package work is required
  -> deployment-started
  -> runtime adapter materializes proxy route config when the snapshot contains generated or durable access routes
  -> deployment-succeeded | deployment-failed
  -> read model / progress view / notifications update from durable state and events
```

Prebuilt image deployments skip `build-requested` unless artifact verification is modeled separately.

Post-acceptance runtime/build/deploy/verify failure persists failed state, publishes `deployment-failed`, and is exposed through read models/progress views.

Retry is an explicit retry command or job that creates a new deployment attempt.

## Web Workflow

Web may:

- collect source/project/server/environment/resource input through UI;
- run UX preflight validation;
- run Quick Deploy as an input collection workflow governed by [ADR-010](../decisions/ADR-010-quick-deploy-workflow-boundary.md);
- create/select related records before deployment through their own explicit commands;
- show progress and read-model state after command acceptance.

Web must not:

- treat UI wizard steps as domain rules;
- hardcode business semantics that differ from CLI/API;
- interpret local validation errors as the final command contract;
- hide runtime failure outside durable deployment/read-model state.

## CLI Workflow

CLI may:

- accept non-interactive flags/options;
- prompt interactively when TTY is available as the CLI form of the Quick Deploy workflow;
- create/select related records through their own explicit commands before deployment;
- print progress and final read-model state.

CLI must not:

- dispatch an incomplete `deployments.create` command outside a documented input-collection workflow;
- implement deployment semantics that differ from API/Web;
- treat prompt choices as aggregate invariants.

## API Workflow

API is strict and non-interactive.

API must:

- accept the shared command input schema;
- return structured errors for admission failures;
- return acceptance for accepted requests;
- expose follow-up deployment state through query/read-model endpoints or stream/progress APIs.

API must not prompt or define transport-only deployment input shapes.

## Stream / Progress Workflow

Progress streams are technical/UI progress, not domain events.

They may mirror phases such as detect, plan, package, deploy, verify, or rollback, but durable state and formal events remain the source of truth.

## Missing Input Behavior

| Missing data | Workflow contract |
| --- | --- |
| Resource source binding | Entry workflow must create or select a resource with source binding before deployment admission, or command validation rejects in phase `resource-source-resolution`. |
| Resource source variant metadata | Entry workflow must normalize deep Git URLs, Git refs, source base directories, local-folder subdirectories, Docker image tag/digest identity, and artifact extraction roots into `ResourceSourceBinding` before deployment admission. Deployment admission must not guess source variants from raw UI URLs. |
| Resource runtime profile | Entry workflow may create a resource with runtime profile; if omitted, deployment planning uses the resource/default runtime strategy contract. |
| Strategy-specific build file paths | Entry workflow must persist Dockerfile path, Docker Compose file path, static publish directory, and command defaults as resource runtime profile fields. Deployment admission combines these fields with the source binding base directory during runtime plan resolution. |
| Resource network profile | Entry workflow must create or select an inbound resource with `networkProfile.internalPort`, or deployment admission rejects in phase `resource-network-resolution`. |
| project/environment/server/destination/resource context | Entry workflow may collect/create required context; destination may use the compatibility default seam; command admission rejects if still unresolved or inconsistent. |
| Generated default access | Entry workflow does not collect provider-specific generated-domain settings. Deployment route resolution uses configured policy and the provider-neutral default access domain port. |
| Domain/TLS intent | Entry workflow must use `domain-bindings.create` and certificate commands. It must not pass domain/TLS fields to `deployments.create`. |
| Quick Deploy context | Collected by the Quick Deploy workflow through explicit operations; it is not a separate deployment command. |

## State And Event Points

| Stage | Deployment event/state |
| --- | --- |
| Request accepted | `deployment-requested`; accepted deployment state exists. |
| Build/package required | `build-requested`; build/process state begins. |
| Runtime rollout started | `deployment-started`; deployment running state begins. |
| Proxy route realized | Runtime adapter configures generated or durable access route for this attempt; progress/read models expose route state. |
| Terminal success | `deployment-succeeded`; deployment status is succeeded. |
| Terminal failure | `deployment-failed`; deployment status is failed. |

## Current Implementation Notes And Migration Gaps

Current implementation already routes API and CLI through the shared command.

Migration gaps:

- current use case awaits runtime backend execution before returning;
- current aggregate events are `deployment.planning_started`, `deployment.planned`, `deployment.started`, and `deployment.finished`;
- `deployment-requested`, `build-requested`, `deployment-succeeded`, and `deployment-failed` are canonical workflow events;
- Web QuickDeploy currently has local hardcoded validation and related-entity orchestration;
- stream API currently emits `DeploymentProgressEvent`, which is a technical progress event, not a formal domain/application event.
- deployment admission reads `networkProfile.internalPort` as the canonical resource-owned listener port and does not read `runtimeProfile.port`.
- current deployment/runtime paths use typed source `baseDirectory` for Git/local source workdirs and
  reject legacy raw GitHub tree URLs before clone; typed runtime-profile Dockerfile/Compose/static
  path fields are still pending.
- generated default access route resolution and provider injection are not yet implemented as a distinct workflow; current runtime adapters still consume runtime-plan access routes directly.

## Open Questions

- Should `deployments.create` stream stay a technical progress API only, or later become a durable workflow event stream?
