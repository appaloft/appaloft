# Discovery: Deployment Runtime Ownership Reconciliation

## Existing Evidence

- Deployment replacement already records `supersedesDeploymentId` and the SSH adapter attempts
  exact, label-scoped cleanup after candidate verification.
- `DEP-CREATE-ASYNC-012A` already requires replacement to target the previous runtime-owning
  attempt, but the retry use case selects the latest attempt instead.
- Failed SSH Compose deployments attempt compensating container cleanup, but cleanup failure and
  exact readback are not durable lifecycle facts.
- Server capacity protection treats the newest successful deployment for every historical Resource
  as active unless that Resource is explicitly archived. A missing Resource is therefore protected
  even though it is absent from desired state.
- Capacity inspection emits ownership inventory, but its Docker inspect delimiter is not parsed as
  a real tab on the observed provider.
- Preview cleanup has durable retry state. Generic deployment replacement and orphan cleanup do not.

## Owner-Confirmed Decisions

| Topic | Decision |
| --- | --- |
| Desired state | A runtime is current only when its Resource exists and the deployment is the current runtime owner. |
| Missing Resource | A fully labelled runtime whose Resource no longer exists is an orphan candidate, not an active runtime. |
| Route safety | Route promotion and cleanup are fenced by exact Resource and Deployment ids; the current route target is never a cleanup candidate. |
| Rollback | Explicit rollback candidates and retained recovery assets remain protected until retention releases them. |
| Cleanup | Product operations perform exact cleanup, read it back, retry retryable failures, and remain idempotent. |
| Ownership | Containers, networks, images, workspaces, and volumes require Appaloft ownership evidence; shared or unrelated assets are preserved. |
| Consumers | Dev Seed and Preview cleanup call the same product lifecycle boundary and verify no owned runtime remains. |
| Placement | Neutral lifecycle, inventory, reconciliation, and provider behavior belong in public Appaloft. Hosted authorization, policy, audit, and Server composition remain private. |

The owner confirmed the cleanup manifest and these semantics on 2026-07-28 and authorized Spec,
tickets, Code, and production readback.
