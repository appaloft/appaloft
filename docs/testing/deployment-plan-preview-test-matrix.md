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

## Catalog Preview Matrix

| Test ID | Preferred automation | Case | Expected result |
| --- | --- | --- | --- |
| DPP-CATALOG-001 | contract/integration | Ready JavaScript/TypeScript supported plan | `deployments.plan/v1` can expose JS/TS source evidence, planner key/support tier, artifact kind, install/build/start command specs, network, health, warnings, and next actions without deployment id or execution output. |
| DPP-CATALOG-002 | contract/integration | Blocked unsupported or ambiguous JavaScript/TypeScript evidence | `deployments.plan/v1` can expose `blocked` readiness, stable reason code such as `unsupported-framework`, `ambiguous-framework`, `missing-production-start-command`, `missing-static-output`, or `internal-port-missing`, safe evidence, and remediation without returning transport failure. |
| DPP-CATALOG-003 | contract/integration | Ready Python supported plan | `deployments.plan/v1` can expose Python source evidence, package tool, ASGI/WSGI target or framework metadata, planner key/support tier, artifact kind, install/build/start command specs, network, health, warnings, and next actions without deployment id or execution output. |
| DPP-CATALOG-004 | contract/integration | Blocked unsupported, ambiguous, or missing Python evidence | `deployments.plan/v1` can expose `blocked` readiness, stable reason code such as `unsupported-framework`, `ambiguous-python-app-target`, `missing-asgi-app`, `missing-wsgi-app`, `missing-production-start-command`, or `internal-port-missing`, safe evidence, and remediation without returning transport failure. |
| DPP-CATALOG-005 | contract/integration | Ready JVM/Spring supported plan | `deployments.plan/v1` can expose JVM source evidence, Spring Boot framework metadata, Maven/Gradle build tool, planner key/support tier, artifact kind, build/package/start command specs, network, health, warnings, and next actions without deployment id or execution output. |
| DPP-CATALOG-006 | contract/integration | Blocked unsupported, ambiguous, or missing JVM evidence | `deployments.plan/v1` can expose `blocked` readiness, stable reason code such as `unsupported-framework`, `ambiguous-jvm-build-tool`, `missing-jvm-build-tool`, `missing-runnable-jar`, `missing-production-start-command`, or `internal-port-missing`, safe evidence, and remediation without returning transport failure. |
| DPP-CATALOG-BP-001 | contract/integration | Ready buildpack-accelerated candidate | `deployments.plan/v1` can expose adapter-owned buildpack evidence, `buildpack-accelerated` support tier, Docker/OCI image intent, builder policy, detected buildpacks, limitations, warnings, and next actions without deployment id, execution output, or deployment input overrides. |
| DPP-CATALOG-BP-002 | contract/integration | Blocked buildpack candidate | `deployments.plan/v1` can expose `blocked` readiness, stable reason codes such as `buildpack-disabled`, `buildpack-target-unavailable`, `unsupported-buildpack-builder`, `unsupported-buildpack-lifecycle-feature`, `ambiguous-buildpack-evidence`, `missing-buildpack-evidence`, `buildpack-start-intent-missing`, or `internal-port-missing`, safe evidence, limitations, and remediation without returning transport failure. |

## Runtime Plan Resolution Failure Preview Matrix

These rows govern the cross-family blocked preview shape that future planner families must reuse.
Test names must include the matrix id they prove.

| Test ID | Preferred automation | Case | Expected result |
| --- | --- | --- | --- |
| DPP-PLAN-FAIL-001 | contract/integration | Blocked preview reason shape | Unsupported, ambiguous, or missing planner evidence is returned from `deployments.plan` | `deployments.plan/v1` returns readiness `blocked` with `phase`, shared `reasonCode`, safe `evidence`, `fixPath`, `overridePath`, and `affectedProfileField` when applicable. |
| DPP-PLAN-FAIL-002 | contract/integration | Ready and blocked parity | A ready plan and a blocked plan are rendered through the same preview schema | Both responses preserve support tier, planner/evidence summaries, warnings, next actions, and no deployment id or runtime execution. |
| DPP-PLAN-FAIL-003 | contract/integration | Explicit custom/container-native precedence | Source has framework/buildpack evidence plus explicit commands, Dockerfile, Compose, or prebuilt image profile | Preview reports `explicit-custom` or `container-native` support tier; inference is diagnostic only and cannot override explicit profile fields. |
| DPP-PLAN-FAIL-004 | contract/integration | Buildpack non-winning evidence | Source has buildpack evidence plus first-class planner or explicit profile evidence | Preview keeps buildpack evidence non-winning and preserves the selected planner/profile support tier. |
| DPP-PLAN-FAIL-005 | contract/integration | Health and environment guardrails | Preview includes planner/buildpack health hints and variable evidence | Planner/buildpack does not claim app-level health without explicit resource health policy; secret values are masked and build-time `PUBLIC_`/`VITE_` rules are visible. |
| DPP-PLAN-FAIL-006 | contract / future | CLI/API/Web/future MCP metadata parity | Each surface consumes deployment planning output | CLI JSON, API/oRPC, Web typed client, and future MCP/tool metadata preserve the same blocked reason, fix path, override path, and affected profile field shape. |

## Current Implementation Notes And Migration Gaps

`deployments.plan` is active. Executable operation/catalog/API/Web/CLI coverage exists for the
public surface, while `DPP-CATALOG-001` and `DPP-CATALOG-002` bind the JavaScript/TypeScript planner
catalog to the shared preview response shape. `DPP-CATALOG-003` and `DPP-CATALOG-004` bind the
Python planner catalog to the same preview response shape, including ASGI/WSGI app-target blocked
reason codes. `DPP-CATALOG-005` and `DPP-CATALOG-006` bind JVM/Spring Boot planner output to the
same preview response shape, including Maven/Gradle ambiguity, missing runnable jar, missing
production start, and unsupported JVM framework blocked reason codes. `DPP-CATALOG-BP-001` and
`DPP-CATALOG-BP-002` govern buildpack accelerator preview parity without claiming real
`pack`/lifecycle execution. Executable contract tests bind these rows to the shared
`deployments.plan/v1` schema. Full future MCP/tool descriptors remain a migration gap until
MCP/tool surfaces are active.

`DPP-PLAN-FAIL-001` through `DPP-PLAN-FAIL-006` bind the shared
runtime-plan-resolution unsupported/override contract to `deployments.plan/v1`. They are intended
to be proven with hermetic contract fixtures and do not require real Docker, buildpack lifecycle,
SSH, package installation, or framework CLI execution.
