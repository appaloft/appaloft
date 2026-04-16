# Resource Runtime Logs Test Matrix

## Normative Contract

Tests for `resources.runtime-logs` must verify that application runtime logs are resource-owned,
runtime-agnostic, stream-capable, cancellable, and separate from deployment-attempt logs.

## Global References

This test matrix inherits:

- [ADR-018: Resource Runtime Log Observation](../decisions/ADR-018-resource-runtime-log-observation.md)
- [ADR-021: Docker/OCI Workload Substrate](../decisions/ADR-021-docker-oci-workload-substrate.md)
- [resources.runtime-logs Query Spec](../queries/resources.runtime-logs.md)
- [Resource Runtime Log Observation Workflow Spec](../workflows/resource-runtime-log-observation.md)
- [Resource Runtime Logs Error Spec](../errors/resources.runtime-logs.md)
- [Resource Runtime Logs Implementation Plan](../implementation/resource-runtime-logs-plan.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)

## Test Layers

| Layer | Focus |
| --- | --- |
| Query schema | Input validation, tail limits, optional follow/cursor/service fields. |
| Query handler/service | Resolves resource/deployment context and delegates to injected port. |
| Runtime log reader fake | Async iterable line, heartbeat, error, close, and cancellation behavior. |
| Runtime adapter | Backend-specific normalization without leaking Docker/Compose or future runtime-native types. |
| HTTP/oRPC | Bounded read and stream serialization reuse query schema. |
| CLI | Tail and follow behavior, Ctrl-C cancellation, structured errors. |
| Web resource page | Incremental rendering, reconnect/error state, no deployment-log confusion. |

## Given / When / Then Template

```md
Given:
- Resource:
- Deployment/runtime instance:
- Runtime backend:
- Log source behavior:
- Entrypoint:

When:
- The caller requests bounded logs or starts follow mode.

Then:
- Query input:
- Port call:
- Stream events:
- Cancellation behavior:
- Error mapping:
- Expected absence of Docker/Compose/future runtime leakage:
```

## Query And Service Matrix

| Test ID | Preferred automation | Case | Input/read state | Expected query behavior | Expected port behavior | Expected result |
| --- | --- | --- | --- | --- | --- | --- |
| RES-LOGS-QRY-001 | integration | Bounded tail | Resource has latest observable runtime instance | Resolve latest instance | Open reader with `follow = false` and tail limit | Return no more than requested lines |
| RES-LOGS-QRY-002 | integration | Follow stream | Resource has latest observable runtime instance | Resolve latest instance | Open reader with `follow = true` and abort signal | Yield line events until cancelled/source closes |
| RES-LOGS-QRY-003 | integration | Specific deployment | `deploymentId` belongs to resource | Use selected instance | Open reader with deployment context | Lines include deployment context when available |
| RES-LOGS-QRY-004 | integration | Deployment mismatch | `deploymentId` belongs to another resource | Reject during context resolution | Reader not called | `resource_runtime_logs_context_mismatch` |
| RES-LOGS-QRY-005 | integration | No observable instance | Resource has no deployment/runtime placement | Reject during runtime resolution | Reader not called | `resource_runtime_logs_unavailable` |
| RES-LOGS-QRY-006 | integration | Multi-service missing service | Multiple services and no default selected | Reject validation or service resolution | Reader not called | `validation_error` with service details |
| RES-LOGS-QRY-007 | integration | Adapter unsupported | Runtime kind has no reader | Resolve context then fail open | Reader returns not-configured error | `resource_runtime_logs_not_configured` |
| RES-LOGS-QRY-008 | integration | Secret masking | Source emits value known to redaction context | Mask before transport | Reader or service masks line | Line has `masked = true`; secret absent |

## Streaming Matrix

| Test ID | Preferred automation | Case | Log source behavior | Expected stream result | Expected cleanup |
| --- | --- | --- | --- | --- | --- |
| RES-LOGS-STREAM-001 | integration | Line sequence | Source yields stdout/stderr lines | Events preserve source order per stream | Stream remains open |
| RES-LOGS-STREAM-002 | integration | Heartbeat | Source is idle in follow mode | Heartbeat events may be emitted | Stream remains open |
| RES-LOGS-STREAM-003 | integration | Source closes | Runtime backend closes normally | `closed(source-ended)` or transport EOF | Backend handle closed |
| RES-LOGS-STREAM-004 | integration | Caller cancels | Abort signal fires | `closed(cancelled)` when possible | Child process/socket/file watcher stopped |
| RES-LOGS-STREAM-005 | integration | Source fails after open | Backend returns an error after some lines | Structured stream error event | Backend handle closed |
| RES-LOGS-STREAM-006 | integration | Transport disconnect | HTTP/SSE client disconnects | Abort signal propagates | No orphan child process or SSH command |

## Runtime Adapter Matrix

| Test ID | Preferred automation | Backend | Expected adapter behavior | Must not expose |
| --- | --- | --- | --- | --- |
| RES-LOGS-ADAPTER-001 | contract | Docker | May call Docker API or `docker logs --tail --follow`; for generic-SSH targets it may run the same Docker log command through SSH with resolved server credentials; normalize to line events. | Container id as public input, Docker-specific event type in query output, local-only assumptions for remote targets. |
| RES-LOGS-ADAPTER-002 | contract | Future PM2/systemd/file-tail readers | May be added only after workload runtime semantics are accepted by ADR; normalize process output. | Runtime-native process/unit/path object as public input/output. |
| RES-LOGS-ADAPTER-003 | contract | Provider API | May call provider log endpoint; normalize provider records. | Provider-native event shape in query output. |

## Entrypoint Matrix

| Test ID | Preferred automation | Entrypoint | Case | Expected behavior |
| --- | --- | --- | --- | --- |
| RES-LOGS-ENTRY-001 | e2e-preferred | Web | Resource page opens bounded tail | Uses `resources.runtime-logs`; renders lines incrementally. |
| RES-LOGS-ENTRY-002 | e2e-preferred | Web | User starts follow after a bounded tail is already visible | Opens follow mode without appending duplicate historical tail lines. |
| RES-LOGS-ENTRY-003 | e2e-preferred | Web | User stops follow or navigates away | Stream aborts and backend closes; normal cancellation is not rendered as a user-facing error. |
| RES-LOGS-ENTRY-004 | e2e-preferred | CLI | `resource logs --tail 50` | Prints bounded tail, exits cleanly. |
| RES-LOGS-ENTRY-005 | e2e-preferred | CLI | `resource logs --follow` then Ctrl-C | Aborts stream, exits cleanly. |
| RES-LOGS-ENTRY-006 | e2e-preferred | HTTP/oRPC | Bounded endpoint | Reuses query schema and serializes normalized lines. |
| RES-LOGS-ENTRY-007 | e2e-preferred | HTTP/oRPC | Streaming endpoint | Reuses query schema and serializes normalized events. |

## Current Implementation Notes And Migration Gaps

Application tests cover bounded reads, injected reader delegation, secret masking, follow mode,
deployment/resource mismatch, and no observable deployment errors.

Existing deployment log tests, if present, should remain deployment-attempt focused and must not be
reused as proof that runtime application log streaming works.

Additional adapter/transport/browser tests should cover runtime reader cancellation, oRPC streaming
iteration, and Web stream stop-on-navigation behavior. Runtime adapter tests cover local Docker
output draining, bounded process timeout cleanup, and generic-SSH Docker/Compose command
construction, including no SSH ControlMaster reuse for bounded reads. Web verification covers lazy
runtime-log loading for the logs tab, duplicate-tail avoidance when follow starts, and silent normal
stream cancellation when follow stops.

## Open Questions

- Which runtime adapter should be the first contract-tested implementation beyond application
  query-service tests?
