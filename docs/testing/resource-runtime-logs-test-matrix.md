# Resource Runtime Logs Test Matrix

## Normative Contract

Tests for `resources.runtime-logs` must verify that application runtime logs are resource-owned,
runtime-agnostic, stream-capable, cancellable, and separate from deployment-attempt logs.

## Global References

This test matrix inherits:

- [ADR-018: Resource Runtime Log Observation](../decisions/ADR-018-resource-runtime-log-observation.md)
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
| Runtime adapter | Backend-specific normalization without leaking Docker/PM2/systemd types. |
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
- Expected absence of Docker/PM2/systemd leakage:
```

## Query And Service Matrix

| Case | Input/read state | Expected query behavior | Expected port behavior | Expected result |
| --- | --- | --- | --- | --- |
| Bounded tail | Resource has latest observable runtime instance | Resolve latest instance | Open reader with `follow = false` and tail limit | Return no more than requested lines |
| Follow stream | Resource has latest observable runtime instance | Resolve latest instance | Open reader with `follow = true` and abort signal | Yield line events until cancelled/source closes |
| Specific deployment | `deploymentId` belongs to resource | Use selected instance | Open reader with deployment context | Lines include deployment context when available |
| Deployment mismatch | `deploymentId` belongs to another resource | Reject during context resolution | Reader not called | `resource_runtime_logs_context_mismatch` |
| No observable instance | Resource has no deployment/runtime placement | Reject during runtime resolution | Reader not called | `resource_runtime_logs_unavailable` |
| Multi-service missing service | Multiple services and no default selected | Reject validation or service resolution | Reader not called | `validation_error` with service details |
| Adapter unsupported | Runtime kind has no reader | Resolve context then fail open | Reader returns not-configured error | `resource_runtime_logs_not_configured` |
| Secret masking | Source emits value known to redaction context | Mask before transport | Reader or service masks line | Line has `masked = true`; secret absent |

## Streaming Matrix

| Case | Log source behavior | Expected stream result | Expected cleanup |
| --- | --- | --- | --- |
| Line sequence | Source yields stdout/stderr lines | Events preserve source order per stream | Stream remains open |
| Heartbeat | Source is idle in follow mode | Heartbeat events may be emitted | Stream remains open |
| Source closes | Runtime backend closes normally | `closed(source-ended)` or transport EOF | Backend handle closed |
| Caller cancels | Abort signal fires | `closed(cancelled)` when possible | Child process/socket/file watcher stopped |
| Source fails after open | Backend returns an error after some lines | Structured stream error event | Backend handle closed |
| Transport disconnect | HTTP/SSE client disconnects | Abort signal propagates | No orphan child process or SSH command |

## Runtime Adapter Matrix

| Backend | Expected adapter behavior | Must not expose |
| --- | --- | --- |
| Docker | May call Docker API or `docker logs --tail --follow`; normalize to line events. | Container id as public input, Docker-specific event type in query output. |
| PM2 | May call PM2 API or `pm2 logs --raw`; normalize process output. | PM2 process object as public input/output. |
| systemd | May call journal API or `journalctl`; normalize journal entries. | systemd unit object as public input/output. |
| File tail | May watch a configured log file; normalize appended lines. | Host filesystem path as public input. |
| Provider API | May call provider log endpoint; normalize provider records. | Provider-native event shape in query output. |

## Entrypoint Matrix

| Entrypoint | Case | Expected behavior |
| --- | --- | --- |
| Web | Resource page opens bounded tail | Uses `resources.runtime-logs`; renders lines incrementally. |
| Web | User toggles follow then navigates away | Stream aborts and backend closes. |
| CLI | `resource logs --tail 50` | Prints bounded tail, exits cleanly. |
| CLI | `resource logs --follow` then Ctrl-C | Aborts stream, exits cleanly. |
| HTTP/oRPC | Bounded endpoint | Reuses query schema and serializes normalized lines. |
| HTTP/oRPC | Streaming endpoint | Reuses query schema and serializes normalized events. |

## Current Implementation Notes And Migration Gaps

Application tests cover bounded reads, injected reader delegation, secret masking, follow mode,
deployment/resource mismatch, and no observable deployment errors.

Existing deployment log tests, if present, should remain deployment-attempt focused and must not be
reused as proof that runtime application log streaming works.

Additional adapter/transport/browser tests should cover runtime reader cancellation, Docker/Compose
command construction, oRPC streaming iteration, and Web stream stop-on-navigation behavior.

## Open Questions

- Which runtime adapter should be the first contract-tested implementation beyond application
  query-service tests?
