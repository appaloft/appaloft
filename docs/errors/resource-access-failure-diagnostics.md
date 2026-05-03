# Resource Access Failure Diagnostics Error Spec

## Normative Contract

Resource access failure diagnostics uses the shared platform error model for edge/gateway failures
that occur after an HTTP request reaches Appaloft but before the request is successfully served by a
resource route.

These errors are outer observation errors. They are not core aggregate `domain` errors unless the
related cause is a real domain invariant or state-machine rejection from another operation.

## Global References

This spec inherits:

- [Resource Access Failure Diagnostics Workflow](../workflows/resource-access-failure-diagnostics.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [resources.health Query Spec](../queries/resources.health.md)
- [resources.diagnostic-summary Query Spec](../queries/resources.diagnostic-summary.md)
- [Resource Diagnostic Summary Error Spec](./resources.diagnostic-summary.md)
- [Resource Health Error Spec](./resources.health.md)
- [Error Model](./model.md)
- [neverthrow Conventions](./neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Error Details

```ts
type ResourceAccessFailureErrorDetails = {
  phase:
    | "edge-request-routing"
    | "proxy-route-observation"
    | "upstream-connection"
    | "upstream-response"
    | "proxy-route-realization"
    | "public-route-verification"
    | "diagnostic-page-render";
  requestId: string;
  httpStatus: 404 | 502 | 503 | 504;
  ownerHint: "platform" | "resource" | "operator-config" | "unknown";
  affectedUrl?: string;
  affectedHostname?: string;
  affectedPath?: string;
  method?: string;
  resourceId?: string;
  deploymentId?: string;
  domainBindingId?: string;
  projectId?: string;
  environmentId?: string;
  serverId?: string;
  destinationId?: string;
  routeId?: string;
  routeSource?: "generated-default" | "durable-domain" | "server-applied" | "deployment-snapshot";
  routeStatus?: string;
  providerKey?: string;
  causeCode?: string;
  nextAction?:
    | "check-health"
    | "inspect-runtime-logs"
    | "inspect-deployment-logs"
    | "inspect-proxy-preview"
    | "diagnostic-summary"
    | "verify-domain"
    | "fix-dns"
    | "repair-proxy"
    | "manual-review";
  correlationId?: string;
  causationId?: string;
};
```

Error details must not include raw proxy logs, internal IP addresses, raw upstream URLs, headers,
cookies, tokens, source credentials, provider access tokens, private filesystem paths, command
strings, or unredacted application output.

Affected request fields are safe lookup hints only. They must exclude query strings and request
headers. `nextAction` is a stable observation/recovery pointer and must not imply that a hidden
mutation happened.

## Diagnostic Codes

| Code | Category | Phase | HTTP status | Retriable | Owner hint | Meaning |
| --- | --- | --- | --- | --- | --- | --- |
| `resource_access_route_not_found` | `not-found` | `edge-request-routing` | 404 | No | `platform` or `operator-config` | The request reached Appaloft, but no active route matched the host/path. |
| `resource_access_proxy_unavailable` | `infra` | `proxy-route-observation` | 503 | Conditional | `platform` | Required edge proxy infrastructure is unavailable, failed, or not ready. |
| `resource_access_route_unavailable` | `infra` | `proxy-route-observation` | 503 | Conditional | `platform` or `operator-config` | A known route exists but is stale, failed, unapplied, or not ready. |
| `resource_access_upstream_unavailable` | `infra` | `upstream-connection` | 503 | Conditional | `resource` | The route is known, but no current upstream target is available. |
| `resource_access_upstream_connect_failed` | `infra` | `upstream-connection` | 502 | Conditional | `resource` | The edge proxy could not establish a connection to the resource endpoint. |
| `resource_access_upstream_timeout` | `timeout` | `upstream-connection` | 504 | Yes | `resource` | The resource endpoint did not respond before the gateway timeout. |
| `resource_access_upstream_reset` | `infra` | `upstream-response` | 502 | Conditional | `resource` | The upstream connection closed before the gateway could serve a complete response. |
| `resource_access_upstream_tls_failed` | `integration` | `upstream-connection` | 502 | Conditional | `operator-config` | The proxy could not negotiate the configured upstream protocol or TLS mode. |
| `resource_access_edge_error` | `infra` | `diagnostic-page-render` | 503 | Yes | `platform` | The diagnostic renderer or edge error service failed. |
| `resource_access_unknown` | `infra` | `diagnostic-page-render` | 503 | Conditional | `unknown` | The request failed at the edge, but the provider could not classify the failure safely. |
| `resource_access_failure_evidence_not_found` | `not-found` | `evidence-lookup` | 200 | No | `unknown` | No retained access failure evidence matched the request id and optional filters. |

`ownerHint` is a support/debug hint, not an authorization or billing boundary. Product surfaces
must not imply blame when the hint is `unknown` or based only on partial evidence.

## Mapping To Existing DomainError Values

The edge diagnostic code may include `causeCode` when a related source already has a structured
error:

| Related source | Example cause code | Edge diagnostic relationship |
| --- | --- | --- |
| `deployments.create` post-acceptance failure | `default_access_route_unavailable` | Route was never ready enough for public access. |
| Server bootstrap | `edge_proxy_host_port_conflict` | Proxy infrastructure cannot bind the required public port. |
| Route realization | `proxy_configuration_render_failed` | Route cannot be rendered or applied. |
| Resource health | `resource_public_access_probe_failed` | Current route exists but failed public access probing. |
| Resource health | `resource_proxy_route_unavailable` | Resource health already observed the proxy route as unavailable. |

The edge diagnostic layer must not rewrite those operation-owned errors. It references them for
context and keeps its own code focused on the request failure.

## Consumer Mapping

Web error pages must:

- show the stable code, request id, and timestamp;
- describe whether the browser reached Appaloft edge and whether the resource route/upstream failed;
- hide internal provider and resource details from unauthenticated visitors;
- link authenticated owners to resource health and diagnostic summary when a safe resource id is
  known.

API/problem responses must:

- keep the HTTP status aligned with the diagnostic code;
- include `code`, `phase`, `requestId`, and `retriable`;
- include `nextAction` and safe affected request metadata when available;
- omit HTML and localized explanatory text from machine fields.

Request-id evidence lookup responses must return safe not-found copy instead of raw storage errors
for ordinary no-match or expired evidence cases. Infrastructure failures while reading the evidence
store use `resource_access_failure_evidence_unavailable`, category `infra`, phase
`evidence-lookup`, and must not expose raw database or provider details.

Owner-facing Web, CLI, and future MCP tooling should map the same codes into i18n/user-facing
guidance and avoid branching on provider-native messages.

## Test Assertions

Tests must assert:

- provider-native failures are translated to stable diagnostic codes before rendering;
- HTML and problem responses expose the same code/request id;
- gateway-generated failures are eligible for replacement, but user application responses are not
  replaced by default;
- unauthenticated pages do not leak ids or internal details beyond the request id and public host;
- authenticated owner surfaces can use resource health and diagnostic summary for deeper detail;
- edge diagnostic codes do not use category `domain` unless the related cause is an aggregate
  invariant from another operation.

## Current Implementation Notes And Migration Gaps

The first implementation slice covers:

- provider-neutral classification types and helpers in application;
- HTML and problem-response rendering in the HTTP adapter;
- Traefik error middleware label output for gateway-generated 404, 502, 503, and 504 responses;
- optional Traefik served-route attachment when route realization receives a safe diagnostic
  renderer service URL;
- optional Traefik low-priority catch-all fallback routing for unmatched host/path requests when
  route realization receives a safe diagnostic renderer service URL;
- automatic renderer target forwarding while a wildcard-bound Appaloft backend service is running;
- explicit runtime configuration via `APPALOFT_RESOURCE_ACCESS_FAILURE_RENDERER_URL` as a topology
  override when the proxy manager knows a different reachable backend URL.

Existing health and diagnostic summary source errors cover several owner-facing causes, but there
is no renderer target for one-shot CLI remote SSH execution.

The 2026-05-01 baseline adds stable `nextAction`, affected request descriptor, and optional domain
binding id fields to the safe envelope and lets resource access read models expose one latest safe
edge failure for owner-facing `resources.health` and `resources.diagnostic-summary` composition.
This keeps latest-failure composition on existing read surfaces; real provider e2e lookup remains
future work. The request-id evidence lookup slice adds short-retention persistence and safe lookup
by request id.

The automatic route context lookup baseline may enrich captured evidence with safe related ids when
hostname/path match existing generated access, durable domain binding, server-applied, or deployment
route read state. No new public error code is added for lookup misses: a miss keeps the original
safe diagnostic envelope without unrelated ids, and the owner-facing next action remains an
existing diagnostic/read surface.
for retained envelopes without exposing raw provider payloads.

## Open Questions

- Should the immediate public page include a short owner login link when the request host maps to a
  resource, or should all owner navigation start from the console?
