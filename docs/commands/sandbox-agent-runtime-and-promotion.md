# Sandbox Agent Runtime And Promotion Commands

## Runtime And Run

| Operation | Intent | Required identity/scope | Result |
| --- | --- | --- | --- |
| `sandboxes.agents.runtimes.create` | Create one harness-neutral Runtime under a ready Sandbox from an admitted template. | Sandbox write | Stable Runtime descriptor. |
| `sandboxes.agents.runtimes.terminate` | Terminate one Runtime and cancel/terminate any active Run. | Sandbox write | Terminal Runtime descriptor. |
| `sandboxes.agents.runs.create` | Submit one fresh or explicit-continuation task with idempotency key. | Runtime execute | Accepted Run descriptor or busy conflict with active Run id. |
| `sandboxes.agents.runs.cancel` | Request cancellation of one active Run. | Runtime execute | Cancelling/terminal Run descriptor. |
| `sandboxes.agents.approvals.resolve` | Approve or reject one exact waiting capability request. | External capability-approval scope | Resolved approval and resumed/rejected Run state. |

The command payload never accepts caller conversation history as Appaloft-owned state. Instructions
are bounded task input encrypted at rest; persisted events contain only redacted observable output. Runtime-scoped
credentials and identities cannot resolve approvals.

## Artifact And Candidate Preview

| Operation | Intent | Required identity/scope | Result |
| --- | --- | --- | --- |
| `sandboxes.source-artifacts.create` | Freeze a safe source root from a quiescent Sandbox into an immutable artifact. | Sandbox read/export | Artifact digest, manifest summary and provenance. |
| `sandboxes.source-artifacts.delete` | Delete only an unreferenced, retention-eligible artifact. | Artifact delete | Deleted descriptor or reference conflict. |
| `sandboxes.candidate-previews.create` | Materialize a preview from an exact artifact digest. | Preview create | Candidate descriptor with expiry/access/verification. |
| `sandboxes.candidate-previews.delete` | Revoke and remove one candidate preview. | Preview delete | Revoked descriptor. |

Artifact capture rejects active Runs, unsafe paths/links/entry kinds, policy-classified secrets and
content changes observed during capture. It never captures Sandbox process, memory or secret state.

## Promotion

| Operation | Intent | Required identity/scope | Result |
| --- | --- | --- | --- |
| `sandboxes.promotions.plan` | Bind exact artifact/candidate and explicit new Resource target into an expiring plan. | Promotion plan | Planned Promotion descriptor. |
| `sandboxes.promotions.accept` | Persist external approval and start idempotent durable work. | Publish/Promotion accept | Accepted/in-progress Promotion descriptor. |
| `sandboxes.promotions.retry` | Retry a failed Promotion using the same Resource and artifact. | Publish/Promotion accept | New Deployment attempt correlation. |

Accept requires `promotionId`, `expectedArtifactDigest` and `idempotencyKey`. The target contains
project, environment, destination, Resource name, runtime/network/health intent required by existing
Resource/Deployment commands. First-slice plan always creates a new Resource.

## Error And Consistency Rules

- Commands persist accepted state before invoking harness, ArtifactStore, preview or deployment side effects.
- Duplicate idempotency input returns the original descriptor.
- Partial Promotion results remain observable and are never silently compensated by deleting the Resource.
- Expected failures use the stable codes in `errors/sandbox-agent-runtime-and-promotion.md`.
