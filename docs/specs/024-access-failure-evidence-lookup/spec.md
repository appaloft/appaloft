# Access Failure Evidence Lookup

## Status

- Round: Spec Round -> Test-First -> Code Round -> Post-Implementation Sync
- Artifact state: implemented
- Roadmap target: Phase 6 Access Policy, Domain/TLS Lifecycle, And Observability Hardening (`0.8.0` gate)
- Compatibility impact: `pre-1.0-policy`; additive public read query and safe diagnostic fields

## Business Outcome

When a visitor cannot open an Appaloft generated URL or custom domain, the request id shown on the
edge diagnostic page must be enough for an operator to find the safe evidence in Appaloft.

Operators should not need screenshots, SSH access, raw proxy logs, provider-native payloads, cookies,
authorization headers, or manual Traefik log inspection to know which resource/access route likely
failed and what read-only follow-up action is appropriate.

This slice establishes the short-retention evidence structure and request-id lookup baseline. It
does not require real Traefik error-middleware e2e or automatic route/resource context lookup from
provider metadata.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Access failure evidence | Short-retention, copy-safe record of one `resource-access-failure/v1` envelope plus capture/expiry metadata. | Resource access observation | edge failure evidence |
| Request-id lookup | Read query that starts from the public diagnostic `requestId` and optionally narrows by resource, host, or path. | Operator troubleshooting | access failure lookup |
| Matched source | The read source that satisfied a lookup, initially the short-retention evidence read model. | Resource access observation | evidence source |
| Safe not-found copy | Stable non-secret lookup response when no retained evidence matches the request id and filters. | Public query contract | not found diagnostic |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| ACCESS-FAIL-EVIDENCE-SPEC-001 | Lookup by request id | A safe access-failure envelope was captured before its retention expiry | The operator queries by `requestId` | The query returns the safe envelope, matched source, related ids, next action, `capturedAt`, and `expiresAt`. |
| ACCESS-FAIL-EVIDENCE-SPEC-002 | Optional filters narrow lookup | Evidence exists for the request id but the supplied `resourceId`, `hostname`, or `path` does not match | The operator queries with that filter | The query returns safe not-found copy instead of leaking another resource's evidence. |
| ACCESS-FAIL-EVIDENCE-SPEC-003 | Expired evidence is not returned | Evidence exists but `expiresAt` is before lookup time | The operator queries by request id | The query returns safe not-found copy and may prune expired records. |
| ACCESS-FAIL-EVIDENCE-SPEC-004 | Unsafe inputs stay out | Provider/raw logs, query strings, headers, cookies, tokens, credentials, and private payloads are present near the failure source | Evidence is captured and looked up | The stored and returned record contains only sanitized `resource-access-failure/v1` fields. |

## Domain Ownership

- Bounded context: Workload Delivery / Resource access observation with Runtime Topology provider
  translation.
- Aggregate/resource owner: none. This is short-retention read-model evidence, not aggregate state.
- Upstream/downstream contexts: edge proxy providers may produce safe envelopes; resource health,
  diagnostic summary, proxy preview, runtime logs, and deployment logs remain downstream
  observation surfaces.

## Public Surfaces

- API/oRPC: add a read-only request-id lookup query using the same application query input schema.
- CLI: add a read-only command for operators to query by request id.
- Web/UI: no route-repair logic; existing resource detail panels keep consuming shared
  access/health/diagnostic read models. A full Web lookup form is a later UI slice.
- Config: not applicable.
- Events: not applicable; capture is request-time operational evidence and does not publish domain
  facts.
- Public docs/help: reuse the diagnostics troubleshooting page with a stable request-id lookup
  anchor.

## Non-Goals

- Do not implement real Traefik error-middleware e2e in this slice.
- Do not infer route/resource context from provider-native labels or raw logs yet.
- Do not add route repair, redeploy, rollback, certificate, or domain mutation behavior.
- Do not make the evidence recorder or read model provider-specific.
- Do not persist secrets, private keys, provider raw payloads, SSH credentials, authorization
  headers, cookies, sensitive query strings, or raw remote logs.

## Open Questions

- Should a later Web slice add a global request-id lookup box, or keep lookup entrypoints in CLI/API
  until authentication and ownership filtering are finalized?

## Implementation Notes

- Implemented on 2026-05-01 as `resources.access-failure-evidence.lookup`.
- The public lookup is additive and dispatches through `QueryBus` for CLI and HTTP/oRPC.
- The renderer captures only the safe `resource-access-failure/v1` envelope through the recorder
  into the short-retention read model; persistence failure is logged and does not prevent the
  diagnostic response.
- Web panels remain unchanged in this slice and continue to consume shared resource detail, health,
  proxy preview, runtime log, deployment log, and diagnostic summary read models.
