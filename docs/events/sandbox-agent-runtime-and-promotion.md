# Sandbox Agent Runtime And Promotion Events

## Domain Facts

- `SandboxAgentRuntimeCreated`, `SandboxAgentRuntimeTerminated`
- `SandboxAgentRunAccepted`, `SandboxAgentRunWaitingForApproval`, `SandboxAgentRunCompleted`,
  `SandboxAgentRunFailed`, `SandboxAgentRunCancelled`
- `SourceArtifactCaptured`, `SourceArtifactDeleted`
- `SandboxPromotionPlanned`, `SandboxPromotionAccepted`, `SandboxPromotionCompleted`,
  `SandboxPromotionNeedsAttention`, `SandboxPromotionFailed`, `SandboxPromotionSuperseded`

Facts are produced only after the owning aggregate transition persists. Payloads include tenant-safe
identity, correlation/causation, occurrence time and required digests; they exclude prompt text,
hidden reasoning, file contents, secret values and raw harness/provider payloads.

## Application And Data-Plane Events

Run output/tool/progress frames and Promotion worker stage frames are application/process events.
They are redacted before bounded persistence and do not automatically become integration events.
Audit consumes safe control-plane facts through a separate adapter. Usage intent may be derived by
an explicit policy; Domain Event is not Billing Event.

## Delivery Semantics

- Tenant-scoped Run event sequence is monotonic and cursor-replayable.
- Duplicate harness/provider frames are deduplicated by Run + vendor frame identity when available.
- Promotion worker stages are idempotent by Promotion id and accepted idempotency key.
- No external integration event is promised in the first slice; adding one requires versioned
  published language and contract tests.
