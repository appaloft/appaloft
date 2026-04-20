# Resource Health Test Matrix

## Normative Contract

Tests for `resources.health` must verify that current resource health is distinct from latest
deployment status.

A successful deployment attempt must not make the resource healthy when the runtime, configured
health check, proxy route, durable domain, or generated access route is failing.

## Global References

This test matrix inherits:

- [ADR-020: Resource Health Observation](../decisions/ADR-020-resource-health-observation.md)
- [resources.health Query Spec](../queries/resources.health.md)
- [Resource Health Observation Workflow Spec](../workflows/resource-health-observation.md)
- [Resource Access Failure Diagnostics Test Matrix](./resource-access-failure-diagnostics-test-matrix.md)
- [Resource Health Error Spec](../errors/resources.health.md)
- [Resource Health Implementation Plan](../implementation/resource-health-plan.md)
- [Project Resource Console Workflow Spec](../workflows/project-resource-console.md)
- [Project Resource Console Test Matrix](./project-resource-console-test-matrix.md)
- [Resource Runtime Logs Test Matrix](./resource-runtime-logs-test-matrix.md)
- [Edge Proxy Provider And Route Configuration Test Matrix](./edge-proxy-provider-and-route-configuration-test-matrix.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Test Layers

| Layer | Focus |
| --- | --- |
| Query schema | Resource id, cached/live mode, include flags. |
| Query handler/service | Delegates to query service and composes read-only sources without mutation. |
| Runtime inspection | Container/process lifecycle and provider-native health states. |
| Health policy | HTTP and command policy resolution, defaults, timeout, retries, and unsupported cases. |
| Access/proxy observation | Durable domain precedence, generated route fallback, proxy readiness, public probes. |
| Aggregation | Overall status priority and source error preservation. |
| API/oRPC | Shared query schema/result shape. |
| CLI | `resource health` renders JSON and human status from the query. |
| Web/desktop | Resource detail, project resource list, and sidebar prefer health over deployment status. |

## Given / When / Then Template

```md
Given:
- Resource:
- Latest deployment:
- Runtime lifecycle:
- Runtime/container health:
- Health policy:
- Access summary/domain binding:
- Proxy route:
- Entrypoint:

When:
- The caller requests resource health.

Then:
- Query input:
- Source calls:
- Overall status:
- Section statuses:
- Source errors:
- Expected display status:
- Expected absence of mutations:
```

## Query And Service Matrix

| Test ID | Preferred automation | Case | Input/read state | Expected result | Required assertion |
| --- | --- | --- | --- | --- | --- |
| RES-HEALTH-QRY-001 | integration | Resource missing | Unknown resource id | `err(not_found)` | No runtime/proxy/public probes run. |
| RES-HEALTH-QRY-002 | integration | No deployment/runtime | Resource exists with no deployment/runtime | `ok(overall = "not-deployed")` | Latest deployment context is absent and no health probe is attempted. |
| RES-HEALTH-QRY-003 | integration | Deployment succeeded, runtime healthy | Latest deployment succeeded, runtime running, required checks pass | `ok(overall = "healthy")` | Deployment status is context, not the only health proof. |
| RES-HEALTH-QRY-004 | integration | Deployment succeeded, public route fails | Latest deployment succeeded, internal runtime healthy, public URL times out | `ok(overall = "degraded")` | Public access failure is visible and success is not shown as reachable. |
| RES-HEALTH-QRY-005 | integration | Deployment succeeded, container unhealthy | Latest deployment succeeded, Docker health is `unhealthy` | `ok(overall = "unhealthy")` | Runtime health overrides deployment success. |
| RES-HEALTH-QRY-006 | integration | Runtime starting | Runtime lifecycle starting or restarting | `ok(overall = "starting")` | UI can show pending health rather than succeeded. |
| RES-HEALTH-QRY-007 | integration | Runtime exited | Latest runtime exited with no replacement | `ok(overall = "stopped")` | Status is not failed deployment unless deployment itself failed. |
| RES-HEALTH-QRY-008 | integration | Running with no policy | Runtime running, no configured health policy | `ok(overall = "unknown")` | Missing health check is not healthy. |
| RES-HEALTH-QRY-009 | integration | HTTP policy pass | Policy defaults to internal port, localhost, `/`, expected 200 and passes | `ok(overall = "healthy")` when other required checks pass | Default resolution uses `ResourceNetworkProfile.internalPort`. |
| RES-HEALTH-QRY-010 | integration | HTTP policy fail | HTTP probe returns unexpected status/body or times out | `ok(overall = "unhealthy")` | Check record includes status/reason without leaking body secrets. |
| RES-HEALTH-QRY-011 | integration | Command policy pass | Adapter supports command check and command exits 0 | `ok` with command check passed | Command runs inside workload boundary. |
| RES-HEALTH-QRY-012 | integration | Command policy unsupported | Adapter cannot run command policy | `ok(overall = "unknown")` or `degraded` by policy strictness | Source error is `resource_health_policy_unsupported`. |
| RES-HEALTH-QRY-013 | integration | Proxy route missing | Reverse-proxy exposure but route not applied | `ok(overall = "degraded")` | Proxy section identifies unavailable route. |
| RES-HEALTH-QRY-014 | integration | Durable domain ready | Ready domain binding and generated route both exist | `ok` uses durable domain as public access target | Durable domain precedes generated default route. |
| RES-HEALTH-QRY-015 | integration | Durable domain pending | Domain binding exists but is not ready | `ok(overall = "degraded")` when public access is required | Domain state is not hidden by generated route unless policy allows fallback. |
| RES-HEALTH-QRY-016 | integration | Runtime inspection fails | Runtime provider inspect fails | `ok(overall = "unknown")` | Source error records runtime inspection failure. |
| RES-HEALTH-QRY-017 | integration | Read model failure | Required resource context cannot be safely loaded | `err(resource_health_unavailable)` | No partial unsafe summary is returned. |
| RES-HEALTH-QRY-018 | integration | Edge upstream timeout observed | Latest deployment succeeded, internal health is unknown or healthy, latest edge failure is `resource_access_upstream_timeout` | `ok(overall = "degraded")` | Source error/check record includes request id, code, phase, retriable flag, and does not mark deployment success as reachable. |
| RES-HEALTH-QRY-019 | integration | Edge proxy route unavailable observed | Latest deployment exists, edge failure is `resource_access_route_unavailable` or `resource_access_proxy_unavailable` | `ok(overall = "degraded")` | Proxy/public access sections use `resource_access_*` code and keep category out of `domain`. |

## Status Aggregation Matrix

| Test ID | Preferred automation | Signals | Expected overall |
| --- | --- | --- | --- |
| RES-HEALTH-STATUS-001 | unit | No runtime and no latest deployment | `not-deployed` |
| RES-HEALTH-STATUS-002 | unit | Runtime starting/restarting | `starting` |
| RES-HEALTH-STATUS-003 | unit | Runtime running, health policy missing | `unknown` |
| RES-HEALTH-STATUS-004 | unit | Runtime running, Docker health healthy, HTTP health pass, proxy ready, public access pass | `healthy` |
| RES-HEALTH-STATUS-005 | unit | Runtime running, internal health pass, public access fail | `degraded` |
| RES-HEALTH-STATUS-006 | unit | Runtime running, Docker health unhealthy or required HTTP/command health fail | `unhealthy` |
| RES-HEALTH-STATUS-007 | unit | Runtime stopped/exited without replacement | `stopped` |
| RES-HEALTH-STATUS-008 | unit | Observation sources unavailable and no failing fact is known | `unknown` |

## Entrypoint Matrix

| Test ID | Preferred automation | Entrypoint | Case | Expected behavior |
| --- | --- | --- | --- | --- |
| RES-HEALTH-ENTRY-001 | e2e-preferred | Web resource detail | Latest deployment succeeded but public access fails | Header/status panel shows resource health `degraded` or `unhealthy`; deployment success appears only as context. |
| RES-HEALTH-ENTRY-002 | e2e-preferred | Web resource detail | Access URL exists on resource summary | Access panel is visible on resource detail, not only deployment detail. |
| RES-HEALTH-ENTRY-003 | e2e-preferred | Sidebar | Health projection available | Resource child uses compact resource health status. |
| RES-HEALTH-ENTRY-004 | e2e-preferred | Sidebar | Health projection absent during migration | Resource child may fall back to latest deployment status but must not label it as current health. |
| RES-HEALTH-ENTRY-005 | e2e-preferred | Project resource list | Multiple resources with mixed health | List displays resource health and latest deployment context separately. |
| RES-HEALTH-ENTRY-006 | e2e-preferred | Deployment detail | Attempt succeeded, resource unhealthy | Deployment page links back to current resource health instead of implying the attempt proves availability. |
| RES-HEALTH-ENTRY-007 | e2e-preferred | CLI | `resource health --json` | Prints `ResourceHealthSummary` JSON from the query. |
| RES-HEALTH-ENTRY-008 | e2e-preferred | API/oRPC | HTTP query | Reuses input schema and returns `ResourceHealthSummary`. |

## Configure Health Command Matrix

| Test ID | Preferred automation | Case | Input/read state | Expected result | Required assertion |
| --- | --- | --- | --- | --- | --- |
| RES-HEALTH-CFG-001 | e2e-preferred | Configure HTTP policy through public entrypoint | Existing resource, HTTP health policy input | `ok({ id })`, then `resources.health` reports configured policy | CLI or HTTP/oRPC dispatches `ConfigureResourceHealthCommand` and the query observes the policy. |
| RES-HEALTH-CFG-002 | integration | Configure policy preserves runtime profile | Existing resource with install/build/start strategy fields | `ok({ id })` | Existing non-health runtime profile fields are preserved and health path is mirrored. |
| RES-HEALTH-CFG-003 | integration | Disable health policy | Existing resource, `enabled = false` | `ok({ id })`, `resources.health` reports policy `not-configured` | Disabled policy is not treated as proof of health. |
| RES-HEALTH-CFG-004 | integration | Resource missing | Unknown resource id | `err(not_found)` | No event is published and no resource is persisted. |
| RES-HEALTH-CFG-005 | contract | Invalid HTTP policy | Enabled HTTP policy without HTTP config or invalid port/status/path | `err(validation_error)` | Input schema rejects invalid policy before use case execution. |

## Current Implementation Notes And Migration Gaps

Executable application tests for the first cached/read-model slice live in
`packages/application/test/resource-health.test.ts`.

Current covered cases:

- no latest deployment returns `overall = "not-deployed"`;
- deployment `succeeded` plus ready access/proxy but no health policy returns `overall = "unknown"`;
- failed public/proxy route state returns `overall = "degraded"`;
- in-flight latest deployment returns `overall = "starting"`;
- configured policy remains `overall = "unknown"` in cached mode until a current probe exists;
- live HTTP policy pass/fail is covered in application tests;
- `resources.configure-health` is covered by application integration tests and at least one public
  CLI or HTTP/oRPC acceptance path.

Current runtime adapter tests cover some deployment-time health checks. Those tests should remain
attempt-scoped and new tests should cover the resource-owned observation contract separately.

Remaining test gaps include provider-native runtime inspection, Docker health state, command policy
support/unsupported cases, durable-domain precedence inside the health query, and Web e2e mocking
of mixed resource health states. Edge access failure diagnostic source rows `RES-HEALTH-QRY-018`
and `RES-HEALTH-QRY-019` are also future coverage.

## Open Questions

- Should Web e2e tests mock a cached `ResourceHealthSummary` first, or wait for a real runtime
  health query implementation?
