# Resource Access Failure Diagnostics Workflow Spec

## Normative Contract

Resource access failure diagnostics is an internal transport/read workflow for requests that reach
the Appaloft edge proxy but cannot be served by the target resource route.

The workflow classifies gateway-generated public access failures into stable Appaloft diagnostic
codes, renders a safe browser error page for HTML requests, and returns a structured problem
response for API-style requests.

It is not a public business operation. It must not create deployments, restart workloads, apply
proxy configuration, mutate route state, mark health, open log streams, or change domain binding
readiness.

```text
browser/API request
  -> Appaloft edge proxy receives request
  -> proxy cannot complete gateway routing/upstream response
  -> edge provider emits a safe failure envelope
  -> diagnostic renderer classifies platform/resource/config ownership hint
  -> HTML page or problem response includes request id and stable code
  -> owner-facing surfaces use resources.health, resources.diagnostic-summary, and proxy config
     queries for deeper detail
```

## Global References

This workflow inherits:

- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-019: Edge Proxy Provider And Observable Configuration](../decisions/ADR-019-edge-proxy-provider-and-observable-configuration.md)
- [ADR-020: Resource Health Observation](../decisions/ADR-020-resource-health-observation.md)
- [Default Access Domain And Proxy Routing Workflow](./default-access-domain-and-proxy-routing.md)
- [Edge Proxy Provider And Route Realization Workflow](./edge-proxy-provider-and-route-realization.md)
- [Resource Health Observation Workflow](./resource-health-observation.md)
- [Resource Diagnostic Summary Workflow](./resource-diagnostic-summary.md)
- [resources.health Query Spec](../queries/resources.health.md)
- [resources.diagnostic-summary Query Spec](../queries/resources.diagnostic-summary.md)
- [Resource Access Failure Diagnostics Error Spec](../errors/resource-access-failure-diagnostics.md)
- [Resource Access Failure Diagnostics Test Matrix](../testing/resource-access-failure-diagnostics-test-matrix.md)
- [Resource Access Failure Diagnostics Implementation Plan](../implementation/resource-access-failure-diagnostics-plan.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Workflow Position

This workflow sits at the edge adapter boundary. It observes:

- the HTTP request host, path, method, accept header, and generated request id;
- the matched resource route id when one exists;
- safe route metadata such as resource id, deployment id, server id, destination id, provider key,
  route source, and route status;
- the edge provider's normalized gateway failure signal;
- cached resource access, health, deployment, and proxy route state when available.

It produces:

- a provider-neutral `ResourceAccessFailureDiagnostic`;
- a short-retention safe evidence record for request-id lookup when an evidence recorder is
  available;
- a safe HTML diagnostic page for browser navigation requests;
- a structured problem response for API or non-HTML requests;
- logs/metrics/traces keyed by request id and stable failure code.

It does not own aggregate invariants. Resource reachability, route realization, proxy readiness,
deployment state, domain binding readiness, and health remain owned by their existing workflows and
queries.

## Failure Diagnostic Envelope

The edge provider or diagnostic adapter must pass only a sanitized envelope into product rendering:

```ts
type ResourceAccessFailureDiagnostic = {
  schemaVersion: "resource-access-failure/v1";
  requestId: string;
  generatedAt: string;
  code:
    | "resource_access_route_not_found"
    | "resource_access_proxy_unavailable"
    | "resource_access_route_unavailable"
    | "resource_access_upstream_unavailable"
    | "resource_access_upstream_connect_failed"
    | "resource_access_upstream_timeout"
    | "resource_access_upstream_reset"
    | "resource_access_upstream_tls_failed"
    | "resource_access_edge_error"
    | "resource_access_unknown";
  category: "infra" | "integration" | "timeout" | "not-found" | "async-processing";
  phase:
    | "edge-request-routing"
    | "proxy-route-observation"
    | "upstream-connection"
    | "upstream-response"
    | "proxy-route-realization"
    | "public-route-verification"
    | "diagnostic-page-render";
  httpStatus: 404 | 502 | 503 | 504;
  retriable: boolean;
  ownerHint: "platform" | "resource" | "operator-config" | "unknown";
  affected?: {
    url?: string;
    hostname?: string;
    path?: string;
    method?: string;
  };
  route?: {
    host?: string;
    pathPrefix?: string;
    resourceId?: string;
    deploymentId?: string;
    domainBindingId?: string;
    serverId?: string;
    destinationId?: string;
    providerKey?: string;
    routeId?: string;
    routeSource?: "generated-default" | "durable-domain" | "server-applied" | "deployment-snapshot";
    routeStatus?: string;
  };
  nextAction:
    | "check-health"
    | "inspect-runtime-logs"
    | "inspect-deployment-logs"
    | "inspect-proxy-preview"
    | "diagnostic-summary"
    | "verify-domain"
    | "fix-dns"
    | "repair-proxy"
    | "manual-review";
  causeCode?: string;
  correlationId?: string;
  causationId?: string;
};
```

Raw provider logs, raw reverse-proxy error text, container names, internal IP addresses, private
ports that are not already part of safe route metadata, filesystem paths, headers, cookies, tokens,
environment variables, and unredacted application output must not be included.

When a route can be safely associated with the failure, the `route` object must align with the
shared route intent/status descriptor contract in
[Route Intent/Status And Access Diagnostics](../specs/020-route-intent-status-and-access-diagnostics/spec.md).
`affected.url`, `affected.path`, and `affected.method` are request descriptors only; they must be
normalized and must not include query strings, headers, cookies, authorization material, or raw
provider error payloads. `nextAction` is stable product guidance for the owner-facing follow-up
surface. It must point to an observation or explicitly modeled workflow, not to a hidden mutation.
Request-time diagnostics remain observation. They may set blocking reasons such as
`proxy_route_missing`, `proxy_route_stale`, `runtime_not_ready`, or `observation_unavailable`, but
they must not mutate deployment, route, domain binding, certificate, proxy, or health state.

## Request-ID Evidence Lookup

The request-id lookup baseline is the public read query:

```text
resources.access-failure-evidence.lookup
```

The query input starts from `requestId`. Optional `resourceId`, `hostname`, and `path` filters may
narrow the match. Filters must not expand visibility; when the retained evidence exists but does not
match a supplied filter, the query returns stable safe not-found copy.

The query returns:

- the safe `resource-access-failure/v1` envelope;
- `matchedSource`, initially `short-retention-evidence-read-model`;
- safe related ids from the envelope route context;
- `nextAction`;
- `capturedAt`;
- `expiresAt`.

When no retained, non-expired evidence matches, it returns a non-secret not-found result containing
the requested id, filter echo, stable code `resource_access_failure_evidence_not_found`, and
`nextAction = diagnostic-summary`.

The evidence projection is a short-retention read model, not aggregate state or an aggregate
repository. Capturing evidence must not block the public error page if persistence is temporarily
unavailable. Stored evidence must not contain query strings, headers, cookies, authorization
material, SSH credentials, private keys, provider raw payloads, raw remote logs, command output,
internal IP addresses, or unredacted application output.

## Classification Rules

Classification starts from the provider-neutral signal, not from user-facing text.

| Failure signal | Diagnostic code | Category | Phase | Owner hint |
| --- | --- | --- | --- | --- |
| No host/path route matched any active Appaloft route | `resource_access_route_not_found` | `not-found` | `edge-request-routing` | `platform` or `operator-config` |
| Route requires proxy infrastructure that is absent, failed, or not ready | `resource_access_proxy_unavailable` | `infra` | `proxy-route-observation` | `platform` |
| Route exists but is stale, failed, unapplied, or not ready | `resource_access_route_unavailable` | `infra` | `proxy-route-observation` | `platform` or `operator-config` |
| Route exists but no current upstream target can be selected | `resource_access_upstream_unavailable` | `infra` | `upstream-connection` | `resource` |
| Upstream connection refused or network connect failed | `resource_access_upstream_connect_failed` | `infra` | `upstream-connection` | `resource` |
| Upstream connection exceeded the gateway timeout | `resource_access_upstream_timeout` | `timeout` | `upstream-connection` | `resource` |
| Upstream closed/reset before the gateway had a complete response | `resource_access_upstream_reset` | `infra` | `upstream-response` | `resource` |
| Upstream TLS/protocol negotiation failed | `resource_access_upstream_tls_failed` | `integration` | `upstream-connection` | `operator-config` |
| Diagnostic renderer or edge error service failed | `resource_access_edge_error` | `infra` | `diagnostic-page-render` | `platform` |
| Provider cannot safely classify the failure | `resource_access_unknown` | `infra` | `diagnostic-page-render` | `unknown` |

The classification codes are outer observation codes. They can refer to related domain/application
errors through `causeCode`, but they must not replace the code owned by `deployments.create`,
server bootstrap, route realization, resource health, or diagnostic summary.

Aggregate `domain` category remains reserved for invariant or state-machine rejection inside core
business behavior. A proxy 502, upstream timeout, or unreachable user workload is not itself a
domain-category error.

## Response Rendering

HTML browser requests should receive a diagnostic page when:

- the failure is gateway-generated by the Appaloft edge/proxy path;
- the request accepts `text/html`;
- the diagnostic service can render a safe response;
- the upstream application did not successfully return its own response.

API and non-HTML requests should receive a structured problem response with:

- HTTP status 404, 502, 503, or 504;
- stable diagnostic `code`;
- `phase`;
- `requestId`;
- `retriable`;
- optional safe related ids;
- no provider-native private details.

Appaloft must not override user application 500/502/503/504 responses by default. If a user
application successfully returns a response, the response belongs to that application unless a
future explicit resource policy opts into platform-managed application error pages.

## User And Owner Guidance

Public visitors may see:

- browser request reached Appaloft edge or did not;
- Appaloft edge status;
- resource deployment status as working, error, or unknown;
- retry guidance;
- request id and timestamp.

Authenticated owners may see deeper details through existing owner-scoped surfaces:

- `resources.health` for current health and public access checks;
- `resources.diagnostic-summary` for copyable support/debug context;
- `resources.proxy-configuration.preview` for read-only route configuration;
- deployment logs and runtime logs where available.

The public page must not expose project names, private resource names, deployment logs, command
output, stack traces, secrets, internal network coordinates, or credential paths.

## Current Implementation Notes And Migration Gaps

The first implementation slice exists:

- application exports provider-neutral resource access failure diagnostic types, parsers, and a
  classifier for stable `resource_access_*` codes;
- the HTTP adapter exposes `/.appaloft/resource-access-failure` and renders safe HTML for
  `Accept: text/html` or `application/problem+json` for API/non-HTML callers;
- the Traefik provider package exposes a provider-rendered error middleware label configuration
  helper for gateway-generated 404, 502, 503, and 504 paths;
- Traefik route realization can attach that middleware to served routes when the provider receives
  an explicit safe diagnostic renderer service URL, while redirect-only routes remain redirect-only;
- Traefik route realization can also add a low-priority catch-all fallback router for unmatched
  host/path requests when a safe diagnostic renderer service URL is available; the fallback rewrites
  to `/.appaloft/resource-access-failure`, injects a provider-neutral `route-not-found` signal, and
  excludes `/.well-known/acme-challenge/` requests;
- a long-running Appaloft backend service that is already listening can expose a provider-neutral
  renderer target to local and SSH deployment route realization; `host.docker.internal` is used
  only when the service is wildcard-bound and Traefik is bootstrapped by Appaloft;
- `APPALOFT_RESOURCE_ACCESS_FAILURE_RENDERER_URL` remains an explicit topology override for
  deployments where the proxy manager knows a different reachable backend URL.

The current slice classifies from safe code, signal, or status inputs. It does not yet read
route/resource context from applied proxy metadata, automatically
derive a diagnostic renderer service URL for one-shot CLI remote SSH execution, or attach the
latest edge failure to resource health and diagnostic summary read models.

The 2026-05-01 baseline adds the additive envelope fields `nextAction`, affected request
descriptor, and optional `domainBindingId`, and allows an existing resource access read model to
carry `latestAccessFailureDiagnostic`. `resources.health` and `resources.diagnostic-summary` may
compose that latest safe envelope into source errors and copyable diagnostic payloads. This is a
latest-failure composition structure for existing read surfaces; real Traefik e2e probing,
companion/static renderer support, and automatic route/resource lookup remain future hardening gaps.

The request-id evidence lookup slice adds `resources.access-failure-evidence.lookup` and a
short-retention evidence read model. Automatic provider metadata context lookup, real Traefik e2e
probing, and companion/static renderer support remain future hardening gaps.

Existing `resources.health`, `resources.diagnostic-summary`, and
`resources.proxy-configuration.preview` already provide the owner-facing read surfaces that the
edge diagnostic page should link to or summarize after authentication.

## Open Questions

- Should edge request failure envelopes be persisted in a short-retention read model, or only
  emitted to logs/traces and echoed in the immediate response?
- Should owners be able to customize public wording or branding per resource while keeping the
  machine-readable diagnostic code unchanged?
