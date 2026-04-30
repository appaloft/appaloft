# Route Intent/Status And Access Diagnostics

## Status

- Round: Spec Round -> Test-First -> Code Round -> Post-Implementation Sync
- Artifact state: implemented
- Roadmap target: Phase 6 Access Policy, Domain/TLS Lifecycle, And Observability Hardening (`0.8.0` gate)
- Compatibility impact: `pre-1.0-policy`; additive shared observation contract across existing
  access/proxy/health/log/diagnostic surfaces without adding deployment admission fields

## Business Outcome

Operators need one trustworthy way to understand why a resource route is usable, blocked, stale, or
unobservable. Generated access, durable domain routes, server-applied routes, immutable deployment
snapshot routes, proxy preview, health, logs, and diagnostic copy must describe route intent/status
with the same provider-neutral vocabulary.

This behavior closes the Phase 6 observation foundation. It is the shared acceptance contract that
future domain binding show/update/delete/retry, certificate show/import/revoke/delete/retry, proxy
repair, Docker Swarm runtime targets, and Kubernetes runtime targets must satisfy before they can be
called user-visible lifecycle capabilities.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Route intent/status descriptor | Copy-safe provider-neutral description of one route's intended host/path/protocol, route source, owner context, proxy status, readiness/TLS/domain health, latest observation pointer, blocking reason, and recommended action. | Resource access observation | route descriptor |
| Stable diagnostic id | Deterministic support/debug id for one route descriptor, safe to copy into diagnostic summaries and bug reports. | Diagnostics | diagnostic route id |
| Route source | The owner/source of route intent: generated default access, durable domain binding, server-applied route, or immutable deployment snapshot route. | Access/proxy/health/diagnostics | route kind |
| Access failure diagnostic | Provider-neutral request-time or read-model diagnostic state for access failures, using stable `resource_access_*` or route observation codes. | Edge/request/resource observation | access diagnostic |
| Selected route | The current route chosen by precedence for health/proxy/diagnostic summaries. | Read model composition | current route |
| Context route | A non-selected route still shown so users can see generated/default or fallback access without it being incorrectly preferred. | Resource access summary | fallback route |

## Route Descriptor Contract

Every route/access observation surface that needs route status must use this logical shape:

```ts
type RouteIntentStatusDescriptor = {
  schemaVersion: "route-intent-status/v1";
  routeId: string;
  diagnosticId: string;
  source:
    | "generated-default-access"
    | "durable-domain-binding"
    | "server-applied-route"
    | "deployment-snapshot-route";
  intent: {
    host: string;
    pathPrefix: string;
    protocol: "http" | "https";
    routeBehavior: "serve" | "redirect";
    redirectTo?: string;
    redirectStatus?: 301 | 302 | 307 | 308;
  };
  context: {
    resourceId: string;
    deploymentId?: string;
    serverId?: string;
    destinationId?: string;
    runtimeTargetKind?: string;
  };
  proxy: {
    intent: "not-required" | "required" | "unknown";
    applied: "not-configured" | "planned" | "applied" | "ready" | "not-ready" | "stale" | "failed" | "unknown";
    providerKey?: string;
  };
  domainVerification: "not-applicable" | "pending" | "verified" | "failed" | "unknown";
  tls: "not-applicable" | "disabled" | "pending" | "active" | "missing" | "expired" | "failed" | "unknown";
  runtimeHealth: "healthy" | "degraded" | "unhealthy" | "starting" | "stopped" | "not-deployed" | "unknown";
  latestObservation?: {
    source: "resource-access-summary" | "proxy-preview" | "resource-health" | "runtime-logs" | "access-failure-diagnostic" | "deployment-snapshot";
    observedAt?: string;
    requestId?: string;
    deploymentId?: string;
  };
  blockingReason?: RouteAccessBlockingReason;
  recommendedAction: "none" | "wait" | "check-health" | "inspect-logs" | "inspect-proxy-preview" | "diagnostic-summary" | "verify-domain" | "fix-dns" | "provide-certificate" | "repair-proxy" | "manual-review";
  copySafeSummary: {
    status: "available" | "unavailable" | "not-ready" | "failed" | "stale" | "unknown";
    code?: string;
    phase?: string;
    message: string;
  };
};
```

`RouteAccessBlockingReason` must use stable codes for at least:

- `runtime_not_ready`
- `health_check_failing`
- `proxy_route_missing`
- `proxy_route_stale`
- `domain_not_verified`
- `certificate_missing`
- `certificate_expired_or_not_active`
- `dns_points_elsewhere`
- `server_applied_route_unavailable`
- `observation_unavailable`

Descriptor copy must never include secrets, raw provider SDK payloads, private keys, environment
values, request headers/cookies, internal network coordinates, raw server command output, or
unredacted application output.

## Route Precedence

All current-route consumers must apply the same precedence:

1. Ready durable domain binding route.
2. Non-ready durable domain binding route when the surface needs to explain why the intended custom
   domain blocks access.
3. Server-applied route when no durable route is selected.
4. Latest generated default access route.
5. Planned generated default access route.
6. Immutable deployment snapshot route only when the caller explicitly asks for the historical
   deployment attempt.
7. No public route.

Generated access remains visible as a context route. It must not hide a durable custom domain that
is pending verification, missing certificate coverage, DNS-mispointed, or route-unavailable.

## Acceptance Stages

| ID | Stage | Required proof |
| --- | --- | --- |
| ROUTE-INTENT-STAGE-001 | Resource access summary projection | Generated, durable, server-applied, and planned routes expose descriptor-compatible route source/status. |
| ROUTE-INTENT-STAGE-002 | Proxy configuration preview | Planned/latest/snapshot proxy preview renders the same selected route and route source labels without applying config. |
| ROUTE-INTENT-STAGE-003 | Fake route render/apply/readback | Hermetic provider/runtime fixtures prove route realization status without real DNS, TLS, SSH, or reverse proxy. |
| ROUTE-INTENT-STAGE-004 | Health/readiness composition | `resources.health` maps descriptor blocking reasons to public/proxy/check/source-error sections. |
| ROUTE-INTENT-STAGE-005 | Runtime log/access observation composition | Log availability and access observations reference the same selected route context without parsing log text for readiness. |
| ROUTE-INTENT-STAGE-006 | Diagnostic summary copy shape | `resources.diagnostic-summary` includes selected/context route facts and access diagnostics in copy-safe JSON. |
| ROUTE-INTENT-STAGE-007 | Web/API/CLI parity | Web, CLI, API/oRPC, and future MCP/tool surfaces consume shared operation/query contracts instead of redefining transport-only route shapes. |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| ROUTE-INTENT-SPEC-001 | Generated access descriptor | A resource has a planned or latest generated default route | Access summary, proxy preview, health, and diagnostics read the route | The descriptor source is generated default access and it is visible without being treated as a durable domain binding. |
| ROUTE-INTENT-SPEC-002 | Durable route precedence | Ready durable, server-applied, and generated routes all exist | Current route is selected | Durable route wins and generated/server-applied routes remain context. |
| ROUTE-INTENT-SPEC-003 | Non-ready durable route blocks current access | A durable domain binding exists but is pending/not ready while fallback routes exist | Health and diagnostics compose public access | The durable route remains selected as blocking with `domain_not_verified`, `certificate_missing`, or owning reason; fallbacks stay context. |
| ROUTE-INTENT-SPEC-004 | Server-applied route precedence | No selected durable route exists and a server-applied route is applied | Current route is selected | Server-applied route wins over generated access without creating `DomainBinding` or `Certificate` state. |
| ROUTE-INTENT-SPEC-005 | Deployment snapshot immutability | A caller asks for deployment-snapshot route scope | Proxy preview or deployment detail reads it | The immutable snapshot route is labeled historical and does not become current resource access. |
| ROUTE-INTENT-SPEC-006 | Unavailable observation is typed state | Proxy/readiness/log/access observation cannot run | Health/diagnostics compose summaries | The route is `unknown` or `unavailable` with `observation_unavailable`, not a deployment failure unless deployment execution failed. |
| ROUTE-INTENT-SPEC-007 | Access diagnostics are copy-safe | Edge/provider failure or route status has unsafe raw detail | Diagnostic summary copy is generated | Copy JSON contains stable ids/codes/phases only and excludes secrets/raw provider or command output. |

## Domain Ownership

- Bounded context: Workload Delivery / Resource observation with Runtime Topology route realization
  and Resource/Deployment read models.
- Resource owns reusable network/access profile and current resource observation surfaces.
- Deployment owns accepted attempts and immutable route snapshots only.
- DomainBinding and Certificate lifecycle remain separate future mutation lifecycles.
- Runtime/proxy providers own concrete render/apply/readback and provider-native failure
  translation.
- Core may own only provider-neutral route/access/status value objects when domain state needs them;
  provider SDK, DNS/TLS, Docker/SSH, reverse-proxy, and command-output details stay outside core.

## Public Surfaces

- API/oRPC: no new public operation for this slice; existing `resources.show`,
  `resources.health`, `resources.runtime-logs`, `resources.proxy-configuration.preview`, and
  `resources.diagnostic-summary` share the descriptor-compatible contract.
- CLI: existing resource show/health/logs/proxy-config/diagnose commands consume the same queries.
- Web/UI: resource detail and Quick Deploy completion consume shared query output and cannot
  reconstruct route precedence or proxy status in Svelte-only logic.
- Repository config: `access.domains[]` remains server-applied route intent in SSH mode, not a
  deployment admission field.
- Public docs/help: existing access/diagnostics/proxy anchors apply unless user-visible copy changes
  during implementation.
- Future MCP/tools: generated from the same operation catalog/query contracts.

## Non-Goals

- Do not add a new deployment admission command.
- Do not add `deployments.retry`, `deployments.redeploy`, or `deployments.rollback`.
- Do not change `deployments.create` ids-only boundary.
- Do not add source/runtime/network/framework/buildpack/domain/TLS fields to `deployments.create`.
- Do not implement domain binding show/update/delete/retry lifecycle in this slice.
- Do not implement certificate import/revoke/delete/retry lifecycle in this slice.
- Do not require real external DNS, TLS, SSH, or Traefik in default tests.
- Do not move provider-specific proxy, DNS, TLS, Docker, SSH, or SDK details into core or
  application command/query schemas.

## Open Questions

- Should a future public `resources.routes` query be added if the existing access/proxy/health/
  diagnostic surfaces become too crowded, or should route descriptors remain embedded in those
  read models through Phase 6?
