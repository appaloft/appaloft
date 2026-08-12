# Local Development Session

## Status

- Round: Spec
- Artifact state: accepted by the owner-delegated recommended decision on 2026-08-12
- Code changes allowed: yes, after the linked public Ticket is `ready-for-agent`
- Compatibility: additive public minor surface
- Governing decision: ADR-110

## Business Outcome

A developer can run, understand and cleanly stop a local application graph with `appaloft dev`
using the same repository configuration and service vocabulary as Deploy, with interactive TUI and
headless/machine parity.

## Ubiquitous Language

| Term | Meaning |
| --- | --- |
| Development Plan | Immutable normalized view of the selected source, deployment-config graph and explicit dev overlay before mutation. |
| Development Session | One owned local execution attempt with services, processes, routes, health and cleanup evidence. |
| Development Service | One existing service-graph key realized as a host command or user Compose service. |
| Dev overlay | Optional command/watch behavior that changes development execution only, never Resource/Deployment identity. |
| Session manifest | Secret-free local coordination evidence used by status/logs/stop/reconciliation. |
| Dev gateway | Owned loopback HTTP/HTTPS router that maps stable service-key `.localhost` names to declared local ports. |

## Acceptance Criteria

| ID | Behavior | Given | When | Then |
| --- | --- | --- | --- | --- |
| DEV-PLAN-001 | Shared graph normalization | one valid deployment config exists | `appaloft dev plan` runs | service keys, runtime/network/health/env-ref/storage intent come from the same parser and deployment seed conversion used by Deploy. |
| DEV-PLAN-002 | Explicit dev overlay | root/service development command or watch mode exists | plan resolves | only execution command/watch changes; Resource, service, source and network identity remain unchanged. |
| DEV-PLAN-003 | Pre-effect blocker | command, source path, port, secret reference or substrate is unsupported | plan runs | a structured blocker returns before any process, listener, manifest or trust mutation. |
| DEV-START-004 | Foreground start | a valid plan and interactive terminal exist | `appaloft dev [path]` runs | one session starts in foreground, the TUI receives bounded state/log events, and Ctrl-C begins graceful stop. |
| DEV-START-005 | Detached start/resume | `--detach` is explicit or the same active identity already exists | start runs | the supervisor persists independently or the exact active manifest is resumed; no duplicate graph starts. |
| DEV-STATE-006 | Authoritative readback | a session is planned/running/degraded/failed/stopped | status is queried | service process, health, URL, watch and cleanup states come from the manifest plus bounded live reconciliation. |
| DEV-LOG-007 | Bounded logs | services emit stdout/stderr | TUI or `dev logs` follows | entries carry session/service/stream/time and bounded text; env/secret values and raw provider payloads are redacted. |
| DEV-HEALTH-008 | Truthful readiness | a declared health check exists | process starts | ready requires the declared check; no health check yields `running-unverified`, never ready. |
| DEV-GATEWAY-009 | Stable local URL | an HTTP service declares a port | gateway starts | a stable service-key `.localhost` URL routes to the service and is removed on stop. |
| DEV-TLS-010 | Explicit HTTPS trust | HTTPS is requested | certificates are prepared or trust is requested | generated credentials stay local; system trust changes only after explicit confirmation and are independently reversible. |
| DEV-WATCH-011 | Deterministic reload | watch is `native`, `restart` or `none` | source changes | native delegates to the command, restart performs bounded stop/start, and none performs no action; every transition is visible. |
| DEV-STOP-012 | Exact cleanup | a session owns processes/listeners/generated files | stop/Ctrl-C/failure occurs | only exact owned artifacts are removed; unrelated PIDs/listeners are untouched and cleanup evidence is returned. |
| DEV-DATA-013 | Persistent data safety | declared persistent storage exists | stop or reset runs | stop preserves it; reset requires explicit confirmation and reports exact deleted targets. |
| DEV-ERROR-014 | Structured failures | planning/start/health/watch/gateway/cleanup fails | result is rendered | stable code/category/phase/retriability and safe evidence survive across TUI and JSON. |
| DEV-PARITY-015 | Headless parity | no TTY, `--no-tui` or JSON is selected | plan/start/status/logs/stop runs | no renderer is required and the same session lifecycle/readback is available. |
| DEV-PACKAGE-016 | Supported artifacts | macOS/Linux CLI artifacts are built | dev help or TUI starts | renderer assets resolve safely; missing assets produce a stable headless fallback without terminal damage. |
| DEV-DEPLOY-017 | Deploy parity | the same config is supplied to dev and deploy plan normalization | parity is compared | common graph fields are byte-for-byte equivalent after normalization; dev-only overlay fields are absent from deployment admission. |

## Public Surfaces

- CLI: `appaloft dev [path]`, plus `dev plan`, `dev start`, `dev status`, `dev logs`, `dev stop`
  and destructive confirmed `dev reset`.
- Options: explicit `--detach`, `--no-tui`, structured output, `--env-file`, service filter,
  HTTP/HTTPS selection and local trust confirmation.
- Repository config: optional root/service `development.command` and
  `development.watch = native | restart | none`.
- Renderer protocol: additive `development/v1` mode in the packaged Rust/Ratatui sidecar.
- API/oRPC/SDK/MCP: no new remote operation in R2a; the local CLI/runtime contract becomes the R2b
  Worker transport payload.
- Persistence: secret-free local manifests/log files only; no product database table or event.

## Error Contract

| Code | Category | Phase | Retriable |
| --- | --- | --- | --- |
| `development_plan_invalid` | validation/application | `development-plan` | no |
| `development_substrate_unsupported` | application | `development-plan` | no |
| `development_session_conflict` | conflict | `development-admission` | no |
| `development_process_failed` | infra | `development-start` or `development-watch` | conditional |
| `development_health_failed` | infra/timeout | `development-health` | yes |
| `development_gateway_failed` | infra | `development-gateway` | conditional |
| `development_cleanup_incomplete` | infra | `development-cleanup` | yes |

Errors and manifests must not contain secret values, complete environments, certificate private
keys, arbitrary process output, or unrelated host process details.

## Lifecycle

`planned -> starting -> running | degraded | failed -> stopping -> stopped`.

- Failure after a child starts must still enter stopping/cleanup before terminal failed readback.
- Re-run may resume only an exact matching active source/config identity.
- A stale manifest is reconciled to stopped/failed with evidence; it never authorizes killing a PID
  without matching owned process-start metadata.

## Non-Goals

- Remote Worker transport, enrollment or mTLS (Spec 133).
- Creating Deployment/Resource/Workspace history for a dev process.
- Production domains, managed databases, environment promotion or Railway command aliases.
- Windows interactive TUI in the first supported release.

## Compatibility And Migration

Existing config and CLI behavior remains valid. The new `development` block is optional and is
excluded from production Deployment command inputs. Removing R2a leaves Deploy and Workspace state
unchanged; stopped manifests/logs may be pruned safely by exact session identity.
