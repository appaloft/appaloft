# Domain Binding Show/Configure/Delete/Retry Lifecycle

## Status

- Round: Spec Round -> Verification-first -> Code Round -> Post-Implementation Sync
- Artifact state: implemented for show, route configuration, delete safety/delete, and ownership
  verification retry
- Roadmap target: Phase 6 Access Policy, Domain/TLS Lifecycle, And Observability Hardening
  (`0.8.0` gate)
- Compatibility impact: `pre-1.0-policy`; additive public operations over existing
  `DomainBinding` lifecycle without changing `deployments.create`

## Business Outcome

Operators need to manage an accepted custom domain binding after creation without hiding lifecycle
work inside deployments or Web-only flows. They can read one binding, configure whether it serves
traffic or redirects to a canonical binding, check deletion safety, delete route intent safely, and
retry ownership verification when DNS/ownership evidence changes.

This slice does not start certificate revoke/delete/retry lifecycle, deployment retry/redeploy/
rollback, or a route repair operation. Certificate readiness is read as context only.

## Ubiquitous Language

| Term | Meaning |
| --- | --- |
| Domain binding readback | One-binding view that explains ownership, route readiness, proxy readiness, selected route/access diagnostic state, generated access fallback, and certificate readiness context. |
| Route configuration | The binding-owned route behavior: serve traffic or redirect to an existing served binding in the same owner/path scope. This is the specific business "update" operation; generic `domain-bindings.update` remains forbidden by ADR-026. |
| Delete safety | Read-only preflight that explains whether deletion can proceed without revoking certificates, deleting generated access, erasing deployment snapshot history, or removing server-applied route audit. |
| Ownership verification retry | A new verification attempt for the same binding after DNS/evidence changes. It does not replay old events and does not retry certificate issuance. |

## Operations

| Capability | Operation |
| --- | --- |
| Show/readback | `domain-bindings.show` |
| Configure route behavior | `domain-bindings.configure-route` |
| Delete safety preflight | `domain-bindings.delete-check` |
| Delete binding route intent | `domain-bindings.delete` |
| Retry ownership verification | `domain-bindings.retry-verification` |

`domain-bindings.update` is intentionally absent. The domain model requires intention-revealing
mutation names.

## Traceability Table

| Capability | Contract/source of truth | API/CLI/Web surface | Operation catalog entry | Test matrix id | Existing test name | Missing gap |
| --- | --- | --- | --- | --- | --- | --- |
| domain-bindings.show/readback | ADR-002, ADR-005, ADR-006, ADR-017, ADR-019, Routing Domain TLS workflow, route intent/status descriptor | API `GET /api/domain-bindings/{domainBindingId}`; CLI `domain-binding show`; Web reads details through the same oRPC client from the domain binding console | `domain-bindings.show` | `ROUTE-TLS-READMODEL-011`, `ROUTE-TLS-ENTRY-021`, `PUB-DOCS-002` | `packages/application/test/domain-binding-lifecycle.test.ts` | None for this slice. |
| domain-bindings.configure-route | ADR-002, ADR-026, routing workflow canonical redirect rules | API `POST /api/domain-bindings/{domainBindingId}/route`; CLI `domain-binding configure-route`; Web uses the same client when exposing route behavior edits | `domain-bindings.configure-route` | `ROUTE-TLS-CMD-021`, `ROUTE-TLS-ENTRY-022` | New targeted use-case/schema tests | Host/path/owner changes remain out of scope; create a new binding instead. |
| domain-bindings.delete-check / delete safety | ADR-002, ADR-017, ADR-019, async lifecycle/delete safety rules | API `GET /api/domain-bindings/{domainBindingId}/delete-check`; CLI `domain-binding delete-check`; Web renders blockers before delete through the same oRPC client | `domain-bindings.delete-check` | `ROUTE-TLS-READMODEL-012`, `ROUTE-TLS-ENTRY-023` | `packages/application/test/domain-binding-lifecycle.test.ts` | None for this slice. |
| domain-bindings.delete | ADR-002, ADR-026, this spec | API `DELETE /api/domain-bindings/{domainBindingId}`; CLI `domain-binding delete --confirm`; Web uses the same command after safety preflight | `domain-bindings.delete` | `ROUTE-TLS-CMD-022`, `ROUTE-TLS-ENTRY-024` | New targeted use-case tests | Certificate revoke/delete is blocked and remains certificate lifecycle work. |
| domain-bindings.retry-verification | ADR-006 retry rules, async lifecycle retry rules | API `POST /api/domain-bindings/{domainBindingId}/verification-retries`; CLI `domain-binding retry-verification`; Web can offer when binding is pending/not ready | `domain-bindings.retry-verification` | `ROUTE-TLS-CMD-023`, `ROUTE-TLS-ENTRY-025` | New targeted use-case tests | Route repair retry is later route repair work; certificate retry is certificate lifecycle work. |
| Generated access fallback | ADR-017, route intent/status descriptor | Show response includes generated fallback context from resource access summary | `domain-bindings.show`, existing `resources.show` | `ROUTE-INTENT-SPEC-001`, `ROUTE-TLS-READMODEL-011` | Existing route descriptor tests plus show readback test | None for this slice. |
| Durable domain route status | Routing Domain TLS workflow and route intent/status descriptor | Show/list/resource access summary share status vocabulary | `domain-bindings.show`, `domain-bindings.list`, `resources.show` | `ROUTE-TLS-READMODEL-001`, `ROUTE-TLS-READMODEL-007`, `ROUTE-TLS-READMODEL-011` | Existing list/read-model tests plus show readback test | None for this slice. |
| Proxy preview/readiness | ADR-019 and `resources.proxy-configuration.preview` | Show reads proxy readiness context; preview remains the detailed config query | `domain-bindings.show`, `resources.proxy-configuration.preview` | `PROXY-OBS-001`, `ROUTE-TLS-READMODEL-011` | Existing proxy preview tests plus show readback test | Real Traefik smoke remains opt-in. |
| Health | ADR-020 and route intent/status descriptor | Show links selected route context; health remains `resources.health` | `domain-bindings.show`, `resources.health` | `HEALTH-ACCESS-001`, `ROUTE-TLS-READMODEL-011` | Existing health tests plus show readback test | None for this slice. |
| Diagnostic summary | Resource Diagnostic Summary and access failure diagnostics | Show carries selected route descriptor; full copy payload remains `resources.diagnostic-summary` | `domain-bindings.show`, `resources.diagnostic-summary` | `RES-DIAG-QRY-017`, `ROUTE-TLS-READMODEL-011` | Existing diagnostic tests plus show readback test | Request-id envelope lookup remains later hardening. |
| Public docs/help anchors | ADR-030, public docs structure, docs registry | Docs pages under Access/Domains; CLI/API descriptions and Web help registry point at stable anchors | Docs coverage for each new operation | `PUB-DOCS-002`, `PUB-DOCS-003`, `PUB-DOCS-011`, `PUB-DOCS-012` | Docs registry operation coverage tests | Future MCP/tool descriptions are generated from catalog later. |

## Phase 6 Blocking Decision

Implemented in this slice:

- domain binding show/readback;
- route behavior configuration as the specific update operation;
- delete-check and guarded delete;
- ownership verification retry;
- Web domain binding console affordances for show/configure-route/delete-check/delete/retry;
- public docs/help coverage and operation catalog alignment.

Deferred:

- certificate revoke/delete/retry/show lifecycle beyond read-only certificate readiness context;
- route repair/reconcile operation for provider route attempts;
- deployment retry/redeploy/rollback;
- real DNS/TLS/Traefik/SSH default tests.

## Safety Rules

`domain-bindings.delete` must:

- require exact id confirmation;
- run the same safety rules exposed by `domain-bindings.delete-check`;
- not delete generated access state;
- not rewrite deployment snapshots;
- not erase server-applied route audit;
- not revoke or delete certificates;
- block while active certificate state is attached.

`domain-bindings.retry-verification` must:

- create a new verification attempt id;
- preserve previous attempts as history;
- reset DNS observation to a waitable pending state when expected targets exist;
- not replay `domain-binding-requested` or `domain-bound`;
- not dispatch certificate issuance/retry.
