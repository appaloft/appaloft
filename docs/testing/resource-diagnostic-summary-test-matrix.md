# Resource Diagnostic Summary Test Matrix

## Normative Contract

Tests for `resources.diagnostic-summary` must verify that the product can produce a copyable,
redacted, resource-scoped support payload even when access, proxy configuration, or runtime logs are
missing.

The summary is a read query and must have no write side effects.

## Global References

This test matrix inherits:

- [resources.diagnostic-summary Query Spec](../queries/resources.diagnostic-summary.md)
- [Resource Diagnostic Summary Workflow Spec](../workflows/resource-diagnostic-summary.md)
- [Resource Diagnostic Summary Error Spec](../errors/resources.diagnostic-summary.md)
- [Resource Diagnostic Summary Implementation Plan](../implementation/resource-diagnostic-summary-plan.md)
- [Project Resource Console Workflow Spec](../workflows/project-resource-console.md)
- [Quick Deploy Workflow Spec](../workflows/quick-deploy.md)
- [Resource Runtime Logs Test Matrix](./resource-runtime-logs-test-matrix.md)
- [Edge Proxy Provider And Route Configuration Test Matrix](./edge-proxy-provider-and-route-configuration-test-matrix.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)

## Test Layers

| Layer | Focus |
| --- | --- |
| Query schema | Resource/deployment ids, include flags, tail bounds. |
| Query handler/service | Delegates to query service and composes read sources without mutation. |
| Read-model composition | Resource, deployment, access, proxy, log, runtime-log, and system sections. |
| Redaction | Secrets and credential-bearing strings are absent from sections and copy payloads. |
| Partial failure | Missing access/log/proxy sources become section statuses and source errors. |
| API/oRPC | Exposes the same query schema and result shape. |
| CLI | Emits copyable JSON and readable summaries from the query result. |
| Web/desktop | Resource detail and Quick Deploy completion expose a copy diagnostic affordance. |

## Given / When / Then Template

```md
Given:
- Resource:
- Deployment:
- Access summary:
- Proxy configuration source:
- Deployment log source:
- Runtime log source:
- System context source:
- Entrypoint:

When:
- The caller requests a diagnostic summary.

Then:
- Query input:
- Source calls:
- Summary sections:
- Source errors:
- Copy payload:
- Redaction:
- Expected absence of mutations:
```

## Query And Service Matrix

| Test ID | Preferred automation | Case | Input/read state | Expected result | Expected source errors | Required assertion |
| --- | --- | --- | --- | --- | --- | --- |
| RES-DIAG-QRY-001 | integration | Complete summary | Resource has latest deployment, access route, proxy config, deployment logs, and runtime logs | `ok` with all sections available | None | Copy payload includes resource/deployment/server/destination ids. |
| RES-DIAG-QRY-002 | integration | Resource missing | Unknown resource id | `err(not_found)` | None | No source readers called. |
| RES-DIAG-QRY-003 | integration | Deployment mismatch | `deploymentId` belongs to another resource | `err(resource_diagnostic_context_mismatch)` | None | No log/proxy readers called. |
| RES-DIAG-QRY-004 | integration | Deployment omitted | Resource has latest deployment | `ok` pinned to latest relevant deployment | None | `focus.deploymentId` is populated. |
| RES-DIAG-QRY-005 | integration | No deployments | Resource has no deployments | `ok` with deployment/access/log sections empty or unavailable | Source errors for unavailable deployment-derived sources | Copy payload still includes resource/project/environment context. |
| RES-DIAG-QRY-006 | integration | Access missing after success | Deployment succeeded but generated/durable URL unavailable | `ok` with access unavailable | `default_access_route_unavailable` or owning access error | Copy payload explains route status and does not imply success means reachable. |
| RES-DIAG-QRY-007 | integration | Proxy provider missing | Access/proxy route needs missing provider | `ok` with proxy failed/unavailable | `proxy_provider_unavailable` | Provider key and phase are included when safe. |
| RES-DIAG-QRY-008 | integration | Runtime logs unavailable | Deployment exists but no observable runtime placement | `ok` with runtime logs unavailable | `resource_runtime_logs_unavailable` | Deployment logs remain separate from runtime logs. |
| RES-DIAG-QRY-009 | integration | Runtime logs not requested | Caller disables runtime tail | `ok` with runtime logs not-requested | None | No runtime log reader call. |
| RES-DIAG-QRY-010 | integration | Deployment logs empty | Deployment log source returns no lines | `ok` with deployment logs empty | None | Empty is distinct from unavailable. |
| RES-DIAG-QRY-011 | integration | Optional source failure | Proxy config render fails | `ok` with proxy failed section | `proxy_configuration_render_failed` | Whole query still succeeds. |
| RES-DIAG-QRY-012 | integration | Core read model failure | Resource context cannot be safely loaded | `err(resource_diagnostic_unavailable)` | None | No partial unsafe summary is returned. |
| RES-DIAG-QRY-013 | integration | Redaction failure | Redactor cannot prove safety | `err(resource_diagnostic_redaction_failed)` | None | No copy payload is returned. |
| RES-DIAG-QRY-014 | integration | Copy markdown failure | Optional markdown render fails but JSON succeeds | `ok` | `resource_diagnostic_copy_render_failed` | `copy.json` remains present. |
| RES-DIAG-QRY-015 | integration | Access precedence summary | Durable ready, server-applied, and generated routes are all present | `ok` with access and proxy sections available | None | Copy payload preserves separate route URLs and proxy/provider context uses durable, server-applied, latest generated, then planned generated precedence for the selected route. |

## Entrypoint Matrix

| Test ID | Preferred automation | Entrypoint | Case | Expected behavior |
| --- | --- | --- | --- | --- |
| RES-DIAG-ENTRY-001 | e2e-preferred | Web resource detail | Access panel error and log panel empty | Copy action calls `resources.diagnostic-summary`; copied payload includes stable ids and section errors. |
| RES-DIAG-ENTRY-002 | e2e-preferred | Web Quick Deploy completion | Deployment id returned but access URL missing | Completion surface offers copy diagnostic summary with resource/deployment ids. |
| RES-DIAG-ENTRY-003 | e2e-preferred | Desktop | Local/desktop backend mode | Summary includes safe backend/local mode fields and excludes private local paths. |
| RES-DIAG-ENTRY-004 | e2e-preferred | CLI | `resource diagnose --json` | Prints canonical summary JSON from the query result. |
| RES-DIAG-ENTRY-005 | e2e-preferred | CLI | Human output | Shows section statuses and stable codes without hiding JSON availability. |
| RES-DIAG-ENTRY-006 | e2e-preferred | API/oRPC | HTTP query | Reuses input schema and returns `ResourceDiagnosticSummary`. |

## Redaction Matrix

| Test ID | Preferred automation | Source | Sensitive example | Expected result |
| --- | --- | --- | --- | --- |
| RES-DIAG-REDACT-001 | integration | Deployment logs | Environment secret value in log line | Value masked; line marked masked. |
| RES-DIAG-REDACT-002 | integration | Runtime logs | Token-like application output | Value masked when known redaction inputs match. |
| RES-DIAG-REDACT-003 | integration | Proxy config | Credential-bearing command or header | Secret absent or section redacted. |
| RES-DIAG-REDACT-004 | integration | System context | Private key path or credential file path | Field omitted or redacted. |
| RES-DIAG-REDACT-005 | integration | Copy payload | Any source secret | Secret absent from `copy.json`, markdown, and plain text. |

## Current Implementation Notes And Migration Gaps

Executable application query-service tests now exist in
`packages/application/test/resource-diagnostic-summary.test.ts`.

Current executable coverage includes:

- canonical copy JSON with stable resource/deployment ids;
- deployment/runtime log secret redaction and absence of secrets in `copy.json`;
- safe system context that omits private database locations;
- missing access represented as an `ok` summary with `default_access_route_unavailable`;
- proxy provider failure represented as an `ok` summary with `proxy_provider_unavailable`;
- runtime log reader failure represented as an `ok` summary with
  `resource_runtime_logs_unavailable`;
- runtime log tail not requested without calling the runtime log reader;
- selected deployment/resource context mismatch returning
  `resource_diagnostic_context_mismatch`.

Remaining coverage gaps:

- query schema edge cases for invalid ids/include flags/tail bounds;
- no deployments and empty deployment logs branches;
- redaction failure as a whole-query error;
- API/oRPC contract tests;
- CLI output tests;
- Web clipboard/e2e coverage for the resource detail affordance and future Quick Deploy
  completion affordance.

## Open Questions

- Should browser tests assert clipboard content exactly as canonical JSON, or assert structured
  fields before rendering to keep localization independent?
