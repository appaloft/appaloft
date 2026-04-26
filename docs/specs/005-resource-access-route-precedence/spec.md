# Resource Access Route Precedence

## Status
- Round: Spec -> Test-First -> Code -> Post-Implementation Sync
- Artifact state: current for the Web current-route precedence slice

## Business Outcome

Operators should see the same current public access URL everywhere Appaloft summarizes a resource.
When a durable ready domain or server-applied config domain exists, Web surfaces must not keep
showing a generated/default URL as the primary route.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| `ResourceAccessSummary` | Resource-scoped read projection for planned/generated, durable, and server-applied access routes. | Workload Delivery / Runtime Topology | none |
| Current access route | The route selected from `ResourceAccessSummary` for a single primary URL display. | Web, CLI, API read consumers | access URL |
| Durable domain route | A ready managed `DomainBinding` route projected as `latestDurableDomainRoute`. | Runtime Topology | custom domain |
| Server-applied domain route | Pure CLI/SSH config-domain route projected as `latestServerAppliedDomainRoute`. | Runtime Topology | config domain |
| Generated access route | Default generated route projected as latest or planned generated access. | Runtime Topology | default access URL |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| DEF-ACCESS-ENTRY-008 | Web current access route precedence | `ResourceAccessSummary` contains generated, server-applied, and optionally durable routes. | Resource detail or Quick Deploy completion selects one current route. | The selected URL is durable ready domain first, then server-applied config domain, then latest generated, then planned generated. |
| DEF-ACCESS-QRY-002 | Read-model current-route consumers | Resource health, diagnostics, proxy preview, and Web consume the same precedence contract. | A resource query includes multiple route fields. | Separate route fields remain visible, and single-route consumers use the same precedence. |

## Domain Ownership

- Bounded context: Workload Delivery read model with Runtime Topology route state.
- Aggregate/resource owner: `Resource` owns the resource detail surface; `DomainBinding` and server-applied route state remain separate owners of route facts.
- Upstream/downstream contexts: route snapshots and domain/read state feed Web read-only display.

## Public Surfaces

- API: no schema change; existing `ResourceAccessSummary` fields are reused.
- CLI: no command change in this slice.
- Web/UI: resource detail access URL and Quick Deploy completion select the same current route.
- Config: no config schema change.
- Events: no event change.
- Public docs/help: reuse `/docs/access/generated-routes/#access-generated-route`.

## Non-Goals

- No new route intent update/delete/reconcile operation.
- No new generated access policy command.
- No change to deployment admission route resolution.
- No new `ResourceAccessSummary` field.

## Open Questions

- None for this slice.
