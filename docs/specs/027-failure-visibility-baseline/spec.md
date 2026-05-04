# Access/Proxy/Log/Health Failure Visibility Baseline

## Status

- Round: Spec Round -> Test-First -> Code Round -> Post-Implementation Sync
- Artifact state: active
- Roadmap target: Phase 6 Access Policy, Domain/TLS Lifecycle, And Observability Hardening (`0.8.0` gate)
- Compatibility impact: `pre-1.0-policy`; no new public operation, no route repair, and no route ownership change

## Business Outcome

When a player cannot open a generated access URL, custom domain, server-applied route, or proxy
preview route, Appaloft should explain the failure through its own read surfaces instead of asking
for screenshots, SSH log dumps, provider raw payloads, or manual reverse-proxy inspection.

This slice establishes the safe cross-surface failure visibility baseline for existing
`resources.show`, `resources.health`, `resources.proxy-configuration.preview`,
`resources.runtime-logs`, `deployments.logs`, `resources.diagnostic-summary`, and
`resources.access-failure-evidence.lookup` surfaces.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Failure visibility baseline | Minimum safe read/query contract that shows where an access, proxy, log, health, or route-context failure belongs. | Resource observation | observability baseline |
| Safe failure descriptor | Copy-safe structured failure fields containing stable code, phase, source, related ids, next action, and redacted message when available. | Diagnostics/read models | source error |
| Suggested next action | Read-only guidance such as checking health, inspecting logs, proxy preview, or diagnostic summary. It is not an automatic repair, redeploy, rollback, or route mutation. | Access diagnostics | next action |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| FAILURE-VIS-SPEC-001 | Safe access failure context | A latest safe `resource-access-failure/v1` envelope exists with applied route or lookup-enriched related ids | Health or diagnostic summary is queried | The response preserves request id, source code, phase, owner hint, safe related resource/deployment/domain/server/destination/route ids, and suggested next action. |
| FAILURE-VIS-SPEC-002 | Proxy/render/apply failure is visible | Proxy preview or diagnostic composition receives a provider/render/apply failure | Diagnostic summary is queried | The proxy section and source errors expose a stable failure code/phase/status without provider raw payloads. |
| FAILURE-VIS-SPEC-003 | Log unavailable states are visible | Runtime or deployment log sources cannot be read | Diagnostic summary is queried | Runtime/deployment log sections report unavailable/failed status with stable reason code/phase instead of requiring raw remote logs. |
| FAILURE-VIS-SPEC-004 | Health failure guidance is safe | Health checks or public access probes fail with sensitive adjacent text | `resources.health` or diagnostic composition reports the failure | Messages and copy JSON redact auth headers, cookies, sensitive query values, private keys, SSH credentials, provider raw payloads, and raw remote command output. |
| FAILURE-VIS-SPEC-005 | Next actions do not mutate | Failure descriptors recommend health, logs, proxy preview, diagnostic summary, DNS/domain verification, or manual review | API, CLI, Web, or future tool consumers render the descriptor | The surface treats next actions as suggestions only and does not repair proxy state, redeploy, rollback, or mutate routes automatically. |

## Domain Ownership

- Bounded context: Workload Delivery / Resource observation with Runtime Topology route realization.
- Aggregate/resource owner: none for this baseline. It composes existing read models and adapter
  observations; no aggregate state is introduced.
- Upstream/downstream contexts: edge proxy providers, runtime log readers, deployment log read
  models, resource health probes, access-failure evidence, automatic route context lookup, and
  applied route context metadata.

## Public Surfaces

- API/oRPC: existing query responses remain the public contract; no new route is added.
- CLI: existing JSON output remains renderer-over-query output; no CLI-only diagnostic shape is added.
- Web/UI: Web consumes contracts/read models only and does not hide diagnostic logic in Svelte
  components. No Web lookup form is added.
- Config: not applicable.
- Events: not applicable.
- Public docs/help: existing access/proxy/diagnostics troubleshooting anchors remain sufficient
  because this slice does not add a new user workflow or help affordance.

## No ADR Needed

No new ADR is required. The slice implements ADR-017 generated access routing, ADR-018 runtime log
observation, ADR-019 observable edge proxy configuration and access diagnostics, ADR-020 resource
health observation, ADR-024 server-applied route state, and ADR-029 deployment observation/log
boundaries. It does not change command/query boundaries, route/domain/TLS ownership, durable state
shape, route repair semantics, retry/redeploy/rollback semantics, or public operation identity.

## Non-Goals

- No real Traefik middleware e2e.
- No Web lookup form.
- No route repair, redeploy, rollback, or automatic recovery behavior.
- No provider-native raw metadata parsing.
- No companion/static renderer for one-shot CLI remote SSH runtimes.
- No new `resources.routes` query.

## Open Questions

- Should a later Web slice add a request-id lookup form after ownership filtering and auth rules are
  finalized?
