# Deployment Plan Preview Test Matrix

## Normative Contract

Tests for `deployments.plan` must prove that deployment plan preview is a read-only query over the
current resource profile and selected target context. It exposes `detect -> plan` output without
creating a deployment attempt, publishing deployment events, or executing runtime commands.

## Global References

- [Deployment Plan Preview Spec](../specs/013-deployment-plan-preview/spec.md)
- [deployments.plan Query Spec](../queries/deployments.plan.md)
- [Deployment Plan Preview Error Spec](../errors/deployments.plan.md)
- [Workload Framework Detection And Planning Test Matrix](./workload-framework-detection-and-planning-test-matrix.md)
- [deployments.create Test Matrix](./deployments.create-test-matrix.md)
- [Quick Deploy Test Matrix](./quick-deploy-test-matrix.md)
- [Public Documentation Test Matrix](./public-documentation-test-matrix.md)

## Query Matrix

| Test ID | Preferred automation | Case | Expected result |
| --- | --- | --- | --- |
| DPP-QUERY-001 | integration | Successful supported plan | Returns `ready` with source evidence, planner key, support tier, artifact kind, command specs, network, health, and generated time. |
| DPP-QUERY-002 | integration | Unsupported framework | Returns `blocked` with reason `unsupported-framework`, safe evidence, and no deployment attempt. |
| DPP-QUERY-003 | integration | Missing production start command | Returns `blocked` with `missing-production-start-command` and remediation pointing to `resources.configure-runtime`. |
| DPP-QUERY-004 | integration | Static missing publish directory | Returns `blocked` with `missing-static-output` or `static-publish-directory-missing`. |
| DPP-QUERY-005 | integration | Dockerfile artifact path | Returns artifact kind `dockerfile-image` and sanitized Dockerfile build intent without running Docker. |
| DPP-QUERY-006 | integration | Compose artifact path | Returns artifact kind `compose-project`, target service/network summary, and no Compose execution. |
| DPP-QUERY-007 | integration | Prebuilt image path | Returns artifact kind `prebuilt-image`, sanitized image identity, and no build command specs. |
| DPP-QUERY-008 | integration | Custom command image path | Returns custom/workspace command image intent with sanitized install/build/start command specs. |
| DPP-QUERY-009 | integration | Access plan unavailable | Returns plan readiness independently from access warning `access-plan-unavailable` when route planning summary cannot be read. |

## Side-Effect Matrix

| Test ID | Preferred automation | Case | Expected result |
| --- | --- | --- | --- |
| DPP-SIDE-EFFECT-001 | integration | No deployment attempt | Querying a plan does not insert deployment records or return a deployment id. |
| DPP-SIDE-EFFECT-002 | integration | No deployment events | Querying a plan does not publish `deployment-requested`, `build-requested`, `deployment-started`, `deployment-succeeded`, or `deployment-failed`. |
| DPP-SIDE-EFFECT-003 | integration | No runtime execution | Runtime backend build/run/verify/proxy methods are not called. |
| DPP-SIDE-EFFECT-004 | contract | `deployments.create` remains ids-only | Adding `deployments.plan` does not add source/runtime/network/framework fields to `deployments.create`. |

## Entrypoint Matrix

| Test ID | Preferred automation | Entry | Expected test focus |
| --- | --- | --- | --- |
| DPP-HTTP-001 | contract | HTTP/oRPC query | Route/procedure uses `DeploymentPlanQueryInput` and returns `deployments.plan/v1`. |
| DPP-CLI-001 | e2e-preferred | CLI human output | `appaloft deployments plan ...` shows evidence, artifact, commands, warnings, and next fixes without deploying. |
| DPP-CLI-002 | contract | CLI JSON output | `--json` preserves readiness status, reason codes, artifact kind, and command specs. |
| DPP-WEB-001 | e2e-preferred | Web read-only preview | Quick Deploy or Resource detail displays plan preview and remediation links without dispatching `deployments.create`. |
| DPP-MCP-001 | contract / future | Future MCP/tool | Tool descriptor maps to `deployments.plan` and preserves typed reason codes. |

## Current Implementation Notes And Migration Gaps

This matrix is new for the deployment plan preview behavior. Code Round must bind executable tests
to the stable ids above before the operation is considered complete.
