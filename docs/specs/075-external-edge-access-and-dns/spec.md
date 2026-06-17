# External Edge Access And DNS

## Status

- Round: Spec Round
- Artifact state: future governed candidate; no implementation is authorized by this artifact
- Roadmap target: post-`1.0.0` external edge access track by default
- Compatibility impact: future additive public operations only after ADR, operation catalog, docs,
  and test matrix gates are accepted

## Business Outcome

Operators can let Appaloft maintain the public access configuration required for an Appaloft
Resource to be reachable through an external edge provider without Appaloft becoming a CDN, DNS
hosting product, WAF product, or general zone editor.

The intended user outcome is simple:

```text
Resource + DomainBinding + selected DeploymentTarget
  -> provider-neutral edge access intent
  -> external provider DNS/proxy/cache/TLS route application
  -> verification, diagnostics, cache purge, and rollback-safe route snapshots
```

This behavior extends Appaloft's existing access/domain/TLS model. It must preserve the current
deployment shape:

```text
detect -> plan -> execute -> verify -> rollback
```

External edge access is therefore deployment-adjacent route orchestration, not a new deployment
engine and not a hidden shortcut around Resource, DomainBinding, Certificate, DeploymentTarget, or
Deployment boundaries.

## Ubiquitous Language

| Term | Meaning | Context |
| --- | --- | --- |
| External edge access | Provider-backed public access configuration outside the selected Appaloft deployment target. | Runtime Topology / integration boundary |
| External edge provider | A concrete infrastructure adapter that can manage provider-side DNS, proxied routing, cache policy, TLS mode, tunnel/origin routing, observation, and purge where its capabilities allow. | Provider package |
| Edge provider connection | A Connections model `Connection` in the `dns` category, or a future external-edge category if an ADR accepts non-DNS edge capabilities. It carries safe credential/scope metadata for one provider account, zone, project, or equivalent provider scope. | Connections / future integration state |
| Edge delivery policy | Provider-neutral cache, proxy, origin, TLS, and purge intent that Appaloft may apply to a managed domain route. | Runtime Topology |
| DNS record intent | Provider-neutral record intent required for Appaloft-managed access, verification, or certificate challenge. | Runtime Topology / provider boundary |
| DNS observation | Read-only observed external DNS state used for readiness, diagnostics, and drift. | Read model / diagnostics |
| External edge route snapshot | Immutable snapshot of provider-neutral DNS/proxy/cache/TLS/origin settings resolved or applied for one route realization or deployment attempt. | Deployment/runtime route history |

## Domain Ownership

External edge access belongs under the Runtime Topology bounded context because it extends public
access routing, domain ownership, TLS readiness, and deployment target reachability.

The first formal ownership model should be:

| Concern | Owner |
| --- | --- |
| Durable custom domain ownership and route lifecycle | `DomainBinding` |
| Resource-owned generated access preference and path prefix | `ResourceAccessProfile` |
| Resource upstream endpoint | `ResourceNetworkProfile` |
| Target-local edge proxy intent/readiness | `DeploymentTarget` |
| Target-local proxy route rendering/application | `EdgeProxyProvider` and runtime target adapters |
| External provider credential/zone/capability metadata | Connections `Connection` readback for the concrete connector, such as `cloudflare-dns`; future edge-specific state only after an ADR accepts non-DNS edge capabilities |
| Provider-neutral cache/proxy/origin/TLS/purge intent | Future `EdgeDeliveryPolicy` value object or policy aggregate if independent lifecycle requires it |
| Required DNS records for an Appaloft-managed route | `DnsRecordIntent` value objects derived from DomainBinding/policy/verification workflows |
| Observed DNS/provider state | Read models and diagnostics |
| One deployment's resolved route/provider state | Deployment/runtime plan snapshots |

`ExternalEdgeProvider` is an application/provider port, not a core aggregate. Concrete provider
packages may manage provider-specific API calls, record types, proxied flags, cache APIs, tunnel
objects, page/rule objects, response headers, verification details, provider diagnostics, and purge
mechanisms, but those concrete shapes must not enter core aggregate state or public command schemas.

## DNS Scope

DNS management is in scope only when it is necessary for Appaloft-managed public access.

Allowed DNS scope:

- create, update, delete, and observe records Appaloft owns for a DomainBinding or generated access
  route;
- manage verification records required for domain ownership or certificate challenge workflows;
- manage provider-side proxy enablement when it is part of the external edge route intent;
- verify that a hostname resolves to the expected Appaloft target, tunnel, provider route, or
  generated target according to the selected policy;
- expose diagnostic reasons such as missing record, wrong target, stale record, disabled proxy,
  provider propagation pending, verification mismatch, or unsafe conflict;
- preserve safe applied/observed DNS metadata in route snapshots and read models.

Forbidden DNS scope:

- no general-purpose DNS zone editor;
- no arbitrary MX, mail-auth, SRV, TXT, CAA, NS, or registrar management except records explicitly
  required by an accepted Appaloft route, verification, or certificate workflow;
- no provider-specific DNS fields in core aggregate state;
- no implicit DNS mutation from `deployments.create`;
- no hidden takeover of a domain or zone without an explicit DomainBinding workflow and a visible
  Connections `Connection` or temporary Domain Connect consent/readiness state;
- no deletion of unmanaged user records;
- no silent rewrite of records that Appaloft did not create or adopt through an accepted workflow.

## Edge Delivery Scope

Allowed first-slice edge delivery scope:

- Connections catalog/connection readback for the selected DNS or future edge connector, including
  masked credential/capability state;
- zone or equivalent provider scope selection for Appaloft-managed domain routes;
- provider-neutral route planning for hostname, path prefix, origin, proxy mode, TLS mode, cache
  policy, and purge behavior;
- provider-side DNS/proxy route apply and verify for an accepted DomainBinding;
- deployment-time snapshot of the resolved external edge route used by the attempt;
- read-only preview of desired and latest applied external edge configuration;
- explicit scoped cache purge by hostname/path/tag where the provider supports it;
- diagnostics and drift detection over provider-observed safe state;
- rollback support that can re-apply the previous Appaloft-owned route snapshot when the governing
  recovery workflow accepts it.

Forbidden first-slice edge delivery scope:

- no Appaloft-operated global CDN network;
- no Appaloft-hosted object storage or asset CDN as an implicit side effect;
- no WAF/rate-limit/bot-management/security-rule platform in the first slice;
- no image optimization, edge functions, worker scripts, arbitrary header rules, A/B routing, or
  provider-specific programmable edge behavior;
- no global traffic manager or multi-origin load balancing unless a later ADR accepts it;
- no provider billing, plan, invoice, or quota management beyond safe capability/readiness
  diagnostics;
- no caching of dynamic API responses by default;
- no default full-zone purge;
- no provider-native raw payload exposure in Web, CLI, API, logs, errors, or audit output.

## Command And Query Boundary

Future public operations must be intention-revealing and must not reuse generic update verbs.

Provider connection lifecycle must reuse the accepted Connections operations and concrete connector
capabilities instead of introducing a second connection model:

- `connections.catalog.list`
- `connections.categories.list`
- `connections.list`
- `connections.show`
- `connections.connect.start`
- `connections.connect.callback`
- `connections.revoke`
- `connections.capability.plan`
- `connections.capability.accept`
- `connections.capability.apply`

Domain-bound external edge work still needs future operation names after ADR review:

- `domain-bindings.configure-edge-delivery`
- `domain-bindings.edge-delivery.show`
- `domain-bindings.edge-delivery.verify`
- `domain-bindings.edge-delivery.purge-cache`
- `resources.edge-configuration.preview`

The `connections.*` entries are governed by the Appaloft Connections spec. Domain-bound names are
candidate names only and must not be treated as implemented until they appear in `CORE_OPERATIONS.md`,
`packages/application/src/operation-catalog.ts`, CLI, HTTP/oRPC, Web, public docs, and tests.

`deployments.create` must remain ids-only. Deployment execution may consume resolved external edge
route snapshots, but callers must not submit provider DNS, CDN, cache, proxy, or TLS fields through
deployment admission.

## Provider Boundary

A future provider-neutral application port may look like:

```ts
interface ExternalEdgeProvider {
  planRoute(input: ExternalEdgeRoutePlanInput): Promise<Result<ExternalEdgeRoutePlan, DomainError>>;
  applyRoute(input: ExternalEdgeRouteApplyInput): Promise<Result<ExternalEdgeRouteSnapshot, DomainError>>;
  verifyRoute(input: ExternalEdgeRouteVerifyInput): Promise<Result<ExternalEdgeRouteObservation, DomainError>>;
  purgeCache(input: ExternalEdgeCachePurgeInput): Promise<Result<ExternalEdgeCachePurgeReceipt, DomainError>>;
  renderConfigurationView(input: ExternalEdgeConfigurationViewInput): Promise<Result<ExternalEdgeConfigurationView, DomainError>>;
}
```

The exact TypeScript shape belongs to the future ADR/spec. The dependency direction is fixed:

```text
core/application -> provider-neutral ports and value objects
composition root -> concrete provider package registration
provider package -> concrete API details, retries, API errors, and provider diagnostics
```

## Read Models And Diagnostics

The first read surfaces should be read-only and should answer operator questions without exposing
provider raw payloads:

- what Appaloft intends to apply;
- what Appaloft last applied;
- what the provider currently reports;
- whether DNS, proxying, TLS, cache, origin, and route verification are ready, pending, stale,
  failed, or unmanaged;
- what command or diagnostic action is safe to run next.

Failures must use stable provider-neutral codes, categories, phases, retriable flags, safe related
ids, and safe remediation hints. Provider-specific API messages may be summarized only after
redaction and classification.

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| EXT-EDGE-001 | Connect external edge provider | An operator has a provider account or zone they want Appaloft to manage for access routes | They create or select a Connections `Connection` for the concrete DNS or future edge connector | Appaloft stores only masked credential references and safe provider scope/capability metadata, then exposes safe readback without raw secrets. |
| EXT-EDGE-002 | Configure managed edge delivery for a domain binding | A DomainBinding exists and its resource has a reverse-proxy-compatible network profile | The operator configures edge delivery | Appaloft records provider-neutral cache/proxy/origin/TLS/purge intent without changing deployment admission input. |
| EXT-EDGE-003 | Apply DNS and edge route | A managed DomainBinding is eligible for edge delivery | A route realization workflow runs | Appaloft applies only Appaloft-owned DNS/provider route changes, verifies readiness, and records safe applied snapshot metadata. |
| EXT-EDGE-004 | DNS observation and diagnostics | A route is not reachable | The operator reads diagnostics | Appaloft reports safe provider-neutral DNS/proxy/TLS/origin/cache state and next actions without exposing provider raw payloads. |
| EXT-EDGE-005 | Scoped cache purge | A static asset route has stale content | The operator purges a bounded hostname/path/tag scope | Appaloft dispatches an explicit purge command, records a safe receipt, and never performs an implicit full-zone purge. |
| EXT-EDGE-006 | Rollback route snapshot | A deployment rollback needs the previous public access behavior | The recovery workflow accepts rollback | Appaloft can re-use the previous Appaloft-owned external edge route snapshot where provider capabilities allow it, while preserving DomainBinding ownership and audit state. |
| EXT-EDGE-007 | Unmanaged DNS protection | A provider zone contains records Appaloft did not create or adopt | Appaloft plans or applies a route | The workflow refuses destructive changes to unmanaged records and reports a conflict with safe metadata. |

## Public Surfaces

- CLI, HTTP/oRPC, Web, SDK, and future MCP/tool descriptors must reuse the same operation catalog
  entries and command/query schemas.
- Web may render provider configuration and diagnostics as read-only operator views, but Web must
  not own business rules or provider mutation logic.
- Public docs must describe task-oriented outcomes: connect provider, configure a domain route,
  verify DNS, purge cache, inspect diagnostics, and recover from route drift.
- Public docs must not use internal DDD/CQRS terms in primary user-facing pages.

## Non-Goals

- No current implementation work.
- No current operation catalog entry.
- No Appaloft-owned CDN network.
- No general DNS hosting product.
- No full DNS zone editor.
- No provider-specific domain model in `packages/core`.
- No provider SDK types in `packages/core` or `packages/application` command schemas.
- No hidden DNS, CDN, cache, or TLS mutation during deployment admission.
- No broad `{aggregate}.update` command.
- No provider-native raw payloads in public output, logs, errors, audit records, or snapshots.
- No automatic caching of dynamic application or API responses.
- No WAF, bot, edge compute, image optimization, global traffic management, billing management, or
  provider plan management in the first slice.

## ADR Requirement

Before Code Round, this behavior requires a new accepted ADR or an explicit update to the routing,
domain, TLS, default access, and edge proxy ADR set. The ADR must decide:

- whether Connections `Connection` readback is sufficient or non-DNS external edge requires an
  additional aggregate, application state, or integration state;
- whether `EdgeDeliveryPolicy` is owned by `DomainBinding`, a separate policy aggregate, or
  connection-scoped defaults;
- how connection credential custody, rotation, usage visibility, and deletion safety work;
- how DNS record adoption and unmanaged-record protection work;
- how route snapshots participate in deployment rollback and domain binding deletion;
- what async process attempt and retry ownership applies to apply/verify/purge workflows.

## Current Implementation Notes And Migration Gaps

Current Appaloft already separates generated access, durable domain bindings, certificates,
target-local edge proxy providers, route snapshots, access diagnostics, and provider-rendered proxy
configuration.

External edge access should extend those seams. It must not collapse generated access, durable
custom domains, target-local edge proxy configuration, external provider DNS, cache policy, and TLS
certificate lifecycle into one broad "CDN" object.
