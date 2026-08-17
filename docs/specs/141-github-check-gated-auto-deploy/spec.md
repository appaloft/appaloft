# GitHub Check-Gated Auto Deploy

## Status

Spec confirmed for the first explicit named-check gate slice.

## Governing Sources

- [Discovery](./discovery.md)
- [ADR-121: Source Event Required Check Gate](../../decisions/ADR-121-source-event-required-check-gate.md)
- [ADR-037: Source Event Auto Deploy Ownership](../../decisions/ADR-037-source-event-auto-deploy-ownership.md)
- [ADR-069: Repository Config Auto-Deploy Policy](../../decisions/ADR-069-repository-config-auto-deploy-policy.md)
- [Source Binding And Auto Deploy](../042-source-binding-auto-deploy/spec.md)
- [Test Matrix](../../testing/github-check-gated-auto-deploy-test-matrix.md)

## Actor And Outcome

An operator names required CI checks on a GitHub-backed Resource auto-deploy policy. A verified push
for an exact revision is retained as waiting and creates no deployment for that Resource until all
required checks report an accepted completed conclusion. CLI/API/Web/source-event diagnostics show
waiting, blocked, superseded and dispatched outcomes without exposing raw webhook payloads.

## Policy

`git-push` policy adds optional `requiredChecks: string[]`.

- Names are trimmed, unique, case-sensitive and bounded to 50 entries of at most 200 characters.
- Omission or an empty list preserves immediate dispatch.
- Generic signed webhook policy cannot set required checks.
- The first active provider adapter is GitHub; branch-protection policy is not read or mirrored.
- Repository config uses the same `requiredChecks` field and drift comparison as explicit commands.

## Check Lifecycle

1. A verified matching GitHub push is persisted before any deployment dispatch.
2. Policy matches without required checks dispatch immediately as today.
3. Policy matches with required checks enter `waiting-checks` for the exact repository/revision.
4. Verified `check_run.completed` deliveries update only matching GitHub repository/revision gates.
5. `success`, `neutral` and `skipped` satisfy a named requirement. `failure`, `cancelled`,
   `timed_out`, `action_required` and `stale` block it. Incomplete actions are rejected or no-op.
6. The newest completed observation for one check wins by provider completion time and check-run id;
   an older out-of-order delivery cannot overwrite newer evidence.
7. A later successful rerun may replace failure evidence and complete the gate.
8. Satisfying all names atomically claims that Resource policy result for dispatch. Duplicate or
   concurrent deliveries cannot create a second deployment.
9. A newer matching push supersedes older undispatched check-gated results for the same
   Resource/ref. A check for the older SHA cannot revive them.
10. No timer, timeout, polling, branch-protection read or automatic background retry is implied.

## Acceptance Criteria

| ID | Scenario | Expected result |
| --- | --- | --- |
| `CHECK-GATE-SPEC-001` | Operator configures explicit required check names. | Domain, persistence, resource readback, repo config, CLI/API/Web and SDK metadata preserve the same normalized names. |
| `CHECK-GATE-SPEC-002` | Matching push has no required checks. | Existing immediate one-deployment behavior remains. |
| `CHECK-GATE-SPEC-003` | Matching push requires two checks and only one has passed. | Source event is `waiting-checks`; no deployment is created for that Resource. |
| `CHECK-GATE-SPEC-004` | All named checks complete with `success`, `neutral` or `skipped`. | Exactly one deployment is dispatched for the exact push revision. |
| `CHECK-GATE-SPEC-005` | Required check completes with a failure-like conclusion. | Result is `checks-blocked`; no deployment is created, and safe diagnostics name the check/conclusion. |
| `CHECK-GATE-SPEC-006` | Failed check is rerun successfully. | Newer successful evidence replaces the failure and may complete the gate. |
| `CHECK-GATE-SPEC-007` | Same webhook delivery or concurrent final checks are redelivered. | Delivery dedupe and atomic claim prevent duplicate deployment. |
| `CHECK-GATE-SPEC-008` | Older completion arrives after a newer completion. | Newer check evidence remains authoritative. |
| `CHECK-GATE-SPEC-009` | New matching push arrives while an older revision waits. | Older undispatched Resource/ref result becomes `superseded`; old-SHA checks cannot dispatch it. |
| `CHECK-GATE-SPEC-010` | One GitHub push fans out to Resources with different policies. | Each policy result progresses independently; immediate and gated Resources do not block each other. |
| `CHECK-GATE-SPEC-011` | Check webhook has invalid signature, unsupported action or unsafe payload. | Reject/no-op occurs before mutation; raw payload/signature and provider secrets are not persisted. |
| `CHECK-GATE-SPEC-012` | Operator inspects list/show/Web diagnostics. | Waiting, blocking check name/conclusion, supersession and deployment ids are safe and scoped. |

## Public Surfaces

- Existing `resources.configure-auto-deploy` command/result and `resources.show` gain
  `requiredChecks` for `git-push` policy.
- Repository `appaloft.yaml` auto-deploy shape gains `requiredChecks`.
- CLI configure flags, HTTP/oRPC schemas, Web Resource settings and generated SDK metadata remain
  schema-parity surfaces.
- `POST /api/integrations/github/source-events` accepts verified `check_run` completed deliveries
  through the existing provider webhook secret boundary.
- Source-event list/show/Web diagnostics expose safe gate summaries, not raw webhook bodies.

## Compatibility And Migration

- Existing policies deserialize with no required checks and remain immediate.
- Existing source events remain valid without gate state.
- Persistence migration adds durable check-gate/delivery state without rewriting historical rows.
- No changes are made to `deployments.create` input.

## Non-Goals

- Dynamic GitHub branch-protection/ruleset mirroring.
- Commit status API support, GitLab pipelines or other provider adapters.
- Clock-based timeout, polling, scheduled retry or a source-event worker guarantee.
- Requiring successful Appaloft deployment checks created by Appaloft itself.
