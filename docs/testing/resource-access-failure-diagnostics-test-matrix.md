# Resource Access Failure Diagnostics Test Matrix

## Normative Contract

Tests for resource access failure diagnostics must prove that gateway-generated public access
failures are classified with stable Appaloft codes, rendered safely, and linked to existing
resource observation surfaces without creating a new business command.

## Global References

This test matrix inherits:

- [Resource Access Failure Diagnostics Workflow](../workflows/resource-access-failure-diagnostics.md)
- [Resource Access Failure Diagnostics Error Spec](../errors/resource-access-failure-diagnostics.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [Resource Health Test Matrix](./resource-health-test-matrix.md)
- [Resource Diagnostic Summary Test Matrix](./resource-diagnostic-summary-test-matrix.md)
- [Edge Proxy Provider And Route Configuration Test Matrix](./edge-proxy-provider-and-route-configuration-test-matrix.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Test Layers

| Layer | Focus |
| --- | --- |
| Provider adapter contract | Concrete edge provider maps gateway failure signals into `ResourceAccessFailureDiagnostic`. |
| Diagnostic renderer | HTML and problem responses share the same stable code/request id and stay redacted. |
| Edge routing integration | Error response is used only for gateway-generated 404, 502, 503, and 504 paths. |
| Resource observation integration | Known resource failures are reflected in `resources.health` and `resources.diagnostic-summary`. |
| Security/redaction | Public page hides internal ids, logs, headers, cookies, paths, commands, and provider-native output. |
| Web/API behavior | Browser navigation gets HTML; API/non-HTML callers get structured problem responses. |

## Given / When / Then Template

```md
Given:
- Request host/path:
- Accept header:
- Matched route state:
- Resource/access/proxy/health state:
- Provider failure signal:
- Authentication state:

When:
- The edge proxy cannot serve the request.

Then:
- Diagnostic code:
- HTTP status:
- Response format:
- Request id:
- Public details:
- Owner details:
- Source errors / related cause codes:
- Expected absence of mutations:
```

## Classification Matrix

| Test ID | Preferred automation | Case | Input/signal | Expected diagnostic | Required assertion |
| --- | --- | --- | --- | --- | --- |
| RES-ACCESS-DIAG-CLASS-001 | contract | Route not found | No active route for host/path | `resource_access_route_not_found`, phase `edge-request-routing` | Category is `not-found`; HTTP status is 404; no resource-specific details leak to public response. |
| RES-ACCESS-DIAG-CLASS-002 | contract | Proxy unavailable | Route requires proxy but proxy state is failed/not ready | `resource_access_proxy_unavailable`, phase `proxy-route-observation` | Related server/provider ids are included only in owner-safe context. |
| RES-ACCESS-DIAG-CLASS-003 | contract | Route unavailable | Route exists but applied state is failed/stale/unapplied | `resource_access_route_unavailable`, phase `proxy-route-observation` | Cause code may reference route realization failure. |
| RES-ACCESS-DIAG-CLASS-004 | contract | No upstream target | Route is known but no current runtime target exists | `resource_access_upstream_unavailable`, phase `upstream-connection` | Owner hint is `resource` and category is not `domain`. |
| RES-ACCESS-DIAG-CLASS-005 | contract | Upstream connect refused | Provider reports connect refused or network connect failure | `resource_access_upstream_connect_failed`, phase `upstream-connection` | Raw provider error text is not part of the response contract. |
| RES-ACCESS-DIAG-CLASS-006 | contract | Upstream timeout | Provider reports upstream timeout | `resource_access_upstream_timeout`, phase `upstream-connection` | HTTP status is 504 and `retriable = true`. |
| RES-ACCESS-DIAG-CLASS-007 | contract | Upstream reset | Provider reports reset before complete response | `resource_access_upstream_reset`, phase `upstream-response` | HTTP status is 502. |
| RES-ACCESS-DIAG-CLASS-008 | contract | Upstream TLS/protocol failure | Provider reports TLS/protocol negotiation failure | `resource_access_upstream_tls_failed`, phase `upstream-connection` | Owner hint is `operator-config`. |
| RES-ACCESS-DIAG-CLASS-009 | contract | Unknown provider signal | Provider cannot safely classify the signal | `resource_access_unknown` | Response still includes request id and redacted generic guidance. |
| RES-ACCESS-DIAG-CLASS-010 | contract | Stable diagnostic envelope fields | Safe provider signal includes affected URL/host/path, route/source descriptor, related ids, request/correlation ids, and cause code | `resource-access-failure/v1` diagnostic includes stable code/category/phase/status, `nextAction`, affected request descriptor, related resource/deployment/domain binding/server/destination/route ids, and request/correlation ids | Raw provider payloads, headers, cookies, query strings, internal addresses, and command output are absent. |

## Rendering Matrix

| Test ID | Preferred automation | Case | Input | Expected response | Required assertion |
| --- | --- | --- | --- | --- | --- |
| RES-ACCESS-DIAG-RENDER-001 | integration | HTML browser failure | `Accept: text/html`, gateway-generated 502 | HTML diagnostic page | Page includes request id, code, timestamp, and three-hop status without secrets. |
| RES-ACCESS-DIAG-RENDER-002 | integration | API failure | `Accept: application/json` or non-HTML request | `application/problem+json` or equivalent structured error | Problem response includes same code, phase, request id, retriable flag. |
| RES-ACCESS-DIAG-RENDER-003 | integration | User app response | Upstream application successfully returns 500/503 response | No Appaloft replacement by default | User response is preserved unless a future explicit policy opts in. |
| RES-ACCESS-DIAG-RENDER-004 | integration | Renderer failure | Diagnostic renderer fails while handling gateway failure | Safe fallback with `resource_access_edge_error` | No stack trace, provider log, or raw exception text leaks. |
| RES-ACCESS-DIAG-RENDER-005 | integration | Authenticated owner details | Request maps to a resource and owner is authenticated | Owner-safe link/context is available | Owner link points to resource health or diagnostic summary, not a mutating action. |

## Edge Routing Integration Matrix

| Test ID | Preferred automation | Case | Input | Expected route configuration | Required assertion |
| --- | --- | --- | --- | --- | --- |
| RES-ACCESS-DIAG-ROUTE-001 | contract | Traefik served route with diagnostic renderer target | Provider route realization receives a safe renderer service URL | Served router references the access failure middleware and the middleware points at `/.appaloft/resource-access-failure` | Error middleware covers gateway-generated 404, 502, 503, and 504 statuses and does not expose raw provider text. |
| RES-ACCESS-DIAG-ROUTE-002 | contract | Redirect-only route with diagnostic renderer target | Provider route realization receives canonical serve route plus alias redirect route | Serve router can use access failure middleware; alias redirect router remains redirect-only | Redirect alias is not accidentally attached to the upstream error middleware or workload service. |
| RES-ACCESS-DIAG-ROUTE-003 | contract | Running service renderer target | Appaloft backend service is listening and provider-backed route realization runs | Runtime passes a safe renderer target into provider route realization | A wildcard-bound service derives `host.docker.internal:<port>` automatically; loopback-only one-shot CLI style runtime does not inject a target unless an explicit reachable override is configured. |
| RES-ACCESS-DIAG-ROUTE-004 | contract | Unmatched route fallback | Provider route realization receives a safe renderer service URL and no router matches a later request host/path | Provider renders a low-priority catch-all router that rewrites to `/.appaloft/resource-access-failure` and injects a provider-neutral `route-not-found` signal | The fallback excludes `/.well-known/acme-challenge/`, does not leak raw provider details, and preserves more-specific served or redirect routers as the primary match. |

## Resource Observation Matrix

| Test ID | Preferred automation | Case | Input/read state | Expected query relationship | Required assertion |
| --- | --- | --- | --- | --- | --- |
| RES-ACCESS-DIAG-OBS-001 | integration | Edge failure appears in diagnostic summary | Known resource has latest edge failure envelope | `resources.diagnostic-summary` includes access/proxy source error | Source error reuses `resource_access_*` code and phase. |
| RES-ACCESS-DIAG-OBS-002 | integration | Edge failure appears in health | Known resource has public access edge failure | `resources.health` reports degraded public/proxy access | Latest deployment success does not override the edge failure. |
| RES-ACCESS-DIAG-OBS-003 | integration | Existing cause code preserved | Route realization or health has structured cause code | Edge diagnostic includes `causeCode` | Original operation-owned error code remains unchanged. |
| RES-ACCESS-DIAG-OBS-004 | contract | Cross-surface schema parity | Latest safe edge failure is present in resource access read state | `resources.show`, `resources.health`, and `resources.diagnostic-summary` expose the same optional diagnostic envelope fields through shared contracts | API/oRPC, CLI, and Web consume the shared schema rather than transport-only shapes. |

## Evidence Lookup Matrix

| Test ID | Preferred automation | Case | Input/read state | Expected query relationship | Required assertion |
| --- | --- | --- | --- | --- | --- |
| RES-ACCESS-DIAG-EVIDENCE-001 | integration | Request id lookup returns retained evidence | Short-retention read model has a non-expired safe `resource-access-failure/v1` envelope | `resources.access-failure-evidence.lookup` returns `found` | Response includes safe envelope, matched source, related ids, next action, `capturedAt`, and `expiresAt`. |
| RES-ACCESS-DIAG-EVIDENCE-002 | integration | Optional filters narrow lookup | Read model has request id evidence but supplied `resourceId`, `hostname`, or `path` does not match | `resources.access-failure-evidence.lookup` returns safe `not-found` copy | Mismatch does not leak another resource's evidence or related ids. |
| RES-ACCESS-DIAG-EVIDENCE-003 | integration | Retention expiry hides evidence | Read model has evidence whose `expiresAt` is earlier than lookup time | `resources.access-failure-evidence.lookup` returns safe `not-found` copy | Expired evidence is not returned and may be pruned. |
| RES-ACCESS-DIAG-EVIDENCE-004 | contract + adapter integration | Capture and lookup stay redacted | Renderer receives unsafe query strings, headers, cookies, provider raw payload hints, or secret-like values | Captured evidence and lookup response include only sanitized envelope fields | Raw provider payloads, authorization/cookie headers, sensitive query strings, SSH credentials, private keys, and raw remote logs are absent. |

## Automatic Route Context Lookup Matrix

These rows are governed by
[Automatic Route Context Lookup Baseline](../specs/025-automatic-route-context-lookup/spec.md).

| Test ID | Preferred automation | Case | Input/read state | Expected query relationship | Required assertion |
| --- | --- | --- | --- | --- | --- |
| RES-ACCESS-DIAG-CONTEXT-001 | application unit | Generated access route match | `ResourceAccessSummary.latestGeneratedAccessRoute` matches hostname/path | Automatic lookup returns `found` with generated route context | Safe related `resourceId`, `deploymentId`, `destinationId`, route source/status, confidence, and next action are present. |
| RES-ACCESS-DIAG-CONTEXT-002 | application unit | Durable domain binding route match | Ready durable domain binding and route summary match hostname/path | Automatic lookup returns `found` with durable domain context | `domainBindingId`, `serverId`, `destinationId`, resource id, and route status are safe and no provider raw payload is present. |
| RES-ACCESS-DIAG-CONTEXT-003 | application unit | Server-applied route match | Server-applied route summary matches hostname/path | Automatic lookup returns `found` with server-applied route context | `server-applied` context wins over generated access for the same hostname/path when no ready durable route matches. |
| RES-ACCESS-DIAG-CONTEXT-004 | application unit | Stable precedence and confidence | Multiple sources match the same hostname/path | Lookup chooses durable domain, then server-applied, then latest generated, then planned generated | Longest matching path prefix wins within the same source and route-source hints do not override precedence. |
| RES-ACCESS-DIAG-CONTEXT-005 | application unit | Safe not-found | No existing route summary or binding matches hostname/path | Lookup returns safe `not-found` copy | Response includes no unrelated ids and recommends `diagnostic-summary` or route/proxy inspection. |
| RES-ACCESS-DIAG-CONTEXT-006 | adapter integration | Evidence capture enriches missing ids | Renderer captures provider-neutral failure with hostname/path but no route ids | Capture calls automatic lookup before recording evidence | Stored `resource-access-failure/v1` envelope includes only safe related ids from lookup. |
| RES-ACCESS-DIAG-CONTEXT-007 | application unit + adapter integration | Lookup and enriched capture remain redacted | Host/path request includes query strings, cookies, auth headers, provider raw payload hints, or secret-like values | Lookup and capture normalize to safe hostname/path and route ids only | Sensitive query values, auth/cookie headers, SSH credentials, private keys, provider raw payloads, and raw remote logs are absent. |

## Applied Route Context Metadata Matrix

These rows are governed by
[Applied Route Context Metadata Contract Baseline](../specs/026-applied-route-context-metadata/spec.md).

| Test ID | Preferred automation | Case | Input/read state | Expected query relationship | Required assertion |
| --- | --- | --- | --- | --- | --- |
| RES-ACCESS-DIAG-APPLIED-001 | application unit + provider contract | Generated access applied metadata | Proxy preview renders a generated default access route | Route view includes `applied-route-context/v1` metadata | Safe `resourceId`, `deploymentId`, `serverId`, `destinationId`, `routeId`, `diagnosticId`, `routeSource = generated-default`, hostname/path, proxy kind/provider, and observed/applied timestamp are present. |
| RES-ACCESS-DIAG-APPLIED-002 | application unit + provider contract | Durable domain applied metadata | Proxy preview renders a durable domain route with a matching binding | Route view includes durable route context | `domainBindingId`, server/destination ids, `routeSource = durable-domain`, and route diagnostic id are present without treating generated access as the owner. |
| RES-ACCESS-DIAG-APPLIED-003 | application unit + provider contract | Server-applied applied metadata | Proxy preview renders a server-applied route | Route view includes server-applied route context | `routeSource = server-applied`, resource/deployment/server/destination ids, proxy kind/provider, hostname/path, and diagnostic id are safe and stable. |
| RES-ACCESS-DIAG-APPLIED-004 | adapter integration | Evidence capture prefers applied metadata | Renderer captures a failure with supplied `applied-route-context/v1` metadata and a host/path that would otherwise require lookup | Evidence capture records metadata-derived route context without calling hostname/path lookup | Stored envelope includes safe related ids from applied metadata and preserves the original diagnostic code/phase. |
| RES-ACCESS-DIAG-APPLIED-005 | contract + adapter integration | Applied metadata remains redacted | Applied metadata input is adjacent to query strings, cookies, auth headers, provider raw payload hints, SSH credentials, or remote logs | Proxy preview and evidence capture keep only safe metadata fields | Sensitive query values, auth/cookie headers, private keys, provider raw payloads, and raw remote logs are absent from route views, problem JSON, and stored evidence. |

## Shared Access Diagnostic Contract Matrix

These rows are governed by
[Route Intent/Status And Access Diagnostics](../specs/020-route-intent-status-and-access-diagnostics/spec.md).

| Test ID | Preferred automation | Case | Input/read state | Expected query relationship | Required assertion |
| --- | --- | --- | --- | --- | --- |
| ACCESS-DIAG-001 | integration | Runtime not ready or health failing | Runtime is starting/stopped or required health check fails | Health and diagnostic summary report `runtime_not_ready` or `health_check_failing` | Runtime logs are evidence only; log text is not parsed as readiness. |
| ACCESS-DIAG-002 | integration | Proxy route missing or stale | Route exists but proxy status is missing/stale/unapplied/failed | Proxy preview, health, and diagnostic summary use `proxy_route_missing` or `proxy_route_stale` | State remains route/access observation unless deployment execution failed. |
| ACCESS-DIAG-003 | integration | Domain, DNS, or TLS blocking reason | Durable/custom route is not usable because domain, DNS, or TLS state is not ready | Descriptor/source errors use `domain_not_verified`, `dns_points_elsewhere`, `certificate_missing`, or `certificate_expired_or_not_active` | Recommended action is diagnostic/fix guidance, not a hidden mutation. |
| ACCESS-DIAG-004 | integration | Copy-safe diagnostic payload | Access diagnostic has provider/native/raw inputs that may contain secrets | Copy JSON contains stable ids, codes, phases, request ids, and safe route metadata only | Raw provider SDK payloads, private keys, env values, headers/cookies, internal coordinates, and raw command output are absent. |
| ACCESS-DIAG-005 | integration | Cross-surface failure visibility baseline | Access, proxy, runtime log, deployment log, health, or route context lookup source reports a failure or unavailable state | Existing health/proxy/log/diagnostic read surfaces expose stable source, code, phase, related ids when safe, and suggested next action | The response does not trigger repair, redeploy, rollback, route mutation, or provider-native raw payload parsing. |

## Redaction Matrix

| Test ID | Preferred automation | Sensitive source | Expected result |
| --- | --- | --- |
| RES-ACCESS-DIAG-REDACT-001 | integration | Raw proxy log containing internal upstream URL | Public and problem responses omit it. |
| RES-ACCESS-DIAG-REDACT-002 | integration | Cookies or authorization headers | Not present in diagnostic envelope or rendered output. |
| RES-ACCESS-DIAG-REDACT-003 | integration | Container name, private IP, host path, or command string | Omitted unless a future security ADR allows redacted owner-only display. |
| RES-ACCESS-DIAG-REDACT-004 | integration | Application stack trace in upstream body | Not displayed by the edge page. |

## Current Implementation Notes And Migration Gaps

Executable tests now cover:

- `RES-ACCESS-DIAG-CLASS-001`;
- `RES-ACCESS-DIAG-CLASS-006`;
- `RES-ACCESS-DIAG-CLASS-010`;
- parser/status fallback coverage for safe codes, signals, and HTTP status inputs;
- `RES-ACCESS-DIAG-RENDER-001`;
- `RES-ACCESS-DIAG-RENDER-002`;
- `RES-ACCESS-DIAG-RENDER-004`;
- `RES-ACCESS-DIAG-ROUTE-001`;
- `RES-ACCESS-DIAG-ROUTE-002` through the same provider route-label assertion;
- `RES-ACCESS-DIAG-ROUTE-003`;
- `RES-ACCESS-DIAG-ROUTE-004`;
- `RES-ACCESS-DIAG-OBS-001` through the resource diagnostic summary query-service baseline;
- `RES-ACCESS-DIAG-OBS-002` through the resource health query-service baseline;
- `RES-ACCESS-DIAG-OBS-003` through safe cause-code preservation on the diagnostic envelope;
- `RES-ACCESS-DIAG-OBS-004` through contracts/schema and resource read-model fixtures;
- `RES-ACCESS-DIAG-EVIDENCE-001` through application query service, contract, CLI, HTTP/oRPC, and
  PG/PGlite lookup coverage;
- `RES-ACCESS-DIAG-EVIDENCE-002` through application filter mismatch safe not-found coverage;
- `RES-ACCESS-DIAG-EVIDENCE-003` through PG/PGlite retention expiry coverage;
- `RES-ACCESS-DIAG-EVIDENCE-004` through contract redaction and renderer capture coverage;
- `RES-ACCESS-DIAG-CONTEXT-001` through generated access route context lookup coverage;
- `RES-ACCESS-DIAG-CONTEXT-002` through durable domain route context lookup coverage;
- `RES-ACCESS-DIAG-CONTEXT-003` through server-applied route context lookup coverage;
- `RES-ACCESS-DIAG-CONTEXT-004` through precedence and confidence coverage;
- `RES-ACCESS-DIAG-CONTEXT-005` through safe not-found coverage;
- `RES-ACCESS-DIAG-CONTEXT-006` through renderer evidence capture enrichment coverage;
- `RES-ACCESS-DIAG-CONTEXT-007` through lookup and enriched-capture redaction coverage;
- `RES-ACCESS-DIAG-APPLIED-001` through application proxy preview, provider renderer, and
  contract-schema coverage for generated access applied route metadata;
- `RES-ACCESS-DIAG-APPLIED-002` through durable domain proxy preview metadata coverage;
- `RES-ACCESS-DIAG-APPLIED-003` through server-applied proxy preview metadata coverage;
- `RES-ACCESS-DIAG-APPLIED-004` through automatic lookup and HTTP renderer evidence-capture
  preference coverage;
- `RES-ACCESS-DIAG-APPLIED-005` through contract and HTTP evidence redaction coverage;
- `ACCESS-DIAG-005` through resource diagnostic summary and resource health application tests that
  keep cross-surface source errors visible while redacting unsafe adjacent text;
- `EDGE-PROXY-PROVIDER-010` as the Traefik provider contract row.

Remaining gaps include broader classification rows, a companion/static renderer path for one-shot
CLI remote SSH execution, real Traefik end-to-end error-middleware probing, provider-native
metadata lookup beyond existing read models, a Web lookup form, and redaction rows beyond the
current renderer-level assertions.

## Open Questions

- Should end-to-end browser coverage use a real Traefik error middleware path or a provider-neutral
  fake edge provider for deterministic failures?
